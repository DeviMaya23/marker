package handler

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"

	"marker/internal/api"
	"marker/internal/domain"
)

// bodyOp is one of the four operations that take a body, with a valid JSON body, a
// router built on its own double, and a way to ask that double whether it was called.
type bodyOp struct {
	name   string
	method string
	path   string
	body   string
	// build returns the router and a function reporting whether the usecase was reached.
	build func() (*echo.Echo, func() bool)
}

func bodyOps() []bodyOp {
	id := uuid.NewString()
	return []bodyOp{
		{"createBookmark", http.MethodPost, "/api/v1/bookmarks", `{"url":"https://example.com"}`, func() (*echo.Echo, func() bool) {
			spy := &bookmarkSpy{}
			return routerWith(spy), func() bool { return spy.gotUser == callerID }
		}},
		{"updateBookmark", http.MethodPatch, "/api/v1/bookmarks/" + id, `{"title":"t"}`, func() (*echo.Echo, func() bool) {
			spy := &bookmarkSpy{}
			return routerWith(spy), func() bool { return spy.updateCalls > 0 }
		}},
		{"createFolder", http.MethodPost, "/api/v1/folders", `{"name":"Work"}`, func() (*echo.Echo, func() bool) {
			spy := &folderSpy{}
			return folderRouter(spy), func() bool { return spy.calls > 0 }
		}},
		{"updateFolder", http.MethodPatch, "/api/v1/folders/" + id, `{"name":"Work"}`, func() (*echo.Echo, func() bool) {
			spy := &folderSpy{}
			return folderRouter(spy), func() bool { return spy.calls > 0 }
		}},
	}
}

// send makes a request with a session and CSRF; an empty contentType sets no header.
func sendTyped(e *echo.Echo, method, path, body, contentType string, opts ...func(*http.Request)) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	withSession(goodSession)(req)
	withCSRF()(req)
	for _, opt := range opts {
		opt(req)
	}
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

func TestMediaType_JSONReachesTheUsecase(t *testing.T) {
	for _, op := range bodyOps() {
		for _, ct := range []string{"application/json", "application/json; charset=utf-8", "Application/JSON", "application/json;charset=UTF-8", "application/json "} {
			t.Run(fmt.Sprintf("%s %q", op.name, ct), func(t *testing.T) {
				e, called := op.build()
				rec := sendTyped(e, op.method, op.path, op.body, ct)
				require.NotEqual(t, http.StatusUnsupportedMediaType, rec.Code)
				require.True(t, called(), "the usecase is reached")
			})
		}
	}
}

func TestMediaType_NonJSONBodiesAre415(t *testing.T) {
	for _, op := range bodyOps() {
		for _, ct := range []string{"", "text/plain", "application/x-www-form-urlencoded", "application/xml",
			"application/problem+json", "application/jsonx", "multipart/form-data; boundary=x"} {
			t.Run(fmt.Sprintf("%s %q", op.name, ct), func(t *testing.T) {
				e, called := op.build()
				rec := sendTyped(e, op.method, op.path, op.body, ct)
				requireProblem(t, rec, http.StatusUnsupportedMediaType, api.ErrorCodeUnsupportedMediaType)
				require.Contains(t, rec.Body.String(), "Unsupported media type")
				require.False(t, called(), "the usecase is never reached")
			})
		}
	}
}

func TestMediaType_EmptyBodyIsNotRejected(t *testing.T) {
	// Unchanged from before the check existed: an empty body goes on to the usecase,
	// with or without a Content-Type (the double answers 2xx; the real usecase decides 422).
	want := map[string]int{"createBookmark": 201, "updateBookmark": 200, "createFolder": 201, "updateFolder": 200}
	for _, op := range bodyOps() {
		for _, ct := range []string{"", "text/plain"} {
			t.Run(fmt.Sprintf("%s %q", op.name, ct), func(t *testing.T) {
				e, called := op.build()
				rec := sendTyped(e, op.method, op.path, "", ct)
				require.Equal(t, want[op.name], rec.Code)
				require.True(t, called())
			})
		}
	}
}

func TestMediaType_UndeclaredLengthBody(t *testing.T) {
	for _, op := range bodyOps() {
		t.Run(op.name, func(t *testing.T) {
			e, called := op.build()
			chunked := func(r *http.Request) { r.ContentLength = -1 }
			rec := sendTyped(e, op.method, op.path, op.body, "text/plain", chunked)
			requireProblem(t, rec, http.StatusUnsupportedMediaType, api.ErrorCodeUnsupportedMediaType)
			require.False(t, called())

			e, called = op.build()
			rec = sendTyped(e, op.method, op.path, op.body, "application/json", chunked)
			require.NotEqual(t, http.StatusUnsupportedMediaType, rec.Code)
			require.True(t, called(), "the peeked byte is not lost")
		})
	}
}

