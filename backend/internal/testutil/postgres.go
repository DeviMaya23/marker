//go:build integration

package testutil

import (
	"context"
	"path/filepath"
	"runtime"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gorm.io/gorm"

	"marker/internal/platform/database"
	"marker/internal/platform/migrate"
)

var (
	once      sync.Once
	sharedURL string
	startErr  error
)

// NewDB returns a GORM connection to a PostgreSQL 17 container with all migrations
// applied (the app's and River's).
//
// One container is started per test process and shared by every test, so tests must
// not assume empty tables: create your own users and filter by them. The container is
// removed by testcontainers' reaper when the test process exits.
func NewDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := database.Open(databaseURL(t))
	require.NoError(t, err)
	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

// NewPool returns a pgx pool to the same shared database, for code that uses pgx
// directly (River).
func NewPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	pool, err := database.NewPool(context.Background(), databaseURL(t))
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

func databaseURL(t *testing.T) string {
	t.Helper()
	once.Do(func() {
		sharedURL, startErr = startPostgres(context.Background())
	})
	require.NoError(t, startErr)
	return sharedURL
}

func startPostgres(ctx context.Context) (string, error) {
	ctr, err := tcpostgres.Run(ctx, "postgres:17",
		tcpostgres.WithDatabase("marker_test"),
		tcpostgres.WithUsername("marker"),
		tcpostgres.WithPassword("marker"),
		tcpostgres.BasicWaitStrategies(),
	)
	if err != nil {
		return "", err
	}
	url, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		return "", err
	}
	if err := migrate.Up(ctx, url, migrationDir()); err != nil {
		return "", err
	}
	return url, nil
}

// migrationDir locates backend/migration relative to this file, so tests work from any package.
func migrationDir() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "migration")
}
