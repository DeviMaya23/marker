package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
)

const testOrigin = "http://localhost:5175"

// runMiddleware sends req through mw to a handler that succeeds, and returns mw's error.
func runMiddleware(mw echo.MiddlewareFunc, req *http.Request) error {
	c := echo.New().NewContext(req, httptest.NewRecorder())
	return mw(func(echo.Context) error { return nil })(c)
}

func newRequest(method, origin, cookie, header string) *http.Request {
	req := httptest.NewRequest(method, "/api/v1/bookmarks", nil)
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: CSRFCookie, Value: cookie})
	}
	if header != "" {
		req.Header.Set(CSRFHeader, header)
	}
	return req
}

func TestCSRF_SafeMethodsNeedNoToken(t *testing.T) {
	for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodOptions} {
		t.Run(method, func(t *testing.T) {
			require.NoError(t, runMiddleware(CSRF(testOrigin), newRequest(method, "", "", "")))
		})
	}
}

func TestCSRF_StateChangingRequests(t *testing.T) {
	tests := []struct {
		name    string
		method  string
		origin  string
		cookie  string
		header  string
		wantErr bool
	}{
		{"valid POST", http.MethodPost, testOrigin, "tok", "tok", false},
		{"valid PATCH", http.MethodPatch, testOrigin, "tok", "tok", false},
		{"valid DELETE", http.MethodDelete, testOrigin, "tok", "tok", false},
		{"missing header", http.MethodPost, testOrigin, "tok", "", true},
		{"missing cookie", http.MethodPost, testOrigin, "", "tok", true},
		{"header differs from cookie", http.MethodPost, testOrigin, "tok", "other", true},
		{"missing origin", http.MethodPost, "", "tok", "tok", true},
		{"foreign origin", http.MethodPost, "https://evil.example", "tok", "tok", true},
		{"origin with a different port", http.MethodPost, "http://localhost:9999", "tok", "tok", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := runMiddleware(CSRF(testOrigin), newRequest(tt.method, tt.origin, tt.cookie, tt.header))
			if tt.wantErr {
				require.ErrorIs(t, err, ErrCSRFFailed)
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestCSRF_EmptyConfiguredOriginRejectsEverything(t *testing.T) {
	// A misconfigured (empty) origin must fail closed, not match a missing Origin header.
	err := runMiddleware(CSRF(""), newRequest(http.MethodPost, "", "tok", "tok"))
	require.ErrorIs(t, err, ErrCSRFFailed)
}
