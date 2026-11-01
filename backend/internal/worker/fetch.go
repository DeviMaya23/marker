package worker

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/riverqueue/river"
)

// fetchTimeout is the longest one fetch may run (NFR-11).
const fetchTimeout = 15 * time.Second

// BookmarkFetcher fetches the page for a bookmark and records the outcome. It is
// implemented by the usecase layer, which owns every rule about what a finished
// fetch may update (FR-5b, FR-5c) and records a failed fetch itself.
type BookmarkFetcher interface {
	Fetch(ctx context.Context, bookmarkID uuid.UUID) error
}

// FetchArgs is the payload of a page-fetch job.
type FetchArgs struct {
	BookmarkID uuid.UUID `json:"bookmark_id"`
}

func (FetchArgs) Kind() string { return "fetch_bookmark" }

func (FetchArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue: fetchQueue,
		// One attempt: retrying failed fetches is out of scope. The usecase records
		// a failed fetch itself, and the sweep re-creates a job for a bookmark whose
		// job was lost to a crash.
		MaxAttempts: 1,
		// One job per bookmark, whoever enqueues it (the save path or the sweep).
		// River ignores cancelled and discarded jobs when checking, so a bookmark
		// whose job was discarded can be enqueued again.
		UniqueOpts: river.UniqueOpts{ByArgs: true},
	}
}

// FetchWorker is a thin delivery layer: it unpacks the job and calls the usecase.
type FetchWorker struct {
	river.WorkerDefaults[FetchArgs]
	fetcher BookmarkFetcher
}

func (w *FetchWorker) Timeout(*river.Job[FetchArgs]) time.Duration { return fetchTimeout }

func (w *FetchWorker) Work(ctx context.Context, job *river.Job[FetchArgs]) error {
	return w.fetcher.Fetch(ctx, job.Args.BookmarkID)
}
