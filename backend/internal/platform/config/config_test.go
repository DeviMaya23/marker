package config

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestConfig_Validate(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Config
		wantErr bool
	}{
		{"dev login in development", Config{Env: "development", AuthDevLogin: true}, false},
		{"no dev login in production", Config{Env: "production"}, false},
		{"dev login in production", Config{Env: "production", AuthDevLogin: true}, true},
		{"dev login with an unrecognised environment", Config{Env: "staging", AuthDevLogin: true}, true},
		{"dev login with an empty environment", Config{AuthDevLogin: true}, true},
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
