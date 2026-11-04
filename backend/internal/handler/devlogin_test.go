package handler

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"

	"marker/internal/api"
	"marker/internal/handler/middleware"
	"marker/internal/usecase"
)

// spyStarter records the subject it was asked to sign in and returns a canned grant.
type spyStarter struct {
	gotIdpID string
	grant    usecase.Grant
	err      error
}

func (s *spyStarter) StartSession(_ context.Context, idpID string) (usecase.Grant, error) {
	s.gotIdpID = idpID
	return s.grant, s.err
}

func newSpy() *spyStarter {
	return &spyStarter{grant: usecase.Grant{
		Token:     "session-token",
		CSRFToken: "csrf-token",
		ExpiresAt: time.Now().Add(time.Hour),
	}}
}

func newDevRouter(spy *spyStarter, secure bool) *echo.Echo {
	return NewRouter(Deps{
		Server:    NewServer(nil, nil, nil, nil, nil),
		Auth:      stubAuth{},
		AppOrigin: testOrigin,
		DevLogin:  NewDevLogin(spy, secure).Handle,
	})
}

func cookieByName(t *testing.T, cookies []*http.Cookie, name string) *http.Cookie {
	t.Helper()
	for _, c := range cookies {
		if c.Name == name {
			return c
		}
	}
	t.Fatalf("cookie %q not set", name)
	return nil
}

func TestDevLogin_SignsInAndSetsCookies(t *testing.T) {
	spy := newSpy()
	e := newDevRouter(spy, false)

	rec := do(e, http.MethodGet, "/auth/dev-login?name=alice&return_to=/folders")

	require.Equal(t, http.StatusFound, rec.Code)
	require.Equal(t, "/folders", rec.Header().Get("Location"))
	require.Equal(t, "dev|alice", spy.gotIdpID)

	cookies := rec.Result().Cookies()
	session := cookieByName(t, cookies, middleware.SessionCookie)
	require.Equal(t, "session-token", session.Value)
	require.True(t, session.HttpOnly, "the session cookie must be HttpOnly")
	require.Equal(t, http.SameSiteLaxMode, session.SameSite)
	require.False(t, session.Secure)

	csrf := cookieByName(t, cookies, middleware.CSRFCookie)
	require.Equal(t, "csrf-token", csrf.Value)
	require.False(t, csrf.HttpOnly, "the frontend must be able to read the CSRF cookie")
}

func TestDevLogin_CookiesAreSecureOverHTTPS(t *testing.T) {
	rec := do(newDevRouter(newSpy(), true), http.MethodGet, "/auth/dev-login?name=alice")

	cookies := rec.Result().Cookies()
	require.True(t, cookieByName(t, cookies, middleware.SessionCookie).Secure)
	require.True(t, cookieByName(t, cookies, middleware.CSRFCookie).Secure)
}

func TestDevLogin_ForeignReturnToFallsBackToRoot(t *testing.T) {
	rec := do(newDevRouter(newSpy(), false), http.MethodGet,
		"/auth/dev-login?name=alice&return_to="+url.QueryEscape("https://evil.example/"))

	require.Equal(t, http.StatusFound, rec.Code)
	require.Equal(t, "/", rec.Header().Get("Location"))
}

func TestDevLogin_RejectsInvalidNames(t *testing.T) {
	for _, name := range []string{"", "Alice", "a b", "../x", "dev|alice", strings.Repeat("a", 33)} {
		t.Run(name, func(t *testing.T) {
			spy := newSpy()
			rec := do(newDevRouter(spy, false), http.MethodGet, "/auth/dev-login?name="+url.QueryEscape(name))

			requireProblem(t, rec, http.StatusBadRequest, api.ErrorCodeValidationError)
			require.Empty(t, spy.gotIdpID, "no session may be started for an invalid name")
		})
	}
}

func TestDevLogin_StarterFailureIsAGenericServerError(t *testing.T) {
	spy := newSpy()
	spy.err = errors.New("database exploded")

	rec := do(newDevRouter(spy, false), http.MethodGet, "/auth/dev-login?name=alice")

	requireProblem(t, rec, http.StatusInternalServerError, "internal_error")
	require.NotContains(t, rec.Body.String(), "exploded", "internal error text must not reach the client")
}
