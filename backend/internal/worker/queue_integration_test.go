//go:build integration

package worker_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"marker/internal/domain"
	"marker/internal/repository"
	"marker/internal/testutil"
	"marker/internal/worker"
)

// recordingFetcher stands in for the fetch usecase and records which bookmarks it saw.
type recordingFetcher struct {
	mu    sync.Mutex
	calls map[uuid.UUID]int
}

func newRecordingFetcher() *recordingFetcher {
	return &recordingFetcher{calls: map[uuid.UUID]int{}}
}

func (r *recordingFetcher) Fetch(_ context.Context, id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls[id]++
	return nil
}

func (r *recordingFetcher) count(id uuid.UUID) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.calls[id]
}

// startQueue runs a real River queue against the shared test database and stops it
// when the test ends. The sweep runs once at start.
func startQueue(t *testing.T, fetcher worker.BookmarkFetcher) *worker.Queue {
	t.Helper()
	pool := testutil.NewPool(t)
	db := testutil.NewDB(t)

	q, err := worker.New(pool, worker.Deps{
		Fetcher: fetcher,
		Pending: repository.NewBookmarkRepository(db),
	}, worker.Options{FetchConcurrency: 2})
	require.NoError(t, err)
	require.NoError(t, q.Start(context.Background()))

	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = q.Stop(ctx)
	})
	return q
}

func TestQueue_EnqueuedFetchRunsOnce(t *testing.T) {
	fetcher := newRecordingFetcher()
	q := startQueue(t, fetcher)

	id := domain.NewID()
	require.NoError(t, q.EnqueueFetch(context.Background(), id))
	// A second enqueue for the same bookmark must not create a second job.
	require.NoError(t, q.EnqueueFetch(context.Background(), id))

	require.Eventually(t, func() bool { return fetcher.count(id) == 1 }, 15*time.Second, 100*time.Millisecond)
	require.Never(t, func() bool { return fetcher.count(id) > 1 }, 2*time.Second, 100*time.Millisecond)
}

func TestQueue_SweepEnqueuesOldPendingBookmarksOnly(t *testing.T) {
	db := testutil.NewDB(t)
	user := domain.User{ID: domain.NewID(), IdpID: "idp|" + domain.NewID().String()}
	require.NoError(t, db.Create(&user).Error)

	oldPending := domain.Bookmark{
		ID: domain.NewID(), UserID: user.ID, URL: "https://example.com/sweep-old",
		NormalizedURL: "https://example.com/sweep-old", FetchStatus: domain.FetchPending,
	}
	require.NoError(t, db.Create(&oldPending).Error)
	require.NoError(t, db.Model(&oldPending).UpdateColumn("created_at", time.Now().Add(-10*time.Minute)).Error)

	freshPending := domain.Bookmark{
		ID: domain.NewID(), UserID: user.ID, URL: "https://example.com/sweep-fresh",
		NormalizedURL: "https://example.com/sweep-fresh", FetchStatus: domain.FetchPending,
	}
	require.NoError(t, db.Create(&freshPending).Error)

	fetcher := newRecordingFetcher()
	startQueue(t, fetcher) // the sweep runs once at start

	require.Eventually(t, func() bool { return fetcher.count(oldPending.ID) == 1 }, 20*time.Second, 100*time.Millisecond)
	require.Never(t, func() bool { return fetcher.count(freshPending.ID) > 0 }, 2*time.Second, 100*time.Millisecond)
}