func TestMediaType_OnlyBodyOperationsAreChecked(t *testing.T) {
	id := uuid.NewString()
	spy := &bookmarkSpy{}
	e := routerWith(spy)
	fspy := &folderSpy{}
	fe := folderRouter(fspy)
	tests := []struct {
		name   string
		router *echo.Echo
		method string
		path   string
		status int
	}{
		{"restore", e, http.MethodPost, "/api/v1/bookmarks/" + id + "/restore", http.StatusOK},
		{"delete bookmark", e, http.MethodDelete, "/api/v1/bookmarks/" + id, http.StatusNoContent},
		{"empty trash", e, http.MethodDelete, "/api/v1/trash", http.StatusOK},
		{"delete folder", fe, http.MethodDelete, "/api/v1/folders/" + id, http.StatusOK},
		{"list bookmarks", e, http.MethodGet, "/api/v1/bookmarks", http.StatusOK},
		{"get bookmark", e, http.MethodGet, "/api/v1/bookmarks/" + id, http.StatusOK},
		{"list folders", fe, http.MethodGet, "/api/v1/folders", http.StatusOK},
	}
	for _, tc := range tests {
		for _, ct := range []string{"", "text/plain"} {
			t.Run(fmt.Sprintf("%s %q", tc.name, ct), func(t *testing.T) {
				rec := sendTyped(tc.router, tc.method, tc.path, "", ct)
				require.NotEqual(t, http.StatusUnsupportedMediaType, rec.Code)
				require.Equal(t, tc.status, rec.Code)
			})
		}
	}
}

func TestMediaType_Order(t *testing.T) {
	op := bodyOps()[0] // createBookmark

	t.Run("no session is 401", func(t *testing.T) {
		e, called := op.build()
		req := httptest.NewRequest(op.method, op.path, strings.NewReader(op.body))
		req.Header.Set("Content-Type", "text/plain")
		withCSRF()(req)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		requireProblem(t, rec, http.StatusUnauthorized, api.ErrorCodeUnauthenticated)
		require.False(t, called())
	})

	t.Run("no CSRF header is 403", func(t *testing.T) {
		e, called := op.build()
		req := httptest.NewRequest(op.method, op.path, strings.NewReader(op.body))
		req.Header.Set("Content-Type", "text/plain")
		withSession(goodSession)(req)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		requireProblem(t, rec, http.StatusForbidden, api.ErrorCodeCsrfFailed)
		require.False(t, called())
	})

	t.Run("a body over the limit is 413", func(t *testing.T) {
		e, called := op.build()
		rec := sendTyped(e, op.method, op.path, strings.Repeat("a", 64*1024+1), "text/plain")
		requireProblem(t, rec, http.StatusRequestEntityTooLarge, api.ErrorCodePayloadTooLarge)
		require.False(t, called())
	})

	t.Run("a body over the limit with no declared length is 413", func(t *testing.T) {
		e, called := op.build()
		undeclared := func(r *http.Request) { r.ContentLength = -1 }
		rec := sendTyped(e, op.method, op.path, strings.Repeat("a", 64*1024+1), "text/plain", undeclared)
		requireProblem(t, rec, http.StatusRequestEntityTooLarge, api.ErrorCodePayloadTooLarge)
		require.False(t, called())
	})

	for _, op := range bodyOps() {
		t.Run(op.name+" broken JSON as text/plain is 415", func(t *testing.T) {
			e, called := op.build()
			rec := sendTyped(e, op.method, op.path, `{"url":`, "text/plain")
			requireProblem(t, rec, http.StatusUnsupportedMediaType, api.ErrorCodeUnsupportedMediaType)
			require.False(t, called())
		})
		t.Run(op.name+" broken JSON as application/json is 400", func(t *testing.T) {
			e, called := op.build()
			rec := sendTyped(e, op.method, op.path, `{"url":`, "application/json")
			requireProblem(t, rec, http.StatusBadRequest, api.ErrorCodeValidationError)
			require.False(t, called())
		})
		t.Run(op.name+" unknown media type before unknown keys", func(t *testing.T) {
			e, called := op.build()
			rec := sendTyped(e, op.method, op.path, `{"nope":1}`, "text/plain")
			requireProblem(t, rec, http.StatusUnsupportedMediaType, api.ErrorCodeUnsupportedMediaType)
			require.False(t, called())
		})
	}
}

func TestProblemFor(t *testing.T) {
	t.Run("an Echo 415 is the 415 problem", func(t *testing.T) {
		p := problemFor(echo.NewHTTPError(http.StatusUnsupportedMediaType))
		require.Equal(t, http.StatusUnsupportedMediaType, p.Status)
		require.Equal(t, api.ErrorCodeUnsupportedMediaType, p.Code)
		require.Equal(t, "Unsupported media type", p.Title)
	})

	t.Run("an unknown error is a generic 500", func(t *testing.T) {
		p := problemFor(errors.New("connection to db-7 refused"))
		require.Equal(t, http.StatusInternalServerError, p.Status)
		require.Equal(t, api.ErrorCodeInternalError, p.Code)
		require.Equal(t, "Internal server error", p.Title)
		require.NotContains(t, fmt.Sprintf("%+v", p), "db-7")
	})

	t.Run("the 500 body has no internal text", func(t *testing.T) {
		rec := httptest.NewRecorder()
		e := echo.New()
		ErrorHandler(domain.ErrInvalidURL, e.NewContext(httptest.NewRequest(http.MethodGet, "/", nil), rec)) // sanity: mapped errors still map
		require.Equal(t, http.StatusUnprocessableEntity, rec.Code)

		rec = httptest.NewRecorder()
		ErrorHandler(errors.New("secret detail"), e.NewContext(httptest.NewRequest(http.MethodGet, "/", nil), rec))
		requireProblem(t, rec, http.StatusInternalServerError, api.ErrorCodeInternalError)
		require.NotContains(t, rec.Body.String(), "secret")
	})
}
