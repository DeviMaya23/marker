package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"marker/internal/handler"
	"marker/internal/platform/config"
)

func main() {
	cfg := config.Load()
	e := handler.NewRouter()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

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
		log.Fatalf("shutdown: %v", err)
	}
}
