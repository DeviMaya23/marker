package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
)

const testProxySecret = "AbCdEfGhIjKlMnOpQrStUvWxYz012345"

func proxyReq(method, path string, headerValues ...string) *http.Request {
	r := httptest.NewRequest(method, path, nil)
	for _, v := range headerValues {
		r.Header.Add(ProxySecretHeader, v)
	}
	return r
}

func requireRefused(t *testing.T, req *http.Request) {
	t.Helper()
	called := false
	c := echo.New().NewContext(req, httptest.NewRecorder())
	err := ProxySecret(testProxySecret)(func(echo.Context) error { called = true; return nil })(c)
	require.Equal(t, echo.ErrNotFound, err)
	require.False(t, called, "next handler must not run")
}

func requirePassedThrough(t *testing.T, req *http.Request) {
	t.Helper()
	called := false
	c := echo.New().NewContext(req, httptest.NewRecorder())
	err := ProxySecret(testProxySecret)(func(echo.Context) error { called = true; return nil })(c)
	require.NoError(t, err)
	require.True(t, called, "next handler must run")
}

func TestProxySecret_CorrectValuePasses(t *testing.T) {
	requirePassedThrough(t, proxyReq(http.MethodGet, "/api/v1/bookmarks", testProxySecret))
}

func TestProxySecret_RefusesAnythingElse(t *testing.T) {
	tests := []struct {
		name   string
		values []string
	}{
		{"no header", nil},
		{"empty header", []string{""}},
		{"one byte shorter", []string{testProxySecret[:len(testProxySecret)-1]}},
		{"one byte longer", []string{testProxySecret + "x"}},
		{"correct value with a byte appended", []string{testProxySecret + "0"}},
		{"lower case of a mixed-case secret", []string{"abcdefghijklmnopqrstuvwxyz012345"}},
		{"first of two headers is wrong", []string{"wrong", testProxySecret}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			requireRefused(t, proxyReq(http.MethodGet, "/api/v1/bookmarks", tt.values...))
		})
	}
}

func TestProxySecret_HealthzIsExemptOnlyForGET(t *testing.T) {
	for name, values := range map[string][]string{
		"no header":      nil,
		"wrong header":   {"wrong"},
		"correct header": {testProxySecret},
	} {
		t.Run("GET /healthz with "+name, func(t *testing.T) {
			requirePassedThrough(t, proxyReq(http.MethodGet, "/healthz", values...))
		})
	}

	t.Run("a query string does not matter", func(t *testing.T) {
		requirePassedThrough(t, proxyReq(http.MethodGet, "/healthz?x=1"))
	})

	for _, path := range []string{"/healthz/", "/healthz2", "//healthz", "/healthz/x"} {
		t.Run(path+" is not exempt", func(t *testing.T) {
			requireRefused(t, proxyReq(http.MethodGet, path))
		})
	}

	t.Run("an escaped path is not exempt", func(t *testing.T) {
		r := proxyReq(http.MethodGet, "/healthz")
		r.URL.Path = "/healthz"
		r.URL.RawPath = "/%68ealthz"
		requireRefused(t, r)
	})
}

func TestProxySecret_EveryMethodNeedsTheHeader(t *testing.T) {
	requireRefused(t, proxyReq(http.MethodPost, "/api/v1/bookmarks"))
	requireRefused(t, proxyReq(http.MethodOptions, "/api/v1/bookmarks"))
	requireRefused(t, proxyReq(http.MethodPost, "/healthz"))
	requireRefused(t, proxyReq(http.MethodHead, "/healthz"))
}

func TestProxySecret_HeaderNameIsCaseInsensitive(t *testing.T) {
	var reached bool
	e := echo.New()
	e.Use(ProxySecret(testProxySecret))
	e.GET("/x", func(c echo.Context) error { reached = true; return c.NoContent(http.StatusNoContent) })
	srv := httptest.NewServer(e)
	defer srv.Close()

	req, err := http.NewRequest(http.MethodGet, srv.URL+"/x", nil)
	require.NoError(t, err)
	// A map write keeps the name as written, so it goes out in lower case.
	req.Header["x-proxy-secret"] = []string{testProxySecret}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusNoContent, resp.StatusCode)
	require.True(t, reached)
}

func TestProxySecret_RefusalBodyHasNeitherSecretNorSuppliedValue(t *testing.T) {
	const supplied = "supplied-wrong-value-0123456789"
	e := echo.New()
	e.Use(ProxySecret(testProxySecret))
	e.GET("/x", func(c echo.Context) error { return c.NoContent(http.StatusNoContent) })

	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, proxyReq(http.MethodGet, "/x", supplied))

	require.Equal(t, http.StatusNotFound, rec.Code)
	require.NotContains(t, rec.Body.String(), testProxySecret)
	require.NotContains(t, rec.Body.String(), supplied)
}
