package usecase

import (
	"context"

	"github.com/google/uuid"

	"marker/internal/domain"
)

// BookmarkStore is the database access BookmarkService needs. Every method filters
// by userID; another user's bookmark is gorm.ErrRecordNotFound.
type BookmarkStore interface {
	// FindByNormalizedURL returns the user's bookmark, live or trashed, with that key.
	FindByNormalizedURL(ctx context.Context, userID uuid.UUID, normalizedURL string) (domain.Bookmark, error)
	// CountByUserID counts the user's bookmarks, trashed ones included.
	CountByUserID(ctx context.Context, userID uuid.UUID) (int64, error)
	// Create inserts the bookmark (setting its search vector) and increments the user's
	// version in one transaction. A unique-constraint violation on
	// (user_id, normalized_url) is returned as domain.ErrDuplicateBookmark.
	Create(ctx context.Context, b domain.Bookmark) error
	// GetDetail returns the user's bookmark, live or trashed, with its stored text.
	GetDetail(ctx context.Context, userID, id uuid.UUID) (domain.BookmarkDetail, error)
}
