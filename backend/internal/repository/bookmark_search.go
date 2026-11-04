package repository

import (
	"context"

	"gorm.io/gorm/clause"

	"marker/internal/domain"
)

// Two fixed fragments, chosen by q.IncludeNotes, never built from request input. The
// notes variant adds the note to the stored vector at the lowest weight, for this query
// only; search_vector itself never holds the note.
const (
	searchVector      = `search_vector`
	searchVectorNotes = `(search_vector || setweight(to_tsvector('english', COALESCE(note, '')), 'D'))`
)

// Search returns up to q.Limit of the user's live bookmarks that match q.Query by whole
// words (websearch_to_tsquery, english, as refreshSearchVector), best first, starting at
// q.Offset. The order is ts_rank DESC, created_at DESC, id DESC, which is total. OFFSET
// is allowed here because a relevance score is not a key to continue from. It selects
// the summary columns only and never reads bookmark_content: the page text is already in
// search_vector. The query text, the folder ids and the offset are bound parameters.
func (r *BookmarkRepository) Search(ctx context.Context, q domain.BookmarkSearchQuery) ([]domain.Bookmark, error) {
	vector := searchVector
	if q.IncludeNotes {
		vector = searchVectorNotes
	}
	tx := r.db.WithContext(ctx).Model(&domain.Bookmark{}).
		Select(summaryColumns).
		Where("user_id = ? AND deleted_at IS NULL", q.UserID).
		Where(vector+" @@ websearch_to_tsquery('english', ?)", q.Query)
	if q.FolderID != nil {
		tx = inFolderSubtree(tx, q.UserID, *q.FolderID)
	}

	var rows []domain.Bookmark
	err := tx.
		Order(clause.OrderBy{Expression: clause.Expr{
			SQL:  "ts_rank(" + vector + ", websearch_to_tsquery('english', ?)) DESC, created_at DESC, id DESC",
			Vars: []any{q.Query},
		}}).
		Offset(q.Offset).Limit(q.Limit).
		Find(&rows).Error
	return rows, err
}
