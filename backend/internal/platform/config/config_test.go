package config

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// oidcConfig returns a fully set OIDC configuration; mutate it per case.
func oidcConfig(mutate func(*Config)) Config {
	c := Config{
		Env:              "production",
		AppBaseURL:       "https://marker.example",
		OIDCIssuerURL:    "https://idp.example",
		OIDCClientID:     "client-id-value",
		OIDCClientSecret: "client-secret-value",
		OIDCLogoutURL:    "https://idp.example/logout",
		AuthStateSecret:  strings.Repeat("s", 32),

		ProxySharedSecret: strings.Repeat("p", 32),
	}
	if mutate != nil {
		mutate(&c)
	}
	return c
}

func TestConfig_Validate(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Config
		wantErr bool
	}{
		{"dev login in development", Config{Env: "development", AuthDevLogin: true}, false},
		{"production with OIDC fully set", oidcConfig(nil), false},
		{"development with OIDC and dev login", oidcConfig(func(c *Config) {
			c.Env = "development"
			c.AppBaseURL = "http://localhost:5175"
			c.AuthDevLogin = true
		}), false},
		{"development with OIDC over http", oidcConfig(func(c *Config) {
			c.Env = "development"
			c.AppBaseURL = "http://localhost:5175"
		}), false},
		{"logout redirect parameter alone is not an error", Config{Env: "development", AuthDevLogin: true, OIDCLogoutRedirectParam: "redirect"}, false},
		{"state secret of exactly 32 bytes", oidcConfig(func(c *Config) { c.AuthStateSecret = strings.Repeat("s", 32) }), false},
		{"neither OIDC nor dev login", Config{Env: "development"}, true},
		{"production with neither OIDC nor dev login", Config{Env: "production"}, true},
		{"dev login in production", Config{Env: "production", AuthDevLogin: true}, true},
		{"dev login in production with OIDC", oidcConfig(func(c *Config) { c.AuthDevLogin = true }), true},
		{"dev login with an unrecognised environment", Config{Env: "staging", AuthDevLogin: true}, true},
		{"dev login with an empty environment", Config{AuthDevLogin: true}, true},
		{"state secret of 31 bytes", oidcConfig(func(c *Config) { c.AuthStateSecret = strings.Repeat("s", 31) }), true},
		{"issuer not a URL", oidcConfig(func(c *Config) { c.OIDCIssuerURL = "idp.example" }), true},
		{"issuer with another scheme", oidcConfig(func(c *Config) { c.OIDCIssuerURL = "ftp://idp.example" }), true},
		{"logout URL not a URL", oidcConfig(func(c *Config) { c.OIDCLogoutURL = "/logout" }), true},
		{"app base URL not a URL", oidcConfig(func(c *Config) { c.AppBaseURL = "marker.example" }), true},
		{"app base URL with a path", oidcConfig(func(c *Config) { c.AppBaseURL = "https://marker.example/app" }), true},
		{"app base URL with a query", oidcConfig(func(c *Config) { c.AppBaseURL = "https://marker.example?a=1" }), true},
		{"app base URL with a fragment", oidcConfig(func(c *Config) { c.AppBaseURL = "https://marker.example#a" }), true},
		{"app base URL over http in production", oidcConfig(func(c *Config) { c.AppBaseURL = "http://marker.example" }), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.cfg.Validate()
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestConfig_Validate_NamesTheVariableNotItsValue(t *testing.T) {
	tests := []struct {
		name     string
		cfg      Config
		variable string
	}{
		{"missing client id", oidcConfig(func(c *Config) { c.OIDCClientID = "" }), "OIDC_CLIENT_ID"},
		{"missing client secret", oidcConfig(func(c *Config) { c.OIDCClientSecret = "" }), "OIDC_CLIENT_SECRET"},
		{"missing logout URL", oidcConfig(func(c *Config) { c.OIDCLogoutURL = "" }), "OIDC_LOGOUT_URL"},
		{"missing state secret", oidcConfig(func(c *Config) { c.AuthStateSecret = "" }), "AUTH_STATE_SECRET"},
		{"short state secret", oidcConfig(func(c *Config) { c.AuthStateSecret = "short-secret-value" }), "AUTH_STATE_SECRET"},
		{"bad issuer", oidcConfig(func(c *Config) { c.OIDCIssuerURL = "issuer-value" }), "OIDC_ISSUER_URL"},
		{"bad logout URL", oidcConfig(func(c *Config) { c.OIDCLogoutURL = "logout-value" }), "OIDC_LOGOUT_URL"},
		{"bad app base URL", oidcConfig(func(c *Config) { c.AppBaseURL = "base-value" }), "APP_BASE_URL"},
		{"http app base URL in production", oidcConfig(func(c *Config) { c.AppBaseURL = "http://marker.example" }), "APP_BASE_URL"},
		{"client id without issuer", Config{Env: "development", AuthDevLogin: true, OIDCClientID: "client-id-value"}, "OIDC_CLIENT_ID"},
		{"client secret without issuer", Config{Env: "development", AuthDevLogin: true, OIDCClientSecret: "client-secret-value"}, "OIDC_CLIENT_SECRET"},
		{"logout URL without issuer", Config{Env: "development", AuthDevLogin: true, OIDCLogoutURL: "https://idp.example/logout"}, "OIDC_LOGOUT_URL"},
		{"state secret without issuer", Config{Env: "development", AuthDevLogin: true, AuthStateSecret: strings.Repeat("s", 32)}, "AUTH_STATE_SECRET"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.cfg.Validate()
			require.ErrorContains(t, err, tt.variable)
			for _, secret := range []string{"client-secret-value", "client-id-value", "short-secret-value", "issuer-value", "logout-value", "base-value", strings.Repeat("s", 32)} {
				require.NotContains(t, err.Error(), secret)
			}
		})
	}
}

func TestConfig_CookieSecure(t *testing.T) {
	require.True(t, Config{AppBaseURL: "https://marker.example"}.CookieSecure())
	require.False(t, Config{AppBaseURL: "http://localhost:5175"}.CookieSecure())
}

func TestLoad_AppBaseURLHasNoTrailingSlash(t *testing.T) {
	t.Setenv("APP_BASE_URL", "https://marker.example/")
	require.Equal(t, "https://marker.example", Load().AppBaseURL)
}

func TestLoad_DevLoginIsOffUnlessExplicitlyEnabled(t *testing.T) {
	t.Setenv("AUTH_DEV_LOGIN", "")
	require.False(t, Load().AuthDevLogin)

	t.Setenv("AUTH_DEV_LOGIN", "yes")
	require.False(t, Load().AuthDevLogin, "only the exact value \"true\" enables it")

	t.Setenv("AUTH_DEV_LOGIN", "true")
	require.True(t, Load().AuthDevLogin)
}

func TestLoad_ReadsTheOIDCVariables(t *testing.T) {
	t.Setenv("OIDC_ISSUER_URL", "https://idp.example")
	t.Setenv("OIDC_CLIENT_ID", "the-id")
	t.Setenv("OIDC_CLIENT_SECRET", "the-secret")
	t.Setenv("OIDC_LOGOUT_URL", "https://idp.example/logout")
	t.Setenv("OIDC_LOGOUT_REDIRECT_PARAM", "return")
	t.Setenv("AUTH_STATE_SECRET", "the-state-secret")

	cfg := Load()
	require.Equal(t, "https://idp.example", cfg.OIDCIssuerURL)
	require.Equal(t, "the-id", cfg.OIDCClientID)
	require.Equal(t, "the-secret", cfg.OIDCClientSecret)
	require.Equal(t, "https://idp.example/logout", cfg.OIDCLogoutURL)
	require.Equal(t, "return", cfg.OIDCLogoutRedirectParam)
	require.Equal(t, "the-state-secret", cfg.AuthStateSecret)
	require.True(t, cfg.OIDCEnabled())
}

func TestLoad_OIDCDefaults(t *testing.T) {
	for _, name := range []string{"OIDC_ISSUER_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_LOGOUT_URL", "OIDC_LOGOUT_REDIRECT_PARAM", "AUTH_STATE_SECRET"} {
		t.Setenv(name, "")
	}

	cfg := Load()
	require.Equal(t, "redirect", cfg.OIDCLogoutRedirectParam)
	require.False(t, cfg.OIDCEnabled())
	require.Empty(t, cfg.OIDCIssuerURL)
}

func TestLoad_ClientIPHeader(t *testing.T) {
	t.Setenv("CLIENT_IP_HEADER", "")
	require.Empty(t, Load().ClientIPHeader)

	t.Setenv("CLIENT_IP_HEADER", "CF-Connecting-IP")
	require.Equal(t, "CF-Connecting-IP", Load().ClientIPHeader)
}

func TestConfig_Validate_ClientIPHeader(t *testing.T) {
	configs := map[string]func(header string) Config{
		"dev login only": func(h string) Config {
			return Config{Env: "development", AuthDevLogin: true, ClientIPHeader: h}
		},
		"OIDC": func(h string) Config { return oidcConfig(func(c *Config) { c.ClientIPHeader = h }) },
	}
	for name, build := range configs {
		t.Run(name, func(t *testing.T) {
			require.NoError(t, build("").Validate())
			require.NoError(t, build("CF-Connecting-IP").Validate())
			for _, bad := range []string{"bad header", "a:b", "x_y", "héader"} {
				err := build(bad).Validate()
				require.ErrorContains(t, err, "CLIENT_IP_HEADER", bad)
				require.NotContains(t, err.Error(), bad)
			}
		})
	}
}

func TestLoad_ReadsTheProxySecret(t *testing.T) {
	t.Setenv("PROXY_SHARED_SECRET", "")
	require.Empty(t, Load().ProxySharedSecret)

	t.Setenv("PROXY_SHARED_SECRET", strings.Repeat("k", 40))
	require.Equal(t, strings.Repeat("k", 40), Load().ProxySharedSecret)
}

func TestConfig_Validate_ProxySecret(t *testing.T) {
	dev := func(secret string) Config {
		return Config{Env: "development", AuthDevLogin: true, ProxySharedSecret: secret}
	}
	oidc := func(env, secret string) Config {
		return oidcConfig(func(c *Config) {
			c.Env = env
			c.ProxySharedSecret = secret
			if env != "production" {
				c.AppBaseURL = "http://localhost:5175"
			}
		})
	}
	valid := strings.Repeat("a", 32)

	t.Run("empty is valid in development", func(t *testing.T) {
		require.NoError(t, dev("").Validate())
		require.NoError(t, oidc("development", "").Validate())
	})
	t.Run("32 bytes accepted", func(t *testing.T) {
		require.NoError(t, dev(valid).Validate())
		require.NoError(t, oidc("production", valid).Validate())
	})
	t.Run("production with it empty is rejected", func(t *testing.T) {
		err := oidc("production", "").Validate()
		require.ErrorContains(t, err, "PROXY_SHARED_SECRET must be set when APP_ENV=production")
	})

	rejected := []struct {
		name, value, want string
	}{
		{"31 bytes", strings.Repeat("a", 31), "PROXY_SHARED_SECRET must be at least 32 bytes"},
		{"space", strings.Repeat("a", 20) + " " + strings.Repeat("a", 20), "PROXY_SHARED_SECRET must be visible ASCII"},
		{"trailing newline", valid + "\n", "PROXY_SHARED_SECRET must be visible ASCII"},
		{"tab", strings.Repeat("a", 20) + "\t" + strings.Repeat("a", 20), "PROXY_SHARED_SECRET must be visible ASCII"},
		{"non-ASCII", strings.Repeat("a", 20) + "é" + strings.Repeat("a", 20), "PROXY_SHARED_SECRET must be visible ASCII"},
	}
	for _, tt := range rejected {
		t.Run(tt.name+" is rejected everywhere", func(t *testing.T) {
			for name, cfg := range map[string]Config{
				"dev login":           dev(tt.value),
				"OIDC in development": oidc("development", tt.value),
				"OIDC in production":  oidc("production", tt.value),
			} {
				err := cfg.Validate()
				require.ErrorContains(t, err, tt.want, name)
				require.NotContains(t, err.Error(), tt.value, name)
			}
		})
	}
}
