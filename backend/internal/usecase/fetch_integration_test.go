//go:build integration

package usecase_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"marker/internal/adaptor"
	"marker/internal/domain"
	"marker/internal/repository"
	"marker/internal/testutil"
	"marker/internal/usecase"
	"marker/pkg/safehttp"
)

const testPage = `<html><head><title>Okapi  Guide</title><link rel="icon" href="/icon.png">
<style>.x{}</style><script>var hidden=1</script></head>
<body><nav>menu</nav><main><h1>Okapis</h1><p>Forest   giraffes.</p></main></body></html>`

var tinyPNG = []byte("\x89PNG\r\n\x1a\n-not-really-a-png-but-served-as-one")

func newFetchService(t *testing.T) (*usecase.FetchService, *repository.BookmarkRepository) {
	t.Helper()
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	fetcher := adaptor.NewPageFetcher(safehttp.NewForTesting(t))
	return usecase.NewFetchService(repo, fetcher), repo
}

func TestFetchService_EndToEndAgainstATestServer(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/page", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(testPage))
	})
	mux.HandleFunc("/icon.png", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(tinyPNG)
	})
	mux.HandleFunc("/broken", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusInternalServerError) })
	srv := httptest.NewServer(mux)
	defer srv.Close()

	svc, repo := newFetchService(t)
	db := testutil.NewDB(t)

	newUser := func() domain.User {
		u := domain.User{ID: domain.NewID(), IdpID: "idp|" + domain.NewID().String()}
		require.NoError(t, db.Create(&u).Error)
		return u
	}
	newPending := func(u domain.User, path string) domain.Bookmark {
		b := domain.Bookmark{
			ID: domain.NewID(), UserID: u.ID, URL: srv.URL + path, NormalizedURL: srv.URL + path,
			FetchStatus: domain.FetchPending,
		}
		require.NoError(t, db.Create(&b).Error)
		return b
	}
	version := func(u domain.User) int64 {
		var got domain.User
		require.NoError(t, db.First(&got, "id = ?", u.ID).Error)
		return got.Version
	}

	t.Run("success", func(t *testing.T) {
		u := newUser()
		b := newPending(u, "/page")

		require.NoError(t, svc.Fetch(context.Background(), b.ID))

		d, err := repo.GetDetail(context.Background(), u.ID, b.ID)
		require.NoError(t, err)
		require.Equal(t, domain.FetchOK, d.FetchStatus)
		require.Equal(t, "Okapi Guide", d.Title)
		require.NotNil(t, d.Content)
		require.Equal(t, "Okapis Forest giraffes.", *d.Content)
		require.NotNil(t, d.FaviconID)
		var fav domain.Favicon
		require.NoError(t, db.First(&fav, "id = ?", *d.FaviconID).Error)
		require.Equal(t, tinyPNG, fav.Data)
		require.EqualValues(t, 1, version(u))
	})

	t.Run("a non-2xx page fails the bookmark", func(t *testing.T) {
		u := newUser()
		b := newPending(u, "/broken")

		require.NoError(t, svc.Fetch(context.Background(), b.ID))

		d, err := repo.GetDetail(context.Background(), u.ID, b.ID)
		require.NoError(t, err)
		require.Equal(t, domain.FetchFailed, d.FetchStatus)
		require.Nil(t, d.Content)
		require.EqualValues(t, 1, version(u))
	})

	t.Run("a missing favicon still gives ok", func(t *testing.T) {
		noIcon := http.NewServeMux()
		noIcon.HandleFunc("/page", func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte(`<title>No icon</title><p>hello</p>`))
		})
		srv2 := httptest.NewServer(noIcon)
		defer srv2.Close()

		u := newUser()
		b := domain.Bookmark{ID: domain.NewID(), UserID: u.ID, URL: srv2.URL + "/page", NormalizedURL: srv2.URL + "/page", FetchStatus: domain.FetchPending}
		require.NoError(t, db.Create(&b).Error)

		require.NoError(t, svc.Fetch(context.Background(), b.ID))

		d, err := repo.GetDetail(context.Background(), u.ID, b.ID)
		require.NoError(t, err)
		require.Equal(t, domain.FetchOK, d.FetchStatus)
		require.Nil(t, d.FaviconID)
	})

	t.Run("a deleted bookmark is discarded without error", func(t *testing.T) {
		u := newUser()
		b := newPending(u, "/page")
		require.NoError(t, db.Delete(&domain.Bookmark{}, "id = ?", b.ID).Error)

		require.NoError(t, svc.Fetch(context.Background(), b.ID))
		require.Zero(t, version(u))
	})
}
