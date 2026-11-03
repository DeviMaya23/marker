package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/handler/middleware"
)

const (
	testOrigin   = "http://localhost:5175"
	goodSession  = "good-session"
	testCSRF     = "csrf-value"
	notImplCode  = api.ErrorCode("not_implemented")
	someFolderID = "0192f3a0-0000-7000-8000-000000000001"
)

// stubAuth accepts exactly one session token.
type stubAuth struct{}

func (stubAuth) Authenticate(_ context.Context, token string) (domain.Session, error) {
	if token != goodSession {
		return domain.Session{}, domain.ErrUnauthenticated
	}
	return domain.Session{ID: uuid.New(), UserID: uuid.New()}, nil
}

func newTestRouter() *echo.Echo {
	return NewRouter(Deps{Server: NewServer(nil), Auth: stubAuth{}, AppOrigin: testOrigin})
}

func withSession(token string) func(*http.Request) {
	return func(r *http.Request) { r.AddCookie(&http.Cookie{Name: middleware.SessionCookie, Value: token}) }
}

// withCSRF makes the request pass the CSRF check.
func withCSRF() func(*http.Request) {
	return func(r *http.Request) {
		r.Header.Set("Origin", testOrigin)
		r.Header.Set(middleware.CSRFHeader, testCSRF)
		r.AddCookie(&http.Cookie{Name: middleware.CSRFCookie, Value: testCSRF})
	}
}

func do(e *echo.Echo, method, path string, opts ...func(*http.Request)) *httptest.ResponseRecorder {
	var body *strings.Reader
	if method == http.MethodPost || method == http.MethodPatch {
		body = strings.NewReader("{}")
	} else {
		body = strings.NewReader("")
	}
	req := httptest.NewRequest(method, path, body)
	req.Header.Set("Content-Type", "application/json")
	for _, opt := range opts {
		opt(req)
	}
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

func requireProblem(t *testing.T, rec *httptest.ResponseRecorder, status int, code api.ErrorCode) {
	t.Helper()
	require.Equal(t, status, rec.Code)
	require.Equal(t, "application/problem+json", rec.Header().Get("Content-Type"))

	var p api.Problem
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &p))
	require.Equal(t, code, p.Code)
	require.Equal(t, status, p.Status)
	require.NotEmpty(t, p.Title)
	require.NotEmpty(t, p.Type)
}

func TestRouter_APIRequiresASession(t *testing.T) {
	e := newTestRouter()

	t.Run("no cookie", func(t *testing.T) {
		requireProblem(t, do(e, http.MethodGet, "/api/v1/bookmarks"), http.StatusUnauthorized, api.ErrorCodeUnauthenticated)
	})

	t.Run("unknown session", func(t *testing.T) {
		rec := do(e, http.MethodGet, "/api/v1/bookmarks", withSession("forged"))
		requireProblem(t, rec, http.StatusUnauthorized, api.ErrorCodeUnauthenticated)
	})

	t.Run("valid session reaches the handler", func(t *testing.T) {
		// Operations are stubs for now, so reaching the handler means a 501.
		rec := do(e, http.MethodGet, "/api/v1/bookmarks", withSession(goodSession))
		requireProblem(t, rec, http.StatusNotImplemented, notImplCode)
	})
}

func TestRouter_WritesNeedCSRFProtection(t *testing.T) {
	e := newTestRouter()

	writes := []struct{ method, path string }{
		{http.MethodPost, "/api/v1/folders"},
		{http.MethodPatch, "/api/v1/folders/" + someFolderID},
		{http.MethodDelete, "/api/v1/trash"},
		{http.MethodPost, "/auth/logout"},
	}

	for _, w := range writes {
		t.Run(w.method+" "+w.path, func(t *testing.T) {
			rec := do(e, w.method, w.path, withSession(goodSession))
			requireProblem(t, rec, http.StatusForbidden, api.ErrorCodeCsrfFailed)

			rec = do(e, w.method, w.path, withSession(goodSession), withCSRF())
			requireProblem(t, rec, http.StatusNotImplemented, notImplCode)
		})
	}
}

func TestRouter_PublicAuthRoutesNeedNoSession(t *testing.T) {
	e := newTestRouter()

	for _, path := range []string{"/auth/login", "/auth/callback?code=abc&state=xyz"} {
		t.Run(path, func(t *testing.T) {
			// 501 (the stub), not 401: the session check is skipped for these routes.
			requireProblem(t, do(e, http.MethodGet, path), http.StatusNotImplemented, notImplCode)
		})
	}
}

func TestRouter_AuthRoutesAreServedAtTheRootOnly(t *testing.T) {
	// openapi.yaml overrides the server for /auth/*: they are not under /api/v1.
	requireProblem(t, do(newTestRouter(), http.MethodGet, "/api/v1/auth/login"), http.StatusNotFound, api.ErrorCodeNotFound)
}

func TestRouter_ErrorsAreProblemJSON(t *testing.T) {
	e := newTestRouter()

	t.Run("unknown route", func(t *testing.T) {
		requireProblem(t, do(e, http.MethodGet, "/nope"), http.StatusNotFound, api.ErrorCodeNotFound)
	})

	t.Run("malformed path parameter", func(t *testing.T) {
		rec := do(e, http.MethodGet, "/api/v1/bookmarks/not-a-uuid", withSession(goodSession))
		requireProblem(t, rec, http.StatusBadRequest, api.ErrorCodeValidationError)
	})
}

func TestRouter_RequestBodyIsCappedAt64KB(t *testing.T) {
	e := newTestRouter()

	post := func(size int) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/bookmarks", strings.NewReader(strings.Repeat("a", size)))
		req.Header.Set("Content-Type", "application/json")
		withSession(goodSession)(req)
		withCSRF()(req)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		return rec
	}

	t.Run("over the cap", func(t *testing.T) {
		requireProblem(t, post(64*1024+1), http.StatusRequestEntityTooLarge, api.ErrorCodePayloadTooLarge)
	})

	t.Run("exactly at the cap is not refused for size", func(t *testing.T) {
		// The body is not valid JSON, so the stub or the decoder answers; the point
		// is only that the size limit does not fire. 64 KB means 65,536 bytes.
		require.NotEqual(t, http.StatusRequestEntityTooLarge, post(64*1024).Code)
	})
}
