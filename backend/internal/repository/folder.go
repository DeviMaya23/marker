package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"

	"marker/internal/domain"
)

// FolderRepository is the database access for folders. Methods are added as features
// need them.
type FolderRepository struct {
	db *gorm.DB
}

func NewFolderRepository(db *gorm.DB) *FolderRepository {
	return &FolderRepository{db: db}
}

// GetFolder returns the user's folder. Another user's folder is gorm.ErrRecordNotFound.
func (r *FolderRepository) GetFolder(ctx context.Context, userID, id uuid.UUID) (domain.Folder, error) {
	var f domain.Folder
	err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&f).Error
	return f, err
}

const folderSiblingNameIndex = "folders_sibling_name_key"

// folderWithCountSQL selects folders with the number of live bookmarks directly in each.
const folderWithCountSQL = `
SELECT f.id, f.user_id, f.name, f.parent_id, f.depth, f.created_at, f.updated_at,
       (SELECT count(*) FROM bookmarks b
         WHERE b.folder_id = f.id AND b.user_id = f.user_id AND b.deleted_at IS NULL) AS bookmark_count
FROM folders f
`

func getFolderWithCount(tx *gorm.DB, userID, id uuid.UUID) (domain.FolderWithCount, error) {
	var rows []domain.FolderWithCount
	if err := tx.Raw(folderWithCountSQL+`WHERE f.id = ? AND f.user_id = ?`, id, userID).Scan(&rows).Error; err != nil {
		return domain.FolderWithCount{}, err
	}
	if len(rows) == 0 {
		return domain.FolderWithCount{}, gorm.ErrRecordNotFound
	}
	return rows[0], nil
}

// subtreeOf returns the folder and all its descendants. Both the start and every step
// of the walk filter by user_id, so it cannot leave the caller's folders.
func subtreeOf(tx *gorm.DB, userID, id uuid.UUID) ([]domain.Folder, error) {
	var rows []domain.Folder
	err := tx.Raw(`
WITH RECURSIVE sub AS (
    SELECT * FROM folders WHERE id = ? AND user_id = ?
    UNION ALL
    SELECT f.* FROM folders f JOIN sub ON f.parent_id = sub.id WHERE f.user_id = ?
) SELECT id, user_id, name, parent_id, depth, created_at, updated_at FROM sub`, id, userID, userID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return rows, nil
}

// folderWriteError maps the constraint violations a folder write can hit.
func folderWriteError(err error) error {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return err
	}
	switch {
	case pgErr.Code == pgUniqueViolation && pgErr.ConstraintName == folderSiblingNameIndex:
		return domain.ErrFolderNameConflict
	case pgErr.Code == pgForeignKeyViolation:
		return gorm.ErrRecordNotFound // the parent was deleted meanwhile
	}
	return err
}

// List returns all of the user's folders ordered by lower-cased name, then id.
func (r *FolderRepository) List(ctx context.Context, userID uuid.UUID) ([]domain.FolderWithCount, error) {
	rows := []domain.FolderWithCount{}
	err := r.db.WithContext(ctx).
		Raw(folderWithCountSQL+`WHERE f.user_id = ? ORDER BY lower(f.name), f.id`, userID).Scan(&rows).Error
	return rows, err
}

// Get returns the user's folder with its live bookmark count.
func (r *FolderRepository) Get(ctx context.Context, userID, id uuid.UUID) (domain.FolderWithCount, error) {
	return getFolderWithCount(r.db.WithContext(ctx), userID, id)
}

// Subtree returns the user's folder and all its descendants.
func (r *FolderRepository) Subtree(ctx context.Context, userID, id uuid.UUID) ([]domain.Folder, error) {
	return subtreeOf(r.db.WithContext(ctx), userID, id)
}

// Create inserts the folder and increments the user's version, in one transaction that
// first takes the user's folder lock. The depth comes from the parent as read under the
// lock (f.Depth is ignored), so a parent that has since moved deeper or been deleted is
// caught here.
func (r *FolderRepository) Create(ctx context.Context, f domain.Folder) (domain.FolderWithCount, error) {
	var out domain.FolderWithCount
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockUser(tx, f.UserID); err != nil {
			return err
		}
		f.Depth = 1
		if f.ParentID != nil {
			parent, err := getFolderWithCount(tx, f.UserID, *f.ParentID)
			if err != nil {
				return err
			}
			if parent.Depth >= domain.MaxFolderDepth {
				return domain.ErrFolderDepthExceeded
			}
			f.Depth = parent.Depth + 1
		}
		if err := tx.Create(&f).Error; err != nil {
			return folderWriteError(err)
		}
		if err := bumpUserVersion(tx, f.UserID); err != nil {
			return err
		}
		var err error
		out, err = getFolderWithCount(tx, f.UserID, f.ID)
		return err
	})
	if err != nil {
		return domain.FolderWithCount{}, err
	}
	return out, nil
}

