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
	// List returns up to q.Limit of the user's bookmarks as summaries (no page content),
	// starting strictly after q.After, in the order of q.Mode.
	List(ctx context.Context, q domain.BookmarkListQuery) ([]domain.Bookmark, error)
	// Get returns the user's bookmark, live or trashed, without its stored text.
	Get(ctx context.Context, userID, id uuid.UUID) (domain.Bookmark, error)
	// Update writes only the fields of u that are set, refreshes the search vector when
	// the title is set, and increments the user's version, in one transaction, and
	// returns the stored bookmark. It never writes a trashed bookmark: it returns
	// domain.ErrBookmarkInTrash (or gorm.ErrRecordNotFound if the bookmark is gone). A
	// folder that does not exist is gorm.ErrRecordNotFound.
	Update(ctx context.Context, userID, id uuid.UUID, u domain.BookmarkUpdate) (domain.Bookmark, error)
	// Trash sets deleted_at and increments the user's version in one transaction. An
	// already trashed bookmark is domain.ErrBookmarkInTrash.
	Trash(ctx context.Context, userID, id uuid.UUID) error
	// Restore clears deleted_at and folder_id and increments the user's version in one
	// transaction, and returns the bookmark. A live bookmark is
	// domain.ErrBookmarkNotInTrash.
	Restore(ctx context.Context, userID, id uuid.UUID) (domain.Bookmark, error)
	// EmptyTrash permanently deletes all of the user's trashed bookmarks and returns how
	// many. It increments the user's version only if it deleted any.
	EmptyTrash(ctx context.Context, userID uuid.UUID) (int64, error)
}
