package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"

	"marker/internal/api"
	"marker/internal/handler/middleware"
)

const proxySecret = "RouterSecret-AbCdEfGhIjKlMnOpQrSt12"

func withProxySecret(v string) func(*http.Request) {
	return func(r *http.Request) { r.Header.Set(middleware.ProxySecretHeader, v) }
}

func withClientIP(ip string) func(*http.Request) {
	return func(r *http.Request) { r.Header.Set("CF-Connecting-IP", ip) }
}

// countingServer counts the list calls that reach the handler.
type countingServer struct {
	okServer
	listed int
}

func (s *countingServer) ListBookmarks(ctx context.Context, r api.ListBookmarksRequestObject) (api.ListBookmarksResponseObject, error) {
	s.listed++
	return s.okServer.ListBookmarks(ctx, r)
}

func newSecretRouter(srv api.StrictServerInterface, limits *middleware.RateLimits) *echo.Echo {
	return NewRouter(Deps{
		Server:      srv,
		Auth:        fixedAuth{},
		AppOrigin:   testOrigin,
		Limits:      limits,
		ProxySecret: proxySecret,
	})
}

func TestProxySecret_RouterRefusesWithoutTheHeader(t *testing.T) {
	srv := &countingServer{}
	e := newSecretRouter(srv, nil)

	rec := do(e, http.MethodGet, "/api/v1/bookmarks", withSession(tokenA))
	requireProblem(t, rec, http.StatusNotFound, api.ErrorCodeNotFound)
	require.Zero(t, srv.listed, "the handler must not run")

	rec = do(e, http.MethodGet, "/api/v1/bookmarks", withSession(tokenA), withProxySecret(proxySecret))
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, 1, srv.listed)
}

func TestProxySecret_RefusedAnswerIsTheUnknownRouteAnswer(t *testing.T) {
	e := newSecretRouter(okServer{}, nil)

	unknown := do(e, http.MethodGet, "/no/such/path", withProxySecret(proxySecret))
	requireProblem(t, unknown, http.StatusNotFound, api.ErrorCodeNotFound)

	const supplied = "supplied-wrong-value-0123456789"
	for name, opts := range map[string][]func(*http.Request){
		"no header":    nil,
		"wrong header": {withProxySecret(supplied)},
	} {
		refused := do(e, http.MethodGet, "/api/v1/bookmarks", append([]func(*http.Request){withSession(tokenA)}, opts...)...)
		require.Equal(t, unknown.Code, refused.Code, name)
		require.Equal(t, unknown.Header().Get("Content-Type"), refused.Header().Get("Content-Type"), name)
		require.Equal(t, unknown.Body.Bytes(), refused.Body.Bytes(), name)
		require.Empty(t, refused.Header().Get("Retry-After"))
		require.Empty(t, refused.Header().Get("WWW-Authenticate"))
		require.NotContains(t, refused.Body.String(), proxySecret, name)
		require.NotContains(t, refused.Body.String(), supplied, name)
	}

	unknownNoHeader := do(e, http.MethodGet, "/no/such/path")
	require.Equal(t, unknown.Body.Bytes(), unknownNoHeader.Body.Bytes())
	require.Equal(t, http.StatusNotFound, unknownNoHeader.Code)
}

func TestProxySecret_RunsBeforeEverythingElse(t *testing.T) {
	e := newSecretRouter(okServer{}, middleware.NewRateLimits("", frozenClock()))

	t.Run("no session answers 404, not 401", func(t *testing.T) {
		requireProblem(t, do(e, http.MethodGet, "/api/v1/bookmarks"), http.StatusNotFound, api.ErrorCodeNotFound)
	})

	t.Run("a bad CSRF token answers 404, not 403", func(t *testing.T) {
		rec := do(e, http.MethodPost, "/api/v1/bookmarks", withSession(tokenA), func(r *http.Request) {
			r.Header.Set("Origin", "https://evil.example")
			r.Header.Set(middleware.CSRFHeader, "wrong")
		})
		requireProblem(t, rec, http.StatusNotFound, api.ErrorCodeNotFound)
	})

	t.Run("an oversized body answers 404, not 413", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/bookmarks", strings.NewReader(strings.Repeat("a", 64*1024+1)))
		req.Header.Set("Content-Type", "application/json")
		withSession(tokenA)(req)
		withCSRF()(req)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		requireProblem(t, rec, http.StatusNotFound, api.ErrorCodeNotFound)
	})
}

func TestProxySecret_RefusedRequestsTakeNoRateLimitToken(t *testing.T) {
	e := newSecretRouter(okServer{}, middleware.NewRateLimits("", frozenClock()))
	for i := 0; i < 20; i++ {
		requireProblem(t, login(e), http.StatusNotFound, api.ErrorCodeNotFound)
	}
	for i := 0; i < middleware.LoginPerMinute; i++ {
		requirePassed(t, login(e, withProxySecret(proxySecret)))
	}
	requireRateLimited(t, login(e, withProxySecret(proxySecret)))
}

func TestProxySecret_AForgedClientIPIsNeverUsed(t *testing.T) {
	e := newSecretRouter(okServer{}, middleware.NewRateLimits("CF-Connecting-IP", frozenClock()))

	for i := 0; i < 20; i++ {
		ip := "198.51.100." + string(rune('0'+i/10)) + string(rune('0'+i%10))
		requireProblem(t, login(e, withClientIP(ip)), http.StatusNotFound, api.ErrorCodeNotFound)
	}
	for i := 0; i < middleware.LoginPerMinute; i++ {
		requirePassed(t, login(e, withProxySecret(proxySecret), withClientIP("203.0.113.9")))
	}
	requireRateLimited(t, login(e, withProxySecret(proxySecret), withClientIP("203.0.113.9")))
}

func TestProxySecret_HealthzAndCallback(t *testing.T) {
	e := newSecretRouter(okServer{}, nil)
	require.Equal(t, http.StatusOK, do(e, http.MethodGet, "/healthz").Code)
	requireProblem(t, callback(e), http.StatusNotFound, api.ErrorCodeNotFound)
}

func TestProxySecret_EmptyMeansNothingIsRefused(t *testing.T) {
	e := NewRouter(Deps{Server: okServer{}, Auth: fixedAuth{}, AppOrigin: testOrigin})
	require.Equal(t, http.StatusOK, do(e, http.MethodGet, "/api/v1/bookmarks", withSession(tokenA)).Code)
}

func TestProxySecret_WithoutAServerOnlyTheOperationalRoutesAreGuarded(t *testing.T) {
	e := NewRouter(Deps{ProxySecret: proxySecret})
	requireProblem(t, do(e, http.MethodGet, "/no/such/path"), http.StatusNotFound, api.ErrorCodeNotFound)
	requireProblem(t, do(e, http.MethodPost, "/healthz"), http.StatusNotFound, api.ErrorCodeNotFound)
	require.Equal(t, http.StatusOK, do(e, http.MethodGet, "/healthz").Code)
}
