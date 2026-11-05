package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/handler/middleware"
	"marker/internal/usecase"
)

// loginSpy is a value-return spy for LoginFlow.
type loginSpy struct {
	authorizeURL string
	binding      string
	maxAge       int
	beginErr     error
	gotReturnTo  string
	beginCalls   int

	grant        usecase.Grant
	returnTo     string
	completeErr  error
	completeCall int
	gotCode      string
	gotState     string
	gotBinding   string

	logoutURL    string
	logoutErr    error
	gotSessionID uuid.UUID
	logoutCalls  int
}

func (s *loginSpy) Begin(_ context.Context, returnTo string) (usecase.LoginAttempt, error) {
	s.beginCalls++
	s.gotReturnTo = returnTo
	return usecase.LoginAttempt{AuthorizeURL: s.authorizeURL, Binding: s.binding, MaxAge: s.maxAge}, s.beginErr
}

func (s *loginSpy) Complete(_ context.Context, code, state, binding string) (usecase.Grant, string, error) {
	s.completeCall++
	s.gotCode, s.gotState, s.gotBinding = code, state, binding
	return s.grant, s.returnTo, s.completeErr
}

func (s *loginSpy) Logout(_ context.Context, sessionID uuid.UUID) (string, error) {
	s.logoutCalls++
	s.gotSessionID = sessionID
	return s.logoutURL, s.logoutErr
}

func newLoginSpy() *loginSpy {
	return &loginSpy{
		authorizeURL: "https://idp.test/authorize?state=abc",
		binding:      "binding-value",
		maxAge:       600,
		grant:        usecase.Grant{Token: "session-token", CSRFToken: "csrf-token", ExpiresAt: time.Now().Add(90 * 24 * time.Hour)},
		returnTo:     "/folders/1",
		logoutURL:    "https://idp.test/logout?redirect=http%3A%2F%2Flocalhost%3A5175%2F",
	}
}

var (
	knownSessionID = uuid.New()
	knownUserID    = uuid.New()
)

// knownAuth accepts goodSession and returns a session with a fixed, known ID, so a test
// can tell which session id the handler passed on.
type knownAuth struct{}

func (knownAuth) Authenticate(_ context.Context, token string) (domain.Session, error) {
	if token != goodSession {
		return domain.Session{}, domain.ErrUnauthenticated
	}
	return domain.Session{ID: knownSessionID, UserID: knownUserID}, nil
}

func loginRouter(spy *loginSpy, secure bool) *echo.Echo {
	// A nil *loginSpy would not be a nil LoginFlow, so pass an untyped nil when there is no spy.
	var flow LoginFlow
	if spy != nil {
		flow = spy
	}
	return NewRouter(Deps{Server: NewServer(nil, nil, nil, nil, nil, flow, secure), Auth: knownAuth{}, AppOrigin: testOrigin})
}

