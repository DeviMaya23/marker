// Package config parses application configuration from environment variables.
package config

import "os"

// Config holds process-wide settings. It grows as features land.
type Config struct {
	Env  string // "development" or "production"
	Addr string // listen address, for example ":8080"
}

// Load reads configuration from the environment, applying defaults suited to local development.
func Load() Config {
	return Config{
		Env:  getenv("APP_ENV", "development"),
		Addr: getenv("HTTP_ADDR", ":8085"),
	}
}

func getenv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
