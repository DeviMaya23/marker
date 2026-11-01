// Package config parses application configuration from environment variables.
package config

import (
	"os"
	"strconv"
)

// Config holds process-wide settings. It grows as features land.
type Config struct {
	Env              string // "development" or "production"
	Addr             string // listen address, for example ":8085"
	DatabaseURL      string // PostgreSQL connection URL; no default, so a missing value fails loudly
	FetchConcurrency int    // maximum concurrent page fetches (NFR-12)
}

// Load reads configuration from the environment, applying defaults suited to local development.
func Load() Config {
	return Config{
		Env:              getenv("APP_ENV", "development"),
		Addr:             getenv("HTTP_ADDR", ":8085"),
		DatabaseURL:      getenv("DATABASE_URL", ""),
		FetchConcurrency: getenvInt("FETCH_CONCURRENCY", 4),
	}
}

func getenv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

// getenvInt returns the variable as a positive integer, or fallback if it is unset or invalid.
func getenvInt(key string, fallback int) int {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}
