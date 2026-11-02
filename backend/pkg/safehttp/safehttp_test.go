package safehttp

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func htmlServer(t *testing.T, body string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestGet_Success(t *testing.T) {
	srv := htmlServer(t, "<html>hi</html>")

	resp, err := NewForTesting(t).Get(context.Background(), srv.URL, PageLimits)

	require.NoError(t, err)
	assert.Equal(t, "text/html", resp.ContentType)
	assert.Equal(t, "<html>hi</html>", string(resp.Body))
	assert.Equal(t, srv.URL, strings.TrimSuffix(resp.FinalURL.String(), "/"))
}

func TestGet_RejectsInvalidURLs(t *testing.T) {
	for _, raw := range []string{
		"",
		"not a url",
		"ftp://example.com/x",
		"javascript:alert(1)",
		"file:///etc/passwd",
		"http://user:pass@example.com/",
		"http:///path",
		"//example.com",
	} {
		t.Run(raw, func(t *testing.T) {
			_, err := New().Get(context.Background(), raw, PageLimits)
			assert.ErrorIs(t, err, ErrInvalidURL)
		})
	}
}

func TestGet_RejectsInvalidLimits(t *testing.T) {
	c := New()
	_, err := c.Get(context.Background(), "http://example.com/", Limits{ContentTypes: []string{"text/html"}})
	assert.ErrorIs(t, err, ErrInvalidLimits)
	_, err = c.Get(context.Background(), "http://example.com/", Limits{MaxBytes: 10})
	assert.ErrorIs(t, err, ErrInvalidLimits)
}

// The production client must refuse loopback, whether the URL holds the IP or a
// name that resolves to it. The error comes from the dial check, so nothing is
// sent.
func TestGet_ProductionClientRefusesLoopback(t *testing.T) {
	srv := htmlServer(t, "secret")
	u, err := url.Parse(srv.URL)
	require.NoError(t, err)
	_, port, err := net.SplitHostPort(u.Host)
	require.NoError(t, err)

	for _, target := range []string{
		"http://127.0.0.1:" + port + "/",
		"http://localhost:" + port + "/",
		"http://[::1]:" + port + "/",
	} {
		t.Run(target, func(t *testing.T) {
			_, err := New().Get(context.Background(), target, PageLimits)
			assert.ErrorIs(t, err, ErrBlockedAddress)
		})
	}
}

func TestGet_ProductionClientRefusesOtherPorts(t *testing.T) {
	// A public literal on a blocked port fails in the dial check, before any
	// connection is attempted.
	_, err := New().Get(context.Background(), "http://8.8.8.8:8080/", PageLimits)
	assert.ErrorIs(t, err, ErrBlockedPort)
}

func TestGet_RefusesPrivateAndMetadataLiterals(t *testing.T) {
	for _, target := range []string{
		"http://10.0.0.1/",
		"http://192.168.0.1/",
		"http://169.254.169.254/latest/meta-data/",
		"http://[fd00:ec2::254]/",
		"http://[::ffff:10.0.0.1]/",
		"http://0.0.0.0/",
	} {
		t.Run(target, func(t *testing.T) {
			_, err := NewForTesting(t).Get(context.Background(), target, PageLimits)
			assert.ErrorIs(t, err, ErrBlockedAddress)
		})
	}
}

func TestGet_FollowsRedirectsAndReportsFinalURL(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/a", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/b", http.StatusMovedPermanently)
	})
	mux.HandleFunc("/b", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte("final"))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	resp, err := NewForTesting(t).Get(context.Background(), srv.URL+"/a", PageLimits)

	require.NoError(t, err)
	assert.Equal(t, "/b", resp.FinalURL.Path)
	assert.Equal(t, "final", string(resp.Body))
}

func TestGet_RedirectHopLimitHolds(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		http.Redirect(w, r, "/again", http.StatusFound)
	}))
	t.Cleanup(srv.Close)

	_, err := NewForTesting(t, WithMaxRedirects(3)).Get(context.Background(), srv.URL, PageLimits)

	assert.ErrorIs(t, err, ErrTooManyRedirects)
	assert.EqualValues(t, 4, hits.Load(), "the first request plus three redirects")
}

func TestGet_EveryRedirectHopIsChecked(t *testing.T) {
	tests := []struct {
		name     string
		location string
		wantErr  error
	}{
		{"metadata address", "http://169.254.169.254/latest/meta-data/", ErrBlockedAddress},
		{"private address", "http://10.0.0.1/admin", ErrBlockedAddress},
		{"ipv4-mapped private", "http://[::ffff:192.168.0.1]/", ErrBlockedAddress},
		{"non-http scheme", "ftp://example.com/file", ErrInvalidURL},
		{"credentials", "http://user:pass@example.com/", ErrInvalidURL},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				http.Redirect(w, r, tt.location, http.StatusFound)
			}))
			t.Cleanup(srv.Close)

			_, err := NewForTesting(t).Get(context.Background(), srv.URL, PageLimits)

			assert.ErrorIs(t, err, tt.wantErr)
		})
	}
}

