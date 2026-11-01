// Command migrate applies database migrations. Run it with `make migrate`.
package main

import (
	"context"
	"flag"
	"log"

	"marker/internal/platform/config"
	"marker/internal/platform/migrate"
)

func main() {
	dir := flag.String("dir", "migration", "folder containing the numbered SQL migrations")
	flag.Parse()

	cfg := config.Load()
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is not set (copy .env.example to .env and run through make)")
	}

	if err := migrate.Up(context.Background(), cfg.DatabaseURL, *dir); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	log.Print("migrations applied")
}
