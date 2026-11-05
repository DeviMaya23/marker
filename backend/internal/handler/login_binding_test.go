package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
)

// runLoginBinding sends a request with the given Cookie headers through recordLoginBinding
// and returns what the next handler saw in the context.
func runLoginBinding(t *testing.T, cookieHeaders ...string) (value string, called bool) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/auth/callback", nil)
	for _, h := range cookieHeaders {
		req.Header.Add("Cookie", h)
	}
	c := echo.New().NewContext(req, httptest.NewRecorder())
	err := recordLoginBinding(func(c echo.Context) error {
		called = true
		value = loginBindingFrom(c.Request().Context())
		return nil
	})(c)
	require.NoError(t, err)
	return value, called
}

func TestRecordLoginBinding(t *testing.T) {
	tests := []struct {
		name    string
		headers []string
		want    string
	}{
		{"records the cookie value", []string{"login_binding=abc"}, "abc"},
		{"no Cookie header records nothing and does not fail", nil, ""},
		{"other cookies only", []string{"session=x; csrf_token=y"}, ""},
		{"an empty value", []string{"login_binding="}, ""},
		{"the first cookie of that name wins", []string{"login_binding=first; login_binding=second"}, "first"},
		{"the first of two Cookie headers wins", []string{"login_binding=first", "login_binding=second"}, "first"},
		{"quotes around a value are stripped", []string{`login_binding="quoted"`}, "quoted"},
		{"a malformed header records nothing and does not fail", []string{";;==; login_binding"}, ""},
		{"a cookie with an invalid byte is dropped by Go and counts as absent", []string{"login_binding=a\x7fb"}, ""},
		{"a value with a space is passed on as Go parsed it", []string{"login_binding=a b"}, "a b"},
		{"a value with a non-ASCII byte is dropped by Go and counts as absent", []string{"login_binding=caf\xc3\xa9"}, ""},
		{"an invalid first cookie is skipped and the next parseable one is used", []string{"login_binding=a\x7fb; login_binding=second"}, "second"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, called := runLoginBinding(t, tt.headers...)
			require.True(t, called, "the request always goes on")
			require.Equal(t, tt.want, got)
		})
	}
}

func TestRecordLoginBinding_OnlyForTheCallback(t *testing.T) {
	spy := newLoginSpy()
	rec := do(loginRouter(spy, false), http.MethodGet, "/auth/login", func(r *http.Request) {
		r.AddCookie(&http.Cookie{Name: "login_binding", Value: "abc"})
	})

	require.Equal(t, http.StatusFound, rec.Code)
	require.Zero(t, spy.completeCall)
	require.Empty(t, loginBindingFrom(httptest.NewRequest(http.MethodGet, "/", nil).Context()), "nothing in a bare context")
}
