package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"marker/internal/domain"
)

// BookmarkRepository is the database access for bookmarks. Methods are added as
// features need them.
type BookmarkRepository struct {
	db *gorm.DB
}

func NewBookmarkRepository(db *gorm.DB) *BookmarkRepository {
	return &BookmarkRepository{db: db}
}

// ListPendingIDs returns up to limit IDs of bookmarks whose fetch is still pending
// and that were created before olderThan, oldest first. Trashed bookmarks are
// included, because a fetch does not depend on trash state (FR-5c).
//
// This is the one query that spans all users: it is a system-level sweep, not a
// user-facing read, so it does not filter by user_id.
func (r *BookmarkRepository) ListPendingIDs(ctx context.Context, olderThan time.Time, limit int) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := r.db.WithContext(ctx).
		Model(&domain.Bookmark{}).
		Where("fetch_status = ? AND created_at < ?", domain.FetchPending, olderThan).
		Order("created_at ASC").
		Limit(limit).
		Pluck("id", &ids).Error
	return ids, err
}
