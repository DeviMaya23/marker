package handler

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/handler/middleware"
)

// accountSpy is a value-return spy for AccountService.
type accountSpy struct {
	err     error
	gotUser uuid.UUID
	calls   int
}

func (s *accountSpy) Delete(_ context.Context, userID uuid.UUID) error {
	s.gotUser = userID
	s.calls++
	return s.err
}

func accountRouter(spy *accountSpy) *echo.Echo {
	return NewRouter(Deps{Server: NewServer(nil, nil, nil, nil, spy), Auth: authFor{}, AppOrigin: testOrigin})
}

const accountPath = "/api/v1/account"

func TestDeleteAccount_NoContent(t *testing.T) {
	spy := &accountSpy{}

	rec := do(accountRouter(spy), http.MethodDelete, accountPath, withSession(goodSession), withCSRF())

	require.Equal(t, http.StatusNoContent, rec.Code)
	require.Empty(t, rec.Body.String())
	require.Empty(t, rec.Header().Values("Set-Cookie"))
	require.Equal(t, callerID, spy.gotUser, "the session's user")
	require.Equal(t, 1, spy.calls)
}

func TestDeleteAccount_Errors(t *testing.T) {
	t.Run("user gone is 401", func(t *testing.T) {
		spy := &accountSpy{err: domain.ErrUnauthenticated}
		rec := do(accountRouter(spy), http.MethodDelete, accountPath, withSession(goodSession), withCSRF())
		requireProblem(t, rec, http.StatusUnauthorized, api.ErrorCodeUnauthenticated)
	})

	t.Run("unclassified error is 500", func(t *testing.T) {
		spy := &accountSpy{err: errors.New("db exploded")}
		rec := do(accountRouter(spy), http.MethodDelete, accountPath, withSession(goodSession), withCSRF())
		requireProblem(t, rec, http.StatusInternalServerError, api.ErrorCodeInternalError)
	})
}

func TestDeleteAccount_NoCookie(t *testing.T) {
	spy := &accountSpy{}

	rec := do(accountRouter(spy), http.MethodDelete, accountPath)

	requireProblem(t, rec, http.StatusUnauthorized, api.ErrorCodeUnauthenticated)
	require.Zero(t, spy.calls)
}

func TestDeleteAccount_CSRF(t *testing.T) {
	wrongToken := func(r *http.Request) {
		r.Header.Set("Origin", testOrigin)
		r.Header.Set(middleware.CSRFHeader, "not-the-cookie-value")
		r.AddCookie(&http.Cookie{Name: middleware.CSRFCookie, Value: testCSRF})
	}

	for _, tc := range []struct {
		name string
		opts []func(*http.Request)
	}{
		{"missing token", []func(*http.Request){withSession(goodSession)}},
		{"wrong token", []func(*http.Request){withSession(goodSession), wrongToken}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			spy := &accountSpy{}

			rec := do(accountRouter(spy), http.MethodDelete, accountPath, tc.opts...)

			requireProblem(t, rec, http.StatusForbidden, api.ErrorCodeCsrfFailed)
			require.Zero(t, spy.calls)
		})
	}
}
