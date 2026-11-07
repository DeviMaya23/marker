package middleware

import (
	"crypto/sha256"
	"crypto/subtle"
	"net/http"

	"github.com/labstack/echo/v4"
)

const (
	// ProxySecretHeader is the header the trusted proxy sends with the shared secret.
	ProxySecretHeader = "X-Proxy-Secret"
	// healthPath is the one route answered without the secret (Cloud Run's startup probe
	// cannot send a header).
	healthPath = "/health"
)

// ProxySecret refuses with 404 every request that does not carry the shared secret in
// X-Proxy-Secret, except GET /health. It keeps callers who reach the server directly,
// around the proxy, from forging the client IP header that the login limit trusts.
// It must be the first middleware (before body limit, sessions, CSRF and rate limits).
// The secret is compared as SHA-256 digests in constant time and is never logged.
func ProxySecret(secret string) echo.MiddlewareFunc {
	want := sha256.Sum256([]byte(secret))
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			r := c.Request()
			if r.Method == http.MethodGet && r.URL.Path == healthPath && r.URL.RawPath == "" {
				return next(c)
			}
			got := sha256.Sum256([]byte(r.Header.Get(ProxySecretHeader)))
			if subtle.ConstantTimeCompare(got[:], want[:]) != 1 {
				return echo.ErrNotFound
			}
			return next(c)
		}
	}
}
