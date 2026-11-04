package repository

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"marker/internal/domain"
)

// errNotWritten is a guarded UPDATE that changed no row although the re-read shows no
// reason; it should not happen and is reported as an internal error.
var errNotWritten = errors.New("bookmark write changed no row")

// Get returns the user's bookmark, live or trashed, without its stored text.
func (r *BookmarkRepository) Get(ctx context.Context, userID, id uuid.UUID) (domain.Bookmark, error) {
	return getBookmark(r.db.WithContext(ctx), userID, id)
}

func getBookmark(db *gorm.DB, userID, id uuid.UUID) (domain.Bookmark, error) {
	var b domain.Bookmark
	err := db.Where("id = ? AND user_id = ?", id, userID).First(&b).Error
	return b, err
}

// Update writes the fields of u that are set, and only those, to the user's live
// bookmark, then refreshes the search vector if the title was set and increments the
// user's version, all in one transaction. It returns the stored bookmark.
//
// The UPDATE itself carries `deleted_at IS NULL`, so a bookmark trashed after the
// caller looked at it is never written: zero rows changed makes it re-read the row and
// report gorm.ErrRecordNotFound or domain.ErrBookmarkInTrash. A non-null folder must
// belong to the user; that is checked inside the same statement, so a folder that is
// someone else's or does not exist changes nothing and is gorm.ErrRecordNotFound. A
// foreign key violation (the folder was deleted just before the write) is the same.
//
// A null note is stored as the empty string, which is how the schema holds "no note".
func (r *BookmarkRepository) Update(ctx context.Context, userID, id uuid.UUID, u domain.BookmarkUpdate) (domain.Bookmark, error) {
	sets := []string{"updated_at = now()"}
	var args []any
	if u.Title.Set {
		sets = append(sets, "title = ?")
		args = append(args, u.Title.Value)
	}
	if u.Note.Set {
		note := u.Note.Value
		if u.Note.Null {
			note = ""
		}
		sets = append(sets, "note = ?")
		args = append(args, note)
	}
	where := "id = ? AND user_id = ? AND deleted_at IS NULL"
	var whereArgs = []any{id, userID}
	if u.FolderID.Set {
		if u.FolderID.Null {
			sets = append(sets, "folder_id = NULL")
		} else {
			sets = append(sets, "folder_id = ?")
			args = append(args, u.FolderID.Value)
			where += " AND EXISTS (SELECT 1 FROM folders f WHERE f.id = ? AND f.user_id = ?)"
			whereArgs = append(whereArgs, u.FolderID.Value, userID)
		}
	}
	query := "UPDATE bookmarks SET " + strings.Join(sets, ", ") + " WHERE " + where
	args = append(args, whereArgs...)

	var out domain.Bookmark
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Exec(query, args...)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return r.whyNotWritten(tx, userID, id, u.FolderID.Set)
		}
		if u.Title.Set {
			if err := refreshSearchVector(tx, userID, id); err != nil {
				return err
			}
		}
		if err := bumpUserVersion(tx, userID); err != nil {
			return err
		}
		var err error
		out, err = getBookmark(tx, userID, id)
		return err
	})
	if pgErrorCode(err) == pgForeignKeyViolation {
		return domain.Bookmark{}, gorm.ErrRecordNotFound
	}
	if err != nil {
		return domain.Bookmark{}, err
	}
	return out, nil
}

// whyNotWritten re-reads a bookmark a guarded UPDATE did not change and says why: it is
// gone or not the user's (not found), it is trashed, or, if it is live, the folder did
// not qualify (not found).
func (r *BookmarkRepository) whyNotWritten(tx *gorm.DB, userID, id uuid.UUID, hadFolder bool) error {
	b, err := getBookmark(tx, userID, id)
	if err != nil {
		return err
	}
	if b.DeletedAt != nil {
		return domain.ErrBookmarkInTrash
	}
	if hadFolder {
		return gorm.ErrRecordNotFound
	}
	// A live bookmark with no folder condition cannot fail to update.
	return errNotWritten
}
