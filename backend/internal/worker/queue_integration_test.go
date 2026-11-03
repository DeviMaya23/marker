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

// fakeLister stands in for the repository's pending-bookmark query. What that query
// returns is tested in repository/; here it only decides which IDs the sweep sees.
type fakeLister struct{ ids []uuid.UUID }

func (f fakeLister) ListPendingIDs(context.Context, time.Time, int) ([]uuid.UUID, error) {
	return f.ids, nil
}

// startQueue runs a real River queue against the shared test database and stops it
// when the test ends. The sweep runs once at start and enqueues whatever the lister
// returns.
func startQueue(t *testing.T, fetcher worker.BookmarkFetcher, pending worker.PendingLister) *worker.Queue {
	t.Helper()
	pool := testutil.NewPool(t)

	q, err := worker.New(pool, worker.Deps{
		Fetcher: fetcher,
		Pending: pending,
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
	q := startQueue(t, fetcher, fakeLister{})

	id := domain.NewID()
	require.NoError(t, q.EnqueueFetch(context.Background(), id))
	// A second enqueue for the same bookmark must not create a second job.
	require.NoError(t, q.EnqueueFetch(context.Background(), id))

	require.Eventually(t, func() bool { return fetcher.count(id) == 1 }, 15*time.Second, 100*time.Millisecond)
	require.Never(t, func() bool { return fetcher.count(id) > 1 }, 2*time.Second, 100*time.Millisecond)
}

func TestQueue_SweepEnqueuesWhatTheListerReturns(t *testing.T) {
	first, second := domain.NewID(), domain.NewID()
	notListed := domain.NewID()
	fetcher := newRecordingFetcher()

	// The first ID is returned twice: the sweep must still create one job for it.
	startQueue(t, fetcher, fakeLister{ids: []uuid.UUID{first, second, first}})

	require.Eventually(t, func() bool {
		return fetcher.count(first) == 1 && fetcher.count(second) == 1
	}, 20*time.Second, 100*time.Millisecond)
	require.Never(t, func() bool {
		return fetcher.count(first) > 1 || fetcher.count(second) > 1 || fetcher.count(notListed) > 0
	}, 2*time.Second, 100*time.Millisecond)
}
