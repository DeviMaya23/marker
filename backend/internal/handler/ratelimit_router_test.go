package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/handler/middleware"
)

const (
	tokenA = "token-a"
	tokenB = "token-b"
)

var (
	userA = uuid.MustParse("00000000-0000-7000-8000-00000000000a")
	userB = uuid.MustParse("00000000-0000-7000-8000-00000000000b")
)

// fixedAuth maps a session token to a fixed user, so one user can make many requests.
type fixedAuth struct{}

func (fixedAuth) Authenticate(_ context.Context, token string) (domain.Session, error) {
	switch token {
	case tokenA:
		return domain.Session{ID: uuid.New(), UserID: userA}, nil
	case tokenB:
		return domain.Session{ID: uuid.New(), UserID: userB}, nil
	}
	return domain.Session{}, domain.ErrUnauthenticated
}

// okServer implements only the operations these tests call; each returns its plain
// success response. The embedded interface is nil, so any other operation panics.
type okServer struct{ api.StrictServerInterface }

func (okServer) CreateBookmark(context.Context, api.CreateBookmarkRequestObject) (api.CreateBookmarkResponseObject, error) {
	return api.CreateBookmark201JSONResponse{}, nil
}

func (okServer) ListBookmarks(context.Context, api.ListBookmarksRequestObject) (api.ListBookmarksResponseObject, error) {
	return api.ListBookmarks200JSONResponse{}, nil
}

func (okServer) GetSyncVersion(context.Context, api.GetSyncVersionRequestObject) (api.GetSyncVersionResponseObject, error) {
	return api.GetSyncVersion200JSONResponse{}, nil
}

func (okServer) AuthLogin(context.Context, api.AuthLoginRequestObject) (api.AuthLoginResponseObject, error) {
	return api.AuthLogin302Response{}, nil
}

func (okServer) AuthCallback(context.Context, api.AuthCallbackRequestObject) (api.AuthCallbackResponseObject, error) {
	return api.AuthCallback302Response{}, nil
}

func (okServer) AuthLogout(context.Context, api.AuthLogoutRequestObject) (api.AuthLogoutResponseObject, error) {
	return api.AuthLogout200JSONResponse{}, nil
}

// frozenClock never moves, so a refill cannot change a count mid-test.
func frozenClock() func() time.Time {
	t := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	return func() time.Time { return t }
}

func newLimitedRouter() *echo.Echo {
	return NewRouter(Deps{
		Server:    okServer{},
		Auth:      fixedAuth{},
		AppOrigin: testOrigin,
		Limits:    middleware.NewRateLimits("", frozenClock()),
	})
}

func withRemote(addr string) func(*http.Request) {
	return func(r *http.Request) { r.RemoteAddr = addr }
}

const saveBody = `{"url":"https://example.com"}`

