package worker

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
)

const (
	// fetchQueue is separate from the default queue so its concurrency cap (NFR-12)
	// applies to page fetches only, never to the sweep.
	fetchQueue = "fetch"

	defaultFetchConcurrency = 4

	// rescueAfter is how long a job may sit in "running" before River's rescuer
	// treats it as interrupted. It must stay well above fetchTimeout.
	rescueAfter = time.Minute
)

// Deps are the things the workers call into. Both are interfaces defined here, by
// the consumer, and satisfied by the usecase and repository layers.
type Deps struct {
	Fetcher BookmarkFetcher
	Pending PendingLister
}

// Options configures the queue.
type Options struct {
	// FetchConcurrency caps concurrent page fetches (NFR-12). Zero means the default (4).
	FetchConcurrency int
}

// Queue runs background jobs on River and enqueues new ones.
type Queue struct {
	client *river.Client[pgx.Tx]
}

// New builds the queue. Nothing runs until Start. River's own tables must already
// exist (see internal/platform/migrate).
func New(pool *pgxpool.Pool, deps Deps, opts Options) (*Queue, error) {
	concurrency := opts.FetchConcurrency
	if concurrency <= 0 {
		concurrency = defaultFetchConcurrency
	}

	workers := river.NewWorkers()
	river.AddWorker(workers, &FetchWorker{fetcher: deps.Fetcher})
	river.AddWorker(workers, &SweepWorker{pending: deps.Pending})

	client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{
		Logger: slog.Default(),
		Queues: map[string]river.QueueConfig{
			river.QueueDefault: {MaxWorkers: 1},
			fetchQueue:         {MaxWorkers: concurrency},
		},
		Workers:              workers,
		RescueStuckJobsAfter: rescueAfter,
		PeriodicJobs: []*river.PeriodicJob{
			river.NewPeriodicJob(
				river.PeriodicInterval(sweepInterval),
				func() (river.JobArgs, *river.InsertOpts) { return SweepArgs{}, nil },
				&river.PeriodicJobOpts{RunOnStart: true},
			),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("create river client: %w", err)
	}
	return &Queue{client: client}, nil
}

// Start begins processing jobs. It returns once the client is running.
func (q *Queue) Start(ctx context.Context) error {
	return q.client.Start(ctx)
}

// Stop stops fetching new jobs and waits for running ones, until ctx expires.
func (q *Queue) Stop(ctx context.Context) error {
	return q.client.Stop(ctx)
}

// EnqueueFetch queues the page fetch for a bookmark.
//
// Call it only after the transaction that created the bookmark has committed, never
// inside a GORM transaction: the job would otherwise be able to run before the row
// is visible. If the process dies before this call, the bookmark stays pending and
// the sweep enqueues it later. Enqueuing the same bookmark twice is harmless; River's
// unique-jobs option keeps one job per bookmark.
func (q *Queue) EnqueueFetch(ctx context.Context, bookmarkID uuid.UUID) error {
	if _, err := q.client.Insert(ctx, FetchArgs{BookmarkID: bookmarkID}, nil); err != nil {
		return fmt.Errorf("enqueue fetch for bookmark %s: %w", bookmarkID, err)
	}
	return nil
}
