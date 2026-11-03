package usecase

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"marker/internal/domain"
	"marker/pkg/safehttp"
)

// stubPageFetcher returns a canned page or error and records the requested URL.
type stubPageFetcher struct {
	page     domain.FetchedPage
	err      error
	gotURL   string
	deadline time.Duration
	called   int
}

func (s *stubPageFetcher) FetchPage(ctx context.Context, url string) (domain.FetchedPage, error) {
	s.called++
	s.gotURL = url
	if d, ok := ctx.Deadline(); ok {
		s.deadline = time.Until(d)
	}
	return s.page, s.err
}

func pendingBookmark() domain.Bookmark {
	return domain.Bookmark{ID: uuid.New(), UserID: uuid.New(), URL: "https://example.com/a", FetchStatus: domain.FetchPending}
}

func TestFetchService_Success(t *testing.T) {
	b := pendingBookmark()
	store := newFakeFetchStore(b)
	icon := &domain.FaviconData{Host: "example.com", ContentType: "image/png", Data: []byte{1, 2}}
	fetcher := &stubPageFetcher{page: domain.FetchedPage{Title: "Fetched", Text: "page text", Favicon: icon}}

	require.NoError(t, NewFetchService(store, fetcher).Fetch(context.Background(), b.ID))

	got := store.bookmarks[b.ID]
	require.Equal(t, domain.FetchOK, got.FetchStatus)
	require.Equal(t, "page text", store.contents[b.ID])
	require.NotNil(t, got.FaviconID)
	require.Equal(t, *icon, store.favicons[*got.FaviconID])
	require.EqualValues(t, 1, store.versions[b.UserID])
	require.Equal(t, "https://example.com/a", fetcher.gotURL, "the URL as submitted is fetched")
	require.LessOrEqual(t, fetcher.deadline, 11*time.Second, "the fetch has its own 11s deadline")
	require.Greater(t, fetcher.deadline, 10*time.Second)
}

func TestFetchService_Title(t *testing.T) {
	t.Run("empty title is filled", func(t *testing.T) {
		b := pendingBookmark()
		store := newFakeFetchStore(b)
		require.NoError(t, NewFetchService(store, &stubPageFetcher{page: domain.FetchedPage{Title: "From page"}}).Fetch(context.Background(), b.ID))
		require.Equal(t, "From page", store.bookmarks[b.ID].Title)
	})
	t.Run("supplied title is kept", func(t *testing.T) {
		b := pendingBookmark()
		b.Title = "Mine"
		store := newFakeFetchStore(b)
		require.NoError(t, NewFetchService(store, &stubPageFetcher{page: domain.FetchedPage{Title: "From page"}}).Fetch(context.Background(), b.ID))
		require.Equal(t, "Mine", store.bookmarks[b.ID].Title)
	})
}

func TestFetchService_LeavesOtherFieldsAlone(t *testing.T) {
	for _, trashed := range []bool{false, true} {
		b := pendingBookmark()
		folder := uuid.New()
		b.Note, b.FolderID = "my note", &folder
		if trashed {
			now := time.Now()
			b.DeletedAt = &now
		}
		store := newFakeFetchStore(b)
		require.NoError(t, NewFetchService(store, &stubPageFetcher{page: domain.FetchedPage{Title: "T", Text: "x"}}).Fetch(context.Background(), b.ID))

		got := store.bookmarks[b.ID]
		require.Equal(t, "my note", got.Note)
		require.Equal(t, &folder, got.FolderID)
		require.Equal(t, trashed, got.DeletedAt != nil)
		require.Equal(t, domain.FetchOK, got.FetchStatus, "a trashed bookmark is still updated")
	}
}

func TestFetchService_Discards(t *testing.T) {
	t.Run("unknown bookmark", func(t *testing.T) {
		fetcher := &stubPageFetcher{}
		require.NoError(t, NewFetchService(newFakeFetchStore(), fetcher).Fetch(context.Background(), uuid.New()))
		require.Zero(t, fetcher.called)
	})
	t.Run("deleted while fetching, success", func(t *testing.T) {
		b := pendingBookmark()
		store := &vanishingStore{fakeFetchStore: newFakeFetchStore(b)}
		require.NoError(t, NewFetchService(store, &stubPageFetcher{page: domain.FetchedPage{Text: "x"}}).Fetch(context.Background(), b.ID))
		require.Empty(t, store.contents)
	})
	t.Run("deleted while fetching, failure", func(t *testing.T) {
		b := pendingBookmark()
		store := &vanishingStore{fakeFetchStore: newFakeFetchStore(b)}
		require.NoError(t, NewFetchService(store, &stubPageFetcher{err: errors.New("boom")}).Fetch(context.Background(), b.ID))
	})
}

// vanishingStore deletes the bookmark right after it was loaded, like an account
// deletion that lands while the page is downloading.
type vanishingStore struct{ *fakeFetchStore }

func (v *vanishingStore) FindForFetch(ctx context.Context, id uuid.UUID) (domain.Bookmark, error) {
	b, err := v.fakeFetchStore.FindForFetch(ctx, id)
	delete(v.bookmarks, id)
	return b, err
}

