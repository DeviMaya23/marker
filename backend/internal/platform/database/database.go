// Package database opens the connections to PostgreSQL: GORM for the app's queries
// and a pgx pool for River, which uses pgx directly.
package database

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// Open connects GORM to PostgreSQL using a standard connection URL.
func Open(databaseURL string) (*gorm.DB, error) {
	return gorm.Open(postgres.Open(databaseURL), &gorm.Config{})
}

// NewPool opens a pgx connection pool, used by River.
func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	return pgxpool.New(ctx, databaseURL)
}
