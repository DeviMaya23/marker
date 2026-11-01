// Package migrate applies database migrations: the app's own (golang-migrate) first,
// then River's (its own migrator). The two are independent and track their versions
// in separate tables.
package migrate

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // registers the pgx5:// scheme
	_ "github.com/golang-migrate/migrate/v4/source/file"     // registers the file:// source
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
)

// Up applies all pending migrations. dir is the folder holding the numbered SQL files.
func Up(ctx context.Context, databaseURL, dir string) error {
	if err := appUp(databaseURL, dir); err != nil {
		return fmt.Errorf("app migrations: %w", err)
	}
	if err := riverUp(ctx, databaseURL); err != nil {
		return fmt.Errorf("river migrations: %w", err)
	}
	return nil
}

func appUp(databaseURL, dir string) error {
	m, err := migrate.New("file://"+dir, golangMigrateURL(databaseURL))
	if err != nil {
		return err
	}
	defer m.Close()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}
	return nil
}

func riverUp(ctx context.Context, databaseURL string) error {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	migrator, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		return err
	}
	_, err = migrator.Migrate(ctx, rivermigrate.DirectionUp, nil)
	return err
}

// golangMigrateURL rewrites a postgres:// URL to the scheme the pgx v5 driver registers.
func golangMigrateURL(databaseURL string) string {
	for _, prefix := range []string{"postgresql://", "postgres://"} {
		if strings.HasPrefix(databaseURL, prefix) {
			return "pgx5://" + strings.TrimPrefix(databaseURL, prefix)
		}
	}
	return databaseURL
}