func TestAuthLogin(t *testing.T) {
	for _, secure := range []bool{false, true} {
		t.Run(fmt.Sprintf("redirects to the identity provider and sets only the binding cookie (secure=%v)", secure), func(t *testing.T) {
			spy := newLoginSpy()

			rec := do(loginRouter(spy, secure), http.MethodGet, "/auth/login")

			require.Equal(t, http.StatusFound, rec.Code)
			require.Equal(t, []string{spy.authorizeURL}, rec.Header().Values("Location"))
			require.Len(t, rec.Header(), 2, "Location and Set-Cookie")
			require.Len(t, rec.Header().Values("Set-Cookie"), 1)
			c := cookieByName(t, rec.Result().Cookies(), "login_binding")
			require.Equal(t, spy.binding, c.Value)
			require.True(t, c.HttpOnly)
			require.Equal(t, http.SameSiteLaxMode, c.SameSite)
			require.Equal(t, "/auth/callback", c.Path)
			require.Equal(t, 600, c.MaxAge)
			require.Equal(t, secure, c.Secure)
			require.Contains(t, rec.Header().Get("Set-Cookie"), "Max-Age=600")
		})
	}

	for name, mutate := range map[string]func(*loginSpy){
		"an empty binding":  func(s *loginSpy) { s.binding = "" },
		"a zero MaxAge":     func(s *loginSpy) { s.maxAge = 0 },
		"a negative MaxAge": func(s *loginSpy) { s.maxAge = -1 },
	} {
		t.Run(name+" is a 500 and sets no cookie", func(t *testing.T) {
			spy := newLoginSpy()
			mutate(spy)

			rec := do(loginRouter(spy, false), http.MethodGet, "/auth/login")

			requireProblem(t, rec, http.StatusInternalServerError, api.ErrorCodeInternalError)
			require.Empty(t, rec.Header().Values("Set-Cookie"))
		})
	}

	tests := []struct {
		name     string
		returnTo string // already URL-encoded query value; "-" means absent
		want     string
	}{
		{"absent becomes root", "-", "/"},
		{"save path passes through", url.QueryEscape("/save?url=x&title=y"), "/save?url=x&title=y"},
		{"protocol-relative", url.QueryEscape("//evil.test"), "/"},
		{"absolute URL", url.QueryEscape("https://evil.test"), "/"},
		{"backslash", url.QueryEscape(`/\evil.test`), "/"},
		{"8192 bytes pass through", url.QueryEscape("/" + strings.Repeat("a", 8191)), "/" + strings.Repeat("a", 8191)},
		{"8193 bytes become root", url.QueryEscape("/" + strings.Repeat("a", 8192)), "/"},
	}
	for _, tt := range tests {
		t.Run("return_to "+tt.name, func(t *testing.T) {
			spy := newLoginSpy()
			path := "/auth/login"
			if tt.returnTo != "-" {
				path += "?return_to=" + tt.returnTo
			}

			rec := do(loginRouter(spy, false), http.MethodGet, path)

			require.Equal(t, http.StatusFound, rec.Code)
			require.Equal(t, tt.want, spy.gotReturnTo)
		})
	}

	t.Run("a failure to begin is 500 internal_error", func(t *testing.T) {
		spy := newLoginSpy()
		spy.beginErr = errors.New("discovery down")

		rec := do(loginRouter(spy, false), http.MethodGet, "/auth/login")

		requireProblem(t, rec, http.StatusInternalServerError, api.ErrorCodeInternalError)
		require.NotContains(t, rec.Body.String(), "discovery down")
		require.Empty(t, rec.Header().Values("Set-Cookie"))
	})
}

const callbackPath = "/auth/callback?code=the-code&state=the-state"

func TestAuthCallback_Redirects(t *testing.T) {
	spy := newLoginSpy()

	rec := do(loginRouter(spy, false), http.MethodGet, callbackPath)

	require.Equal(t, http.StatusFound, rec.Code)
	require.Equal(t, spy.returnTo, rec.Header().Get("Location"))
	require.Equal(t, "the-code", spy.gotCode)
	require.Equal(t, "the-state", spy.gotState)
	require.Len(t, rec.Header().Values("Set-Cookie"), 3) // session, csrf_token, cleared login_binding

	cookies := rec.Result().Cookies()
	binding := cookieByName(t, cookies, "login_binding")
	require.Equal(t, -1, binding.MaxAge)
	require.Equal(t, "/auth/callback", binding.Path)
	require.True(t, binding.HttpOnly)
	require.Equal(t, http.SameSiteLaxMode, binding.SameSite)
	session := cookieByName(t, cookies, middleware.SessionCookie)
	require.Equal(t, spy.grant.Token, session.Value)
	require.True(t, session.HttpOnly)
	require.Equal(t, http.SameSiteLaxMode, session.SameSite)
	require.Equal(t, "/", session.Path)
	wantMaxAge := time.Until(spy.grant.ExpiresAt).Seconds()
	require.InDelta(t, wantMaxAge, float64(session.MaxAge), 1)

	csrf := cookieByName(t, cookies, middleware.CSRFCookie)
	require.Equal(t, spy.grant.CSRFToken, csrf.Value)
	require.False(t, csrf.HttpOnly)
	require.Equal(t, http.SameSiteLaxMode, csrf.SameSite)
	require.Equal(t, "/", csrf.Path)
	require.InDelta(t, wantMaxAge, float64(csrf.MaxAge), 1)
}