func save(e *echo.Echo, token string, opts ...func(*http.Request)) *httptest.ResponseRecorder {
	opts = append([]func(*http.Request){withSession(token), withCSRF()}, opts...)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/bookmarks", strings.NewReader(saveBody))
	req.Header.Set("Content-Type", "application/json")
	for _, o := range opts {
		o(req)
	}
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

func list(e *echo.Echo, token string) *httptest.ResponseRecorder {
	return do(e, http.MethodGet, "/api/v1/bookmarks", withSession(token))
}

func logout(e *echo.Echo, token string) *httptest.ResponseRecorder {
	return do(e, http.MethodPost, "/auth/logout", withSession(token), withCSRF())
}

func login(e *echo.Echo, opts ...func(*http.Request)) *httptest.ResponseRecorder {
	return do(e, http.MethodGet, "/auth/login", opts...)
}

func callback(e *echo.Echo, opts ...func(*http.Request)) *httptest.ResponseRecorder {
	return do(e, http.MethodGet, "/auth/callback?code=c&state=s", opts...)
}

func requireRateLimited(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	requireProblem(t, rec, http.StatusTooManyRequests, api.ErrorCodeRateLimited)
	secs, err := strconv.Atoi(rec.Header().Get("Retry-After"))
	require.NoError(t, err, "Retry-After is an integer")
	require.GreaterOrEqual(t, secs, 1)
	require.NotContains(t, rec.Body.String(), "detail")
}

func requirePassed(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	require.Contains(t, []int{http.StatusOK, http.StatusCreated, http.StatusFound}, rec.Code, rec.Body.String())
}

func TestRateLimit_Saves(t *testing.T) {
	e := newLimitedRouter()
	for i := 0; i < middleware.SavesPerMinute; i++ {
		rec := save(e, tokenA)
		require.Equal(t, http.StatusCreated, rec.Code, "save %d", i+1)
	}
	requireRateLimited(t, save(e, tokenA))
}

func TestRateLimit_LoginRoutes(t *testing.T) {
	t.Run("the 11th login is refused", func(t *testing.T) {
		e := newLimitedRouter()
		for i := 0; i < middleware.LoginPerMinute; i++ {
			require.Equal(t, http.StatusFound, login(e).Code)
		}
		requireRateLimited(t, login(e))
	})

	t.Run("the 11th callback is refused", func(t *testing.T) {
		e := newLimitedRouter()
		for i := 0; i < middleware.LoginPerMinute; i++ {
			require.Equal(t, http.StatusFound, callback(e).Code)
		}
		requireRateLimited(t, callback(e))
	})

	t.Run("login and callback share one bucket", func(t *testing.T) {
		e := newLimitedRouter()
		for i := 0; i < 9; i++ {
			require.Equal(t, http.StatusFound, login(e).Code)
		}
		require.Equal(t, http.StatusFound, callback(e).Code)
		requireRateLimited(t, callback(e))
	})

	t.Run("another address has its own bucket", func(t *testing.T) {
		e := newLimitedRouter()
		for i := 0; i < middleware.LoginPerMinute; i++ {
			login(e)
		}
		requireRateLimited(t, login(e))
		requirePassed(t, login(e, withRemote("192.0.2.2:1234")))
	})
}

func TestRateLimit_Ceiling(t *testing.T) {
	t.Run("the 301st call is refused", func(t *testing.T) {
		e := newLimitedRouter()
		for i := 0; i < middleware.CeilingPerMinute; i++ {
			require.Equal(t, http.StatusOK, list(e, tokenA).Code, "call %d", i+1)
		}
		requireRateLimited(t, list(e, tokenA))
	})

	t.Run("a save counts toward the ceiling", func(t *testing.T) {
		e := newLimitedRouter()
		for i := 0; i < middleware.CeilingPerMinute-1; i++ {
			require.Equal(t, http.StatusOK, list(e, tokenA).Code)
		}
		require.Equal(t, http.StatusCreated, save(e, tokenA).Code)
		requireRateLimited(t, list(e, tokenA))
	})
}

func TestRateLimit_Isolation(t *testing.T) {
	e := newLimitedRouter()
	for i := 0; i < middleware.SavesPerMinute; i++ {
		save(e, tokenA)
	}
	requireRateLimited(t, save(e, tokenA))

	t.Run("a refused save does not stop the same user's other calls", func(t *testing.T) {
		require.Equal(t, http.StatusOK, list(e, tokenA).Code)
	})
	t.Run("another user is not affected", func(t *testing.T) {
		require.Equal(t, http.StatusCreated, save(e, tokenB).Code)
		require.Equal(t, http.StatusOK, list(e, tokenB).Code)
	})
}

func TestRateLimit_SyncExempt(t *testing.T) {
	e := newLimitedRouter()
	for i := 0; i < 1000; i++ {
		rec := do(e, http.MethodGet, "/api/v1/sync/version", withSession(tokenA))
		require.Equal(t, http.StatusOK, rec.Code, "poll %d", i+1)
	}
	for i := 0; i < middleware.CeilingPerMinute; i++ {
		require.Equal(t, http.StatusOK, list(e, tokenA).Code, "call %d after the polls", i+1)
	}
	requireRateLimited(t, list(e, tokenA))
}

func TestRateLimit_Order(t *testing.T) {
	t.Run("no session is 401 and takes no token", func(t *testing.T) {
		e := newLimitedRouter()
		for i := 0; i < middleware.CeilingPerMinute+1; i++ {
			requireProblem(t, do(e, http.MethodGet, "/api/v1/bookmarks"), http.StatusUnauthorized, api.ErrorCodeUnauthenticated)
		}
		require.Equal(t, http.StatusOK, list(e, tokenA).Code)
	})

	t.Run("a bad CSRF token is 403 and takes no token", func(t *testing.T) {
		e := newLimitedRouter()
		for i := 0; i < middleware.SavesPerMinute+1; i++ {
			rec := save(e, tokenA, func(r *http.Request) { r.Header.Set(middleware.CSRFHeader, "wrong") })
			requireProblem(t, rec, http.StatusForbidden, api.ErrorCodeCsrfFailed)
		}
		require.Equal(t, http.StatusCreated, save(e, tokenA).Code)
	})
}

func TestRateLimit_BeforeRequireJSON(t *testing.T) {
	e := newLimitedRouter()
	for i := 0; i < middleware.SavesPerMinute; i++ {
		save(e, tokenA)
	}
	rec := save(e, tokenA, func(r *http.Request) { r.Header.Set("Content-Type", "text/plain") })
	requireRateLimited(t, rec)
}

func TestRateLimit_NilLimits(t *testing.T) {
	e := NewRouter(Deps{Server: okServer{}, Auth: fixedAuth{}, AppOrigin: testOrigin})
	for i := 0; i < middleware.LoginPerMinute+1; i++ {
		require.Equal(t, http.StatusFound, login(e).Code)
	}
	for i := 0; i < middleware.CeilingPerMinute+1; i++ {
		require.Equal(t, http.StatusOK, list(e, tokenA).Code)
	}
}

func TestRateLimit_LogoutCounts(t *testing.T) {
	t.Run("logout is not in the login bucket", func(t *testing.T) {
		e := newLimitedRouter()
		for i := 0; i < middleware.LoginPerMinute; i++ {
			login(e)
		}
		requireRateLimited(t, login(e))
		require.Equal(t, http.StatusOK, logout(e, tokenA).Code)
	})

	t.Run("logout counts toward the ceiling, per user", func(t *testing.T) {
		e := newLimitedRouter()
		for i := 0; i < middleware.CeilingPerMinute; i++ {
			require.Equal(t, http.StatusOK, list(e, tokenA).Code)
		}
		requireRateLimited(t, logout(e, tokenA))
		require.Equal(t, http.StatusOK, logout(e, tokenB).Code)
	})
}
