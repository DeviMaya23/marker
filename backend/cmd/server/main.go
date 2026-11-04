package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"marker/internal/adaptor"
	"marker/internal/handler"
	"marker/internal/handler/middleware"
	"marker/internal/platform/config"
	"marker/internal/platform/database"
	"marker/internal/repository"
	"marker/internal/usecase"
	"marker/internal/worker"
	"marker/pkg/safehttp"
)

func main() {
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("config: %v", err)
	}
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is not set (copy .env.example to .env and run through make)")
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database pool: %v", err)
	}
	defer pool.Close()

	db, err := database.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	if sqlDB, err := db.DB(); err == nil {
		defer sqlDB.Close()
	}

	bookmarkRepo := repository.NewBookmarkRepository(db)
	// One SSRF-safe client for every outbound fetch of a user-supplied URL.
	pageFetcher := adaptor.NewPageFetcher(safehttp.New())

	queue, err := worker.New(pool, worker.Deps{
		Fetcher: usecase.NewFetchService(bookmarkRepo, pageFetcher),
		Pending: bookmarkRepo,
	}, worker.Options{FetchConcurrency: cfg.FetchConcurrency})
	if err != nil {
		log.Fatalf("queue: %v", err)
	}
	if err := queue.Start(ctx); err != nil {
		log.Fatalf("queue start: %v", err)
	}

	bookmarkService := usecase.NewBookmarkService(bookmarkRepo, repository.NewFolderRepository(db), queue)
	folderRepo := repository.NewFolderRepository(db)
	folderService := usecase.NewFolderService(folderRepo)
	userRepo := repository.NewUserRepository(db)
	syncService := usecase.NewSyncService(userRepo)
	faviconService := usecase.NewFaviconService(repository.NewFaviconRepository(db))
	authService := usecase.NewAuthService(userRepo, repository.NewSessionRepository(db))
	// An untyped nil interface when OIDC is off: the handlers test `login == nil`, which a
	// nil *usecase.LoginService would not satisfy.
	var loginFlow handler.LoginFlow
	if cfg.OIDCEnabled() {
		idp := adaptor.NewOIDCClient(adaptor.OIDCConfig{
			IssuerURL:    cfg.OIDCIssuerURL,
			ClientID:     cfg.OIDCClientID,
			ClientSecret: cfg.OIDCClientSecret,
			RedirectURL:  cfg.AppBaseURL + "/auth/callback",
		})
		loginFlow = usecase.NewLoginService(idp, authService, usecase.LoginConfig{
			StateSecret:         []byte(cfg.AuthStateSecret),
			LogoutURL:           cfg.OIDCLogoutURL,
			LogoutRedirectParam: cfg.OIDCLogoutRedirectParam,
			LogoutReturnURL:     cfg.AppBaseURL + "/",
		})
	}
	deps := handler.Deps{
		Server:    handler.NewServer(bookmarkService, folderService, syncService, faviconService, usecase.NewAccountService(userRepo), loginFlow, cfg.CookieSecure()),
		Auth:      authService,
		AppOrigin: cfg.AppBaseURL,
		Limits:    middleware.NewRateLimits(cfg.ClientIPHeader, nil),
	}
	if cfg.Env == "production" && cfg.ClientIPHeader == "" {
		log.Print("WARNING: CLIENT_IP_HEADER is empty: login limits use the connection address, which behind a proxy is the proxy's address (all users share one bucket)")
	}
	if cfg.AuthDevLogin {
		// Config.Validate already refused this outside APP_ENV=development.
		deps.DevLogin = handler.NewDevLogin(authService, cfg.CookieSecure()).Handle
		log.Print("WARNING: dev login is enabled at /auth/dev-login (development only)")
	}

	e := handler.NewRouter(deps)
	go func() {
		if err := e.Start(cfg.Addr); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()
	log.Printf("listening on %s (env=%s)", cfg.Addr, cfg.Env)

	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := e.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
	if err := queue.Stop(shutdownCtx); err != nil {
		log.Printf("queue stop: %v", err)
	}
}
