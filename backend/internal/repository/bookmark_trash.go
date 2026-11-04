package repository

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"marker/internal/domain"
)

// Trash moves the user's live bookmark to the trash and increments the user's version,
// in one transaction. The UPDATE carries `deleted_at IS NULL`, so of two simultaneous
// deletes exactly one succeeds and the other gets domain.ErrBookmarkInTrash. Nothing
// else about the bookmark changes.
func (r *BookmarkRepository) Trash(ctx context.Context, userID, id uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Exec(`UPDATE bookmarks SET deleted_at = now() WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, id, userID)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			b, err := getBookmark(tx, userID, id)
			if err != nil {
				return err
			}
			if b.DeletedAt != nil {
				return domain.ErrBookmarkInTrash
			}
			return errNotWritten
		}
		return bumpUserVersion(tx, userID)
	})
}

// Restore takes the user's trashed bookmark out of the trash and clears its folder (it
// returns at the top level), and increments the user's version, in one transaction. A
// live bookmark is domain.ErrBookmarkNotInTrash. It does not check the bookmark cap:
// the count does not change.
func (r *BookmarkRepository) Restore(ctx context.Context, userID, id uuid.UUID) (domain.Bookmark, error) {
	var out domain.Bookmark
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Exec(`UPDATE bookmarks SET deleted_at = NULL, folder_id = NULL WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL`, id, userID)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			b, err := getBookmark(tx, userID, id)
			if err != nil {
				return err
			}
			if b.DeletedAt == nil {
				return domain.ErrBookmarkNotInTrash
			}
			return errNotWritten
		}
		if err := bumpUserVersion(tx, userID); err != nil {
			return err
		}
		var err error
		out, err = getBookmark(tx, userID, id)
		return err
	})
	if err != nil {
		return domain.Bookmark{}, err
	}
	return out, nil
}

// EmptyTrash permanently deletes all of the user's trashed bookmarks in one statement
// and returns how many. Their bookmark_content goes with them through the foreign key;
// favicons are shared per host and stay. It increments the user's version, in the same
// transaction, only when it deleted something.
func (r *BookmarkRepository) EmptyTrash(ctx context.Context, userID uuid.UUID) (int64, error) {
	var n int64
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Exec(`DELETE FROM bookmarks WHERE user_id = ? AND deleted_at IS NOT NULL`, userID)
		if res.Error != nil {
			return res.Error
		}
		n = res.RowsAffected
		if n == 0 {
			return nil
		}
		return bumpUserVersion(tx, userID)
	})
	if err != nil {
		return 0, err
	}
	return n, nil
}