func TestGet_SizeCap(t *testing.T) {
	lim := Limits{MaxBytes: 1000, ContentTypes: []string{"text/html"}}

	serve := func(t *testing.T, n int, flush bool) string {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			if flush {
				// Flushing first forces chunked encoding: no Content-Length.
				w.WriteHeader(http.StatusOK)
				w.(http.Flusher).Flush()
			}
			_, _ = w.Write(bytes.Repeat([]byte("a"), n))
		}))
		t.Cleanup(srv.Close)
		return srv.URL
	}

	t.Run("exactly at the cap is accepted", func(t *testing.T) {
		resp, err := NewForTesting(t).Get(context.Background(), serve(t, 1000, false), lim)
		require.NoError(t, err)
		assert.Len(t, resp.Body, 1000)
	})
	t.Run("declared length over the cap", func(t *testing.T) {
		_, err := NewForTesting(t).Get(context.Background(), serve(t, 1001, false), lim)
		assert.ErrorIs(t, err, ErrTooLarge)
	})
	t.Run("streamed body over the cap", func(t *testing.T) {
		_, err := NewForTesting(t).Get(context.Background(), serve(t, 5000, true), lim)
		assert.ErrorIs(t, err, ErrTooLarge)
	})
	t.Run("compressed body is counted after decompression", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			w.Header().Set("Content-Encoding", "gzip")
			zw := gzip.NewWriter(w)
			_, _ = zw.Write(bytes.Repeat([]byte("a"), 1<<20))
			_ = zw.Close()
		}))
		t.Cleanup(srv.Close)

		_, err := NewForTesting(t).Get(context.Background(), srv.URL, lim)

		assert.ErrorIs(t, err, ErrTooLarge)
	})
}

func TestGet_ContentTypeAllowlist(t *testing.T) {
	serve := func(t *testing.T, contentType string) string {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if contentType != "" {
				w.Header().Set("Content-Type", contentType)
			} else {
				w.Header()["Content-Type"] = nil // suppress sniffing
			}
			_, _ = w.Write([]byte("x"))
		}))
		t.Cleanup(srv.Close)
		return srv.URL
	}

	tests := []struct {
		name        string
		contentType string
		limits      Limits
		wantErr     error
	}{
		{"html", "text/html", PageLimits, nil},
		{"html with charset and mixed case", "Text/HTML; charset=UTF-8", PageLimits, nil},
		{"xhtml", "application/xhtml+xml", PageLimits, nil},
		{"png favicon", "image/png", FaviconLimits, nil},
		{"ico favicon", "image/x-icon", FaviconLimits, nil},
		{"json page", "application/json", PageLimits, ErrUnsupportedContentType},
		{"image as a page", "image/png", PageLimits, ErrUnsupportedContentType},
		{"html as a favicon", "text/html", FaviconLimits, ErrUnsupportedContentType},
		{"svg favicon", "image/svg+xml", FaviconLimits, ErrUnsupportedContentType},
		{"missing", "", PageLimits, ErrUnsupportedContentType},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewForTesting(t).Get(context.Background(), serve(t, tt.contentType), tt.limits)
			if tt.wantErr == nil {
				assert.NoError(t, err)
				return
			}
			assert.ErrorIs(t, err, tt.wantErr)
		})
	}
}

func TestGet_NonSuccessStatus(t *testing.T) {
	for _, code := range []int{http.StatusNotFound, http.StatusForbidden, http.StatusInternalServerError} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			w.WriteHeader(code)
		}))

		_, err := NewForTesting(t).Get(context.Background(), srv.URL, PageLimits)
		srv.Close()

		var se *StatusError
		require.True(t, errors.As(err, &se), "status %d", code)
		assert.Equal(t, code, se.Code)
	}
}

func TestGet_Timeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(3 * time.Second):
		}
	}))
	t.Cleanup(srv.Close)

	start := time.Now()
	_, err := NewForTesting(t, WithTimeout(100*time.Millisecond)).Get(context.Background(), srv.URL, PageLimits)

	require.Error(t, err)
	var ne net.Error
	require.True(t, errors.As(err, &ne) && ne.Timeout(), "want a timeout error, got %v", err)
	assert.Less(t, time.Since(start), 2*time.Second)
}

func TestGet_SlowBodyIsCutOffByTimeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusOK)
		w.(http.Flusher).Flush()
		_, _ = w.Write([]byte("start"))
		w.(http.Flusher).Flush()
		select {
		case <-r.Context().Done():
		case <-time.After(3 * time.Second):
		}
	}))
	t.Cleanup(srv.Close)

	_, err := NewForTesting(t, WithTimeout(150*time.Millisecond)).Get(context.Background(), srv.URL, PageLimits)

	assert.Error(t, err)
}

func TestGet_CallerContextCancels(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(3 * time.Second):
		}
	}))
	t.Cleanup(srv.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	_, err := NewForTesting(t).Get(ctx, srv.URL, PageLimits)

	assert.ErrorIs(t, err, context.DeadlineExceeded)
}
