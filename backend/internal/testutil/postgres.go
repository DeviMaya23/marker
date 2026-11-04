//go:build integration

package testutil

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
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
// If TEST_DATABASE_URL is set, the server it points to is used instead of a container
// (for environments without Docker; see scripts/test-integration-local.sh). Each test
// process creates its own fresh database there, because `go test ./...` runs packages
// as parallel processes and they must not migrate one schema at once. The app's and
// River's migrations are applied to it in the same way. The databases are not dropped
// by the tests; the script discards the whole server.
//
// One database is used per test process and shared by every test, so tests must
// not assume empty tables: create your own users and filter by them. A container is
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
	if serverURL := os.Getenv("TEST_DATABASE_URL"); serverURL != "" {
		url, err := createProcessDatabase(ctx, serverURL)
		if err != nil {
			return "", err
		}
		if err := migrate.Up(ctx, url, migrationDir()); err != nil {
			return "", err
		}
		return url, nil
	}
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

// createProcessDatabase creates a uniquely named database on the server that
// TEST_DATABASE_URL points to and returns a URL for it.
func createProcessDatabase(ctx context.Context, serverURL string) (string, error) {
	conn, err := pgx.Connect(ctx, serverURL)
	if err != nil {
		return "", fmt.Errorf("connect to TEST_DATABASE_URL: %w", err)
	}
	defer conn.Close(ctx)

	name := fmt.Sprintf("marker_test_%d_%d", os.Getpid(), time.Now().UnixNano())
	if _, err := conn.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{name}.Sanitize()); err != nil {
		return "", fmt.Errorf("create test database: %w", err)
	}

	u, err := url.Parse(serverURL)
	if err != nil {
		return "", err
	}
	u.Path = "/" + name
	return u.String(), nil
}
