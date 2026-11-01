package worker

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
)

const (
	// sweepInterval is how often the sweep runs.
	sweepInterval = time.Minute
	// pendingAge is how long a bookmark may stay pending before the sweep gives it a
	// job. Long enough not to race the normal enqueue right after a save.
	pendingAge = 2 * time.Minute
	// sweepBatch bounds the work of one sweep run.
	sweepBatch = 100
)

// PendingLister finds bookmarks whose fetch never got going. It is implemented by
// the repository layer.
type PendingLister interface {
	// ListPendingIDs returns up to limit IDs of bookmarks still pending that were
	// created before olderThan, oldest first.
	ListPendingIDs(ctx context.Context, olderThan time.Time, limit int) ([]uuid.UUID, error)
}

// SweepArgs is the payload of the periodic sweep job. It carries no data.
type SweepArgs struct{}

func (SweepArgs) Kind() string { return "sweep_pending_fetches" }

func (SweepArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{MaxAttempts: 1}
}

// SweepWorker heals the gap between committing a bookmark and enqueuing its job:
// a crash in between leaves a pending bookmark with no job. It also re-creates
// jobs that River discarded after a crash.
type SweepWorker struct {
	river.WorkerDefaults[SweepArgs]
	pending PendingLister
}

func (w *SweepWorker) Work(ctx context.Context, _ *river.Job[SweepArgs]) error {
	ids, err := w.pending.ListPendingIDs(ctx, time.Now().Add(-pendingAge), sweepBatch)
	if err != nil {
		return fmt.Errorf("list pending bookmarks: %w", err)
	}

	client := river.ClientFromContext[pgx.Tx](ctx)
	for _, id := range ids {
		// FetchArgs is unique by args, so a bookmark that already has a live job is skipped.
		if _, err := client.Insert(ctx, FetchArgs{BookmarkID: id}, nil); err != nil {
			return fmt.Errorf("enqueue fetch for bookmark %s: %w", id, err)
		}
	}
	return nil
}