func TestAuthCallback_Binding(t *testing.T) {
	cookie := func(vals ...string) func(*http.Request) {
		return func(r *http.Request) {
			for _, v := range vals {
				r.AddCookie(&http.Cookie{Name: "login_binding", Value: v})
			}
		}
	}
	tests := []struct {
		name string
		opts []func(*http.Request)
		want string
	}{
		{"the cookie value is passed to Complete", []func(*http.Request){cookie("abc")}, "abc"},
		{"no cookie passes an empty string", nil, ""},
		{"an empty cookie passes an empty string", []func(*http.Request){cookie("")}, ""},
		{"the first of two cookies is used", []func(*http.Request){cookie("first", "second")}, "first"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spy := newLoginSpy()

			rec := do(loginRouter(spy, false), http.MethodGet, callbackPath, tt.opts...)

			require.Equal(t, http.StatusFound, rec.Code)
			require.Equal(t, 1, spy.completeCall)
			require.Equal(t, tt.want, spy.gotBinding)
		})
	}

	t.Run("every failure clears the binding cookie, whether or not one was sent", func(t *testing.T) {
		for _, opts := range [][]func(*http.Request){nil, {cookie("abc")}} {
			spy := newLoginSpy()
			spy.completeErr = domain.ErrInvalidLogin

			rec := do(loginRouter(spy, true), http.MethodGet, callbackPath, opts...)

			requireLoginFailure(t, rec, "login_failed")
			c := cookieByName(t, rec.Result().Cookies(), "login_binding")
			require.Equal(t, -1, c.MaxAge)
			require.Equal(t, "/auth/callback", c.Path)
			require.True(t, c.HttpOnly)
			require.True(t, c.Secure)
			require.Equal(t, http.SameSiteLaxMode, c.SameSite)
		}
	})
}

func TestAuthCallback_SecureFlag(t *testing.T) {
	for _, secure := range []bool{true, false} {
		t.Run(map[bool]string{true: "https", false: "http"}[secure], func(t *testing.T) {
			rec := do(loginRouter(newLoginSpy(), secure), http.MethodGet, callbackPath)

			require.Equal(t, http.StatusFound, rec.Code)
			for _, c := range rec.Result().Cookies() {
				require.Equal(t, secure, c.Secure, c.Name)
			}
		})
	}
}

func TestAuthCallback_ReturnPathIsValidatedAgain(t *testing.T) {
	spy := newLoginSpy()
	spy.returnTo = "https://evil.test"

	rec := do(loginRouter(spy, false), http.MethodGet, callbackPath)

	require.Equal(t, http.StatusFound, rec.Code)
	require.Equal(t, "/", rec.Header().Get("Location"))
}

func TestAuthCallback_Errors(t *testing.T) {
	t.Run("an invalid login redirects to login_failed", func(t *testing.T) {
		spy := newLoginSpy()
		spy.completeErr = domain.ErrInvalidLogin

		rec := do(loginRouter(spy, false), http.MethodGet, callbackPath)

		requireLoginFailure(t, rec, "login_failed")
	})

	t.Run("any other error redirects the same way and leaks nothing", func(t *testing.T) {
		spy := newLoginSpy()
		spy.completeErr = errors.New("token endpoint exploded")

		rec := do(loginRouter(spy, false), http.MethodGet, callbackPath)

		requireLoginFailure(t, rec, "login_failed")
		require.NotContains(t, rec.Header().Get("Location"), "exploded")
		require.Empty(t, rec.Body.String())
	})

	for name, tt := range map[string]struct{ path, code string }{
		"missing code":              {"/auth/callback?state=s", "login_failed"},
		"missing state":             {"/auth/callback?code=c", "login_failed"},
		"cancelled at the provider": {"/auth/callback?error=access_denied&state=s", "access_denied"},
	} {
		t.Run(name+" reaches the handler and redirects", func(t *testing.T) {
			spy := newLoginSpy()
			spy.completeErr = domain.ErrInvalidLogin

			rec := do(loginRouter(spy, false), http.MethodGet, tt.path)

			requireLoginFailure(t, rec, tt.code)
			require.Equal(t, 1, spy.completeCall)
		})
	}

	t.Run("a valid state adds return_to to the failure redirect", func(t *testing.T) {
		spy := newLoginSpy()
		spy.completeErr = domain.ErrInvalidLogin
		spy.returnTo = "/save?url=x"

		rec := do(loginRouter(spy, false), http.MethodGet, callbackPath)

		require.Equal(t, "/login?error=login_failed&return_to=%2Fsave%3Furl%3Dx", rec.Header().Get("Location"))
	})

	t.Run("works with no session cookie", func(t *testing.T) {
		spy := newLoginSpy()
		rec := do(loginRouter(spy, false), http.MethodGet, callbackPath)
		require.Equal(t, http.StatusFound, rec.Code)
		require.Equal(t, 1, spy.completeCall)
	})

	t.Run("with a live session cookie it still calls the service", func(t *testing.T) {
		spy := newLoginSpy()
		rec := do(loginRouter(spy, false), http.MethodGet, callbackPath, withSession(goodSession))
		require.Equal(t, http.StatusFound, rec.Code)
		require.Equal(t, 1, spy.completeCall)
	})
}

