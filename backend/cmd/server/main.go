package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/google/uuid"

	"marker/internal/handler"
	"marker/internal/platform/config"
	"marker/internal/platform/database"
	"marker/internal/repository"
	"marker/internal/worker"
)

func main() {
	cfg := config.Load()
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

	queue, err := worker.New(pool, worker.Deps{
		Fetcher: placeholderFetcher{},
		Pending: repository.NewBookmarkRepository(db),
	}, worker.Options{FetchConcurrency: cfg.FetchConcurrency})
	if err != nil {
		log.Fatalf("queue: %v", err)
	}
	if err := queue.Start(ctx); err != nil {
		log.Fatalf("queue start: %v", err)
	}

	e := handler.NewRouter()
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

// placeholderFetcher stands in until the save-a-URL slice adds the real fetch
// usecase. It does nothing, so bookmarks stay pending; the slice replaces it.
type placeholderFetcher struct{}

func (placeholderFetcher) Fetch(_ context.Context, id uuid.UUID) error {
	log.Printf("fetch for bookmark %s: not implemented yet", id)
	return nil
}
