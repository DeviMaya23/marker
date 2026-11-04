// Package config parses application configuration from environment variables.
package config

import (
	"errors"
	"fmt"
	"net/url"
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

	OIDCIssuerURL           string // the IdP issuer, exactly as published; setting it enables OIDC login
	OIDCClientID            string
	OIDCClientSecret        string // never logged
	OIDCLogoutURL           string // the IdP logout endpoint
	OIDCLogoutRedirectParam string // name of the logout endpoint's return-address parameter
	AuthStateSecret         string // key that signs the login state; its own bytes, at least minStateSecretLen
}

// minStateSecretLen is the least length in bytes of AUTH_STATE_SECRET.
const minStateSecretLen = 32

// Load reads configuration from the environment, applying defaults suited to local development.
func Load() Config {
	return Config{
		Env:              getenv("APP_ENV", "development"),
		Addr:             getenv("HTTP_ADDR", ":8085"),
		DatabaseURL:      getenv("DATABASE_URL", ""),
		FetchConcurrency: getenvInt("FETCH_CONCURRENCY", 4),
		AppBaseURL:       strings.TrimRight(getenv("APP_BASE_URL", "http://localhost:5175"), "/"),
		AuthDevLogin:     getenv("AUTH_DEV_LOGIN", "") == "true",

		OIDCIssuerURL:           getenv("OIDC_ISSUER_URL", ""),
		OIDCClientID:            getenv("OIDC_CLIENT_ID", ""),
		OIDCClientSecret:        getenv("OIDC_CLIENT_SECRET", ""),
		OIDCLogoutURL:           getenv("OIDC_LOGOUT_URL", ""),
		OIDCLogoutRedirectParam: getenv("OIDC_LOGOUT_REDIRECT_PARAM", "redirect"),
		AuthStateSecret:         getenv("AUTH_STATE_SECRET", ""),
	}
}

// OIDCEnabled reports whether login through the identity provider is configured: it is
// enabled exactly when the issuer is set.
func (c Config) OIDCEnabled() bool {
	return c.OIDCIssuerURL != ""
}

// Validate rejects combinations that must never run, so a bad setting stops the
// process at startup instead of weakening it silently. Errors name a variable, never
// its value.
func (c Config) Validate() error {
	if c.AuthDevLogin && c.Env != "development" {
		return errors.New("AUTH_DEV_LOGIN=true is only allowed when APP_ENV=development")
	}

	if !c.OIDCEnabled() {
		for _, v := range []struct{ name, value string }{
			{"OIDC_CLIENT_ID", c.OIDCClientID},
			{"OIDC_CLIENT_SECRET", c.OIDCClientSecret},
			{"OIDC_LOGOUT_URL", c.OIDCLogoutURL},
			{"AUTH_STATE_SECRET", c.AuthStateSecret},
		} {
			if v.value != "" {
				return fmt.Errorf("%s is set but OIDC_ISSUER_URL is not", v.name)
			}
		}
		if !c.AuthDevLogin {
			return errors.New("no way to sign in: set the OIDC_* variables, or AUTH_DEV_LOGIN=true in development")
		}
		return nil
	}

	for _, v := range []struct{ name, value string }{
		{"OIDC_CLIENT_ID", c.OIDCClientID},
		{"OIDC_CLIENT_SECRET", c.OIDCClientSecret},
		{"OIDC_LOGOUT_URL", c.OIDCLogoutURL},
		{"AUTH_STATE_SECRET", c.AuthStateSecret},
	} {
		if v.value == "" {
			return fmt.Errorf("%s must be set when OIDC_ISSUER_URL is set", v.name)
		}
	}
	if len(c.AuthStateSecret) < minStateSecretLen {
		return fmt.Errorf("AUTH_STATE_SECRET must be at least %d bytes", minStateSecretLen)
	}
	if !absoluteHTTPURL(c.OIDCIssuerURL) {
		return errors.New("OIDC_ISSUER_URL must be an absolute http or https URL")
	}
	if !absoluteHTTPURL(c.OIDCLogoutURL) {
		return errors.New("OIDC_LOGOUT_URL must be an absolute http or https URL")
	}
	base, err := url.Parse(c.AppBaseURL)
	if err != nil || !absoluteHTTPURL(c.AppBaseURL) ||
		(base.Path != "" && base.Path != "/") || base.RawQuery != "" || base.Fragment != "" {
		return errors.New("APP_BASE_URL must be an absolute http or https origin with no path, query or fragment")
	}
	if c.Env == "production" && base.Scheme != "https" {
		return errors.New("APP_BASE_URL must be https when APP_ENV=production")
	}
	return nil
}

// absoluteHTTPURL reports whether raw is an http or https URL with a host.
func absoluteHTTPURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
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
