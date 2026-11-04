package repository

import (
	"context"

	"marker/internal/domain"
)

// summaryColumns are every bookmarks column a BookmarkSummary needs. The list never
// selects or joins bookmark_content.
var summaryColumns = []string{
	"id", "user_id", "url", "title", "note", "folder_id", "favicon_id",
	"fetch_status", "created_at", "updated_at", "deleted_at",
}

// List returns up to q.Limit of the user's bookmarks, starting strictly after q.After.
// The live list is ordered by (created_at, id) descending, the trash by (deleted_at, id)
// descending. Paging is by row-value comparison on that pair, never OFFSET, and the
// cursor values are bound parameters.
func (r *BookmarkRepository) List(ctx context.Context, q domain.BookmarkListQuery) ([]domain.Bookmark, error) {
	sortCol := "created_at"
	tx := r.db.WithContext(ctx).Model(&domain.Bookmark{}).Select(summaryColumns).Where("user_id = ?", q.UserID)
	if q.Mode == domain.ListTrash {
		sortCol = "deleted_at"
		tx = tx.Where("deleted_at IS NOT NULL")
	} else {
		tx = tx.Where("deleted_at IS NULL")
	}
	if q.After != nil {
		// sortCol is one of two constants above, never request input.
		tx = tx.Where("("+sortCol+", id) < (?, ?)", q.After.At, q.After.ID)
	}

	var rows []domain.Bookmark
	err := tx.Order(sortCol + " DESC, id DESC").Limit(q.Limit).Find(&rows).Error
	return rows, err
}
