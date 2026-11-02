package usecase

import (
	"context"

	"github.com/google/uuid"

	"marker/internal/domain"
)

// FetchStore is the database access FetchService needs.
type FetchStore interface {
	// FindForFetch loads a bookmark by id alone, with no user filter: a fetch job
	// carries no user. This is a system-level exception to the rule that every query
	// filters by user_id, like the sweep. It returns gorm.ErrRecordNotFound if the
	// bookmark is gone.
	FindForFetch(ctx context.Context, id uuid.UUID) (domain.Bookmark, error)
	// RecordFetchSuccess stores the page text and favicon, fills an empty title,
	// refreshes the search vector, sets fetch_status ok and increments the user's
	// version, in one transaction. It touches nothing else. If the bookmark or its
	// user no longer exists it returns gorm.ErrRecordNotFound and stores nothing.
	RecordFetchSuccess(ctx context.Context, b domain.Bookmark, result domain.FetchResult) error
	// RecordFetchFailure sets fetch_status failed and increments the user's version in
	// one transaction. It returns gorm.ErrRecordNotFound if the bookmark or its user
	// no longer exists.
	RecordFetchFailure(ctx context.Context, b domain.Bookmark) error
}