// Update writes the set fields of u, sets the depth of the folder and every descendant
// when it moves, and increments the user's version, in one transaction that first takes
// the user's folder lock. Cycle and depth are checked again on the tree read under the
// lock. An update that sets nothing writes nothing.
func (r *FolderRepository) Update(ctx context.Context, userID, id uuid.UUID, u domain.FolderUpdate) (domain.FolderWithCount, error) {
	var out domain.FolderWithCount
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockUser(tx, userID); err != nil {
			return err
		}
		subtree, err := subtreeOf(tx, userID, id)
		if err != nil {
			return err
		}
		// The subtree holds the folder and its descendants, in no promised order.
		var folder domain.Folder
		var descendants []uuid.UUID
		for _, f := range subtree {
			if f.ID == id {
				folder = f
			} else {
				descendants = append(descendants, f.ID)
			}
		}
		if u.Empty() {
			out, err = getFolderWithCount(tx, userID, id)
			return err
		}

		set := map[string]any{"updated_at": gorm.Expr("now()")}
		if u.Name.Set {
			set["name"] = u.Name.Value
		}
		delta := 0
		if u.ParentID.Set {
			var parent *domain.Folder
			if !u.ParentID.Null {
				p, err := getFolderWithCount(tx, userID, u.ParentID.Value)
				if err != nil {
					return err
				}
				parent = &p.Folder
			}
			newDepth, err := domain.PlanMove(folder, parent, subtree)
			if err != nil {
				return err
			}
			delta = newDepth - folder.Depth
			set["depth"] = newDepth
			if parent == nil {
				set["parent_id"] = nil
			} else {
				set["parent_id"] = parent.ID
			}
		}

		if err := tx.Model(&domain.Folder{}).Where("id = ? AND user_id = ?", id, userID).Updates(set).Error; err != nil {
			return folderWriteError(err)
		}
		if delta != 0 && len(descendants) > 0 {
			if err := tx.Exec(`UPDATE folders SET depth = depth + ? WHERE user_id = ? AND id IN ?`, delta, userID, descendants).Error; err != nil {
				return err
			}
		}
		if err := bumpUserVersion(tx, userID); err != nil {
			return err
		}
		out, err = getFolderWithCount(tx, userID, id)
		return err
	})
	if err != nil {
		return domain.FolderWithCount{}, err
	}
	return out, nil
}

// Delete trashes the live bookmarks of the folder's subtree (one deleted_at for all,
// already-trashed ones untouched), deletes the folder (its subfolders go through the
// foreign key, and every bookmark that pointed into the subtree ends with a null
// folder_id), and increments the user's version, in one transaction that first takes
// the user's folder lock.
func (r *FolderRepository) Delete(ctx context.Context, userID, id uuid.UUID) (domain.FolderDeletion, error) {
	var out domain.FolderDeletion
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockUser(tx, userID); err != nil {
			return err
		}
		subtree, err := subtreeOf(tx, userID, id)
		if err != nil {
			return err
		}
		ids := make([]uuid.UUID, len(subtree))
		for i, f := range subtree {
			ids[i] = f.ID
		}

		// One statement, so now() is one value for every row.
		res := tx.Exec(`UPDATE bookmarks SET deleted_at = now()
WHERE user_id = ? AND deleted_at IS NULL AND folder_id IN ?`, userID, ids)
		if res.Error != nil {
			return res.Error
		}
		out.TrashedBookmarks = int(res.RowsAffected)

		res = tx.Exec(`DELETE FROM folders WHERE id = ? AND user_id = ?`, id, userID)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		out.DeletedFolders = len(ids)
		return bumpUserVersion(tx, userID)
	})
	if err != nil {
		return domain.FolderDeletion{}, err
	}
	return out, nil
}
