// Package config parses application configuration from environment variables.
package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
)

// Config holds process-wide settings. It grows as features land.
type Config struct {
	Env              string // "development" or "production"
	Addr             string // listen address, for example ":8085"
	DatabaseURL      string // PostgreSQL connection URL; no default, so a missing value fails loudly
	FetchConcurrency int    // maximum concurrent page fetches (NFR-12)
	AppBaseURL       string // the app's origin as the browser sees it, no trailing slash
	AuthDevLogin     bool   // enables the Kinde-free dev login; development only
}

// Load reads configuration from the environment, applying defaults suited to local development.
func Load() Config {
	return Config{
		Env:              getenv("APP_ENV", "development"),
		Addr:             getenv("HTTP_ADDR", ":8085"),
		DatabaseURL:      getenv("DATABASE_URL", ""),
		FetchConcurrency: getenvInt("FETCH_CONCURRENCY", 4),
		AppBaseURL:       strings.TrimRight(getenv("APP_BASE_URL", "http://localhost:5175"), "/"),
		AuthDevLogin:     getenv("AUTH_DEV_LOGIN", "") == "true",
	}
}

// Validate rejects combinations that must never run, so a bad setting stops the
// process at startup instead of weakening it silently.
func (c Config) Validate() error {
	if c.AuthDevLogin && c.Env != "development" {
		return errors.New("AUTH_DEV_LOGIN=true is only allowed when APP_ENV=development")
	}
	return nil
}

// CookieSecure reports whether auth cookies should carry the Secure flag: whenever the
// app is served over https.
func (c Config) CookieSecure() bool {
	return strings.HasPrefix(c.AppBaseURL, "https://")
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