func TestFetchService_Failure(t *testing.T) {
	cases := map[string]error{
		"blocked address": safehttp.ErrBlockedAddress,
		"timeout":         context.DeadlineExceeded,
		"non-2xx":         &safehttp.StatusError{Code: 500},
		"content type":    safehttp.ErrUnsupportedContentType,
		"too large":       safehttp.ErrTooLarge,
		"unparseable":     errors.New("extract page: bad html"),
		"too many redirs": safehttp.ErrTooManyRedirects,
	}
	for name, ferr := range cases {
		t.Run(name, func(t *testing.T) {
			b := pendingBookmark()
			b.Title = "Mine"
			store := newFakeFetchStore(b)
			require.NoError(t, NewFetchService(store, &stubPageFetcher{err: ferr}).Fetch(context.Background(), b.ID))

			got := store.bookmarks[b.ID]
			require.Equal(t, domain.FetchFailed, got.FetchStatus)
			require.Equal(t, "Mine", got.Title)
			require.EqualValues(t, 1, store.versions[b.UserID])
			require.Empty(t, store.contents)
		})
	}
}

func TestFetchService_FaviconFailureAloneIsOK(t *testing.T) {
	b := pendingBookmark()
	store := newFakeFetchStore(b)
	// The adaptor reports a missing or failed favicon as a nil Favicon.
	require.NoError(t, NewFetchService(store, &stubPageFetcher{page: domain.FetchedPage{Title: "T", Text: "x"}}).Fetch(context.Background(), b.ID))

	got := store.bookmarks[b.ID]
	require.Equal(t, domain.FetchOK, got.FetchStatus)
	require.Nil(t, got.FaviconID)
}

func TestFetchService_NotPendingIsLeftAlone(t *testing.T) {
	for _, status := range []domain.FetchStatus{domain.FetchOK, domain.FetchFailed} {
		b := pendingBookmark()
		b.FetchStatus = status
		store := newFakeFetchStore(b)
		fetcher := &stubPageFetcher{page: domain.FetchedPage{Title: "T", Text: "x"}}

		require.NoError(t, NewFetchService(store, fetcher).Fetch(context.Background(), b.ID))
		require.Zero(t, fetcher.called)
		require.Equal(t, status, store.bookmarks[b.ID].FetchStatus)
		require.Zero(t, store.versions[b.UserID])
	}
}

func TestFetchService_Truncates(t *testing.T) {
	t.Run("text at a rune boundary", func(t *testing.T) {
		b := pendingBookmark()
		store := newFakeFetchStore(b)
		// "é" is two bytes; an odd limit would cut the last one in half if cut blindly.
		text := strings.Repeat("é", domain.MaxContentBytes) // twice the limit
		require.NoError(t, NewFetchService(store, &stubPageFetcher{page: domain.FetchedPage{Text: text}}).Fetch(context.Background(), b.ID))

		got := store.contents[b.ID]
		require.Equal(t, domain.FetchOK, store.bookmarks[b.ID].FetchStatus, "truncated, not rejected")
		require.LessOrEqual(t, len(got), domain.MaxContentBytes)
		require.Equal(t, strings.Repeat("é", len(got)/2), got)
	})
	t.Run("text over the limit with a split character", func(t *testing.T) {
		require.Equal(t, "ab", truncateBytes("abé", 3), "does not keep half of é")
		require.Equal(t, "abé", truncateBytes("abé", 4))
		require.Equal(t, "", truncateBytes("é", 1))
	})
	t.Run("title", func(t *testing.T) {
		b := pendingBookmark()
		store := newFakeFetchStore(b)
		title := strings.Repeat("é", 400)
		require.NoError(t, NewFetchService(store, &stubPageFetcher{page: domain.FetchedPage{Title: title}}).Fetch(context.Background(), b.ID))
		require.Equal(t, strings.Repeat("é", 300), store.bookmarks[b.ID].Title)
		require.Equal(t, domain.FetchOK, store.bookmarks[b.ID].FetchStatus)
	})
}

func TestFetchService_StoreFailureIsRecordedAsFailed(t *testing.T) {
	// A result the database refuses must not leave the bookmark pending: the sweep
	// would queue the same failing job every minute.
	b := pendingBookmark()
	store := &erroringStore{fakeFetchStore: newFakeFetchStore(b)}

	err := NewFetchService(store, &stubPageFetcher{page: domain.FetchedPage{Text: "x"}}).Fetch(context.Background(), b.ID)

	require.NoError(t, err)
	require.Equal(t, domain.FetchFailed, store.bookmarks[b.ID].FetchStatus)
	require.EqualValues(t, 1, store.versions[b.UserID])
}

func TestFetchService_StoreAndFailureWritesBothFailing(t *testing.T) {
	// If even the failure cannot be recorded the database is probably down: return the
	// error so the job fails, and leave the bookmark pending for the sweep.
	b := pendingBookmark()
	store := &erroringStore{fakeFetchStore: newFakeFetchStore(b), failureErr: errors.New("still down")}

	err := NewFetchService(store, &stubPageFetcher{page: domain.FetchedPage{Text: "x"}}).Fetch(context.Background(), b.ID)

	require.ErrorContains(t, err, "db down")
	require.Equal(t, domain.FetchPending, store.bookmarks[b.ID].FetchStatus)
}

type erroringStore struct {
	*fakeFetchStore
	failureErr error
}

func (erroringStore) RecordFetchSuccess(context.Context, domain.Bookmark, domain.FetchResult) error {
	return errors.New("db down")
}

func (s *erroringStore) RecordFetchFailure(ctx context.Context, b domain.Bookmark) error {
	if s.failureErr != nil {
		return s.failureErr
	}
	return s.fakeFetchStore.RecordFetchFailure(ctx, b)
}