func TestAuthLogout(t *testing.T) {
	t.Run("answers 200 with the logout URL and clears the cookies", func(t *testing.T) {
		spy := newLoginSpy()

		rec := do(loginRouter(spy, false), http.MethodPost, "/auth/logout", withSession(goodSession), withCSRF())

		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, "application/json", rec.Header().Get("Content-Type"))
		cookies := rec.Result().Cookies()
		require.Len(t, cookies, 2)
		for _, name := range []string{middleware.SessionCookie, middleware.CSRFCookie} {
			require.Equal(t, -1, cookieByName(t, cookies, name).MaxAge, name)
		}
		want, err := json.Marshal(map[string]string{"logout_url": spy.logoutURL})
		require.NoError(t, err)
		require.JSONEq(t, string(want), rec.Body.String())
		var body map[string]any
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Len(t, body, 1)
		require.Equal(t, knownSessionID, spy.gotSessionID, "the session's id")
	})

	t.Run("no cookie is 401", func(t *testing.T) {
		spy := newLoginSpy()
		rec := do(loginRouter(spy, false), http.MethodPost, "/auth/logout")
		requireProblem(t, rec, http.StatusUnauthorized, api.ErrorCodeUnauthenticated)
		require.Zero(t, spy.logoutCalls)
	})

	t.Run("no CSRF token is 403", func(t *testing.T) {
		spy := newLoginSpy()
		rec := do(loginRouter(spy, false), http.MethodPost, "/auth/logout", withSession(goodSession))
		requireProblem(t, rec, http.StatusForbidden, api.ErrorCodeCsrfFailed)
		require.Zero(t, spy.logoutCalls)
	})

	t.Run("a wrong CSRF token is 403", func(t *testing.T) {
		spy := newLoginSpy()
		wrong := func(r *http.Request) {
			r.Header.Set("Origin", testOrigin)
			r.Header.Set(middleware.CSRFHeader, "not-the-cookie-value")
			r.AddCookie(&http.Cookie{Name: middleware.CSRFCookie, Value: testCSRF})
		}
		rec := do(loginRouter(spy, false), http.MethodPost, "/auth/logout", withSession(goodSession), wrong)
		requireProblem(t, rec, http.StatusForbidden, api.ErrorCodeCsrfFailed)
		require.Zero(t, spy.logoutCalls)
	})

	t.Run("a failure is 500 and returns no URL", func(t *testing.T) {
		spy := newLoginSpy()
		spy.logoutErr = errors.New("db down")

		rec := do(loginRouter(spy, false), http.MethodPost, "/auth/logout", withSession(goodSession), withCSRF())

		requireProblem(t, rec, http.StatusInternalServerError, api.ErrorCodeInternalError)
		require.NotContains(t, rec.Body.String(), "logout_url")
	})
}

func TestAuth_NotConfigured(t *testing.T) {
	e := loginRouter(nil, false)

	tests := []struct {
		name string
		rec  *httptest.ResponseRecorder
	}{
		{"login", do(e, http.MethodGet, "/auth/login")},
		{"callback", do(e, http.MethodGet, callbackPath)},
		{"logout", do(e, http.MethodPost, "/auth/logout", withSession(goodSession), withCSRF())},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			requireProblem(t, tt.rec, http.StatusNotImplemented, notImplCode)
		})
	}
}
