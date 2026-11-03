package adaptor

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"

	"marker/internal/domain"
	"marker/pkg/safehttp"
)

// These tests run the real PageFetcher and the real safehttp client against an httptest
// server. They need no database, so they run in `make check`.

var tinyPNG = []byte("\x89PNG\r\n\x1a\n-not-really-a-png-but-served-as-one")

const iconPage = `<html><head><title>Okapi  Guide</title><link rel="icon" href="/icon.png">
<style>.x{}</style><script>var hidden=1</script></head>
<body><nav>menu</nav><main><h1>Okapis</h1><p>Forest   giraffes.</p></main></body></html>`

func htmlHandler(body string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(body))
	}
}

func bytesHandler(contentType string, body []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", contentType)
		_, _ = w.Write(body)
	}
}

// serve starts a test server with the given routes; anything else is a 404.
func serve(t *testing.T, routes map[string]http.HandlerFunc) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	for path, h := range routes {
		mux.HandleFunc(path, h)
	}
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func fetchPage(t *testing.T, rawURL string) (domain.FetchedPage, error) {
	t.Helper()
	return NewPageFetcher(safehttp.NewForTesting(t)).FetchPage(context.Background(), rawURL)
}

func TestPageFetcher_FetchPage_Success(t *testing.T) {
	srv := serve(t, map[string]http.HandlerFunc{
		"/page":     htmlHandler(iconPage),
		"/icon.png": bytesHandler("image/png", tinyPNG),
	})
	u, err := url.Parse(srv.URL)
	require.NoError(t, err)

	page, err := fetchPage(t, srv.URL+"/page")

	require.NoError(t, err)
	require.Equal(t, "Okapi Guide", page.Title)
	require.Equal(t, "Okapis Forest giraffes.", page.Text, "script, style and nav are dropped and whitespace collapsed")
	require.NotNil(t, page.Favicon)
	require.Equal(t, "image/png", page.Favicon.ContentType)
	require.Equal(t, tinyPNG, page.Favicon.Data)
	require.Equal(t, u.Hostname(), page.Favicon.Host)
}

func TestPageFetcher_FetchPage_FaviconDiscovery(t *testing.T) {
	cases := []struct {
		name   string
		routes map[string]http.HandlerFunc
		start  string
	}{
		{
			name: "falls back to /favicon.ico",
			routes: map[string]http.HandlerFunc{
				"/page":        htmlHandler(`<title>No link</title><p>hello</p>`),
				"/favicon.ico": bytesHandler("image/x-icon", tinyPNG),
			},
			start: "/page",
		},
		{
			name: "a relative icon link resolves against the final URL after a redirect",
			routes: map[string]http.HandlerFunc{
				"/old": func(w http.ResponseWriter, r *http.Request) {
					http.Redirect(w, r, "/dir/page", http.StatusMovedPermanently)
				},
				"/dir/page":      htmlHandler(`<head><link rel="icon" href="img/f.png"></head><p>hello</p>`),
				"/dir/img/f.png": bytesHandler("image/png", tinyPNG),
			},
			start: "/old",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			srv := serve(t, c.routes)

			page, err := fetchPage(t, srv.URL+c.start)

			require.NoError(t, err)
			require.NotNil(t, page.Favicon)
			require.Equal(t, tinyPNG, page.Favicon.Data)
		})
	}
}

// A bad or missing favicon never fails the page: the result simply has none.
func TestPageFetcher_FetchPage_UnusableFaviconIsNotAnError(t *testing.T) {
	oversized := make([]byte, domain.MaxFaviconBytes+1)

	cases := []struct {
		name  string
		icon  http.HandlerFunc // nil: the icon route does not exist (404)
		check string
	}{
		{"missing", nil, "icon is a 404"},
		{"empty", bytesHandler("image/png", nil), "icon has no bytes"},
		{"over the size cap", bytesHandler("image/png", oversized), "icon is larger than the cap"},
		{"wrong content type", bytesHandler("text/html", []byte("<p>not an image</p>")), "icon is not an image"},
		{"server error", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusInternalServerError) }, "icon request fails"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			routes := map[string]http.HandlerFunc{"/page": htmlHandler(iconPage)}
			if c.icon != nil {
				routes["/icon.png"] = c.icon
			}
			srv := serve(t, routes)

			page, err := fetchPage(t, srv.URL+"/page")

			require.NoError(t, err, c.check)
			require.Nil(t, page.Favicon, c.check)
			require.Equal(t, "Okapi Guide", page.Title, "the page itself is still returned")
			require.NotEmpty(t, page.Text)
		})
	}
}

func TestPageFetcher_FetchPage_PageErrors(t *testing.T) {
	t.Run("a non-2xx page is a status error, not an empty page", func(t *testing.T) {
		srv := serve(t, map[string]http.HandlerFunc{
			"/broken": func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusInternalServerError) },
		})

		page, err := fetchPage(t, srv.URL+"/broken")

		var se *safehttp.StatusError
		require.True(t, errors.As(err, &se), "got %v", err)
		require.Equal(t, http.StatusInternalServerError, se.Code)
		require.Equal(t, domain.FetchedPage{}, page)
	})

	t.Run("a page that is not HTML is refused", func(t *testing.T) {
		srv := serve(t, map[string]http.HandlerFunc{
			"/data": bytesHandler("application/json", []byte(`{"a":1}`)),
		})

		_, err := fetchPage(t, srv.URL+"/data")

		require.ErrorIs(t, err, safehttp.ErrUnsupportedContentType)
	})

	t.Run("the production client refuses a loopback address", func(t *testing.T) {
		srv := serve(t, map[string]http.HandlerFunc{"/page": htmlHandler(iconPage)})

		_, err := NewPageFetcher(safehttp.New()).FetchPage(context.Background(), srv.URL+"/page")

		require.ErrorIs(t, err, safehttp.ErrBlockedAddress)
	})
}
