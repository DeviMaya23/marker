package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
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

const (
	pgUniqueViolation     = "23505"
	pgForeignKeyViolation = "23503"
)

// bumpUserVersion increments users.version, which every write transaction does
// (NFR-2). It returns gorm.ErrRecordNotFound if the user no longer exists.
func bumpUserVersion(tx *gorm.DB, userID uuid.UUID) error {
	res := tx.Exec(`UPDATE users SET version = version + 1 WHERE id = ?`, userID)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// refreshSearchVector rebuilds bookmarks.search_vector from the row's current title
// and URL and its stored content, with the english configuration and weights
// title A, URL B, content C. Call it in the transaction that changes any of them.
func refreshSearchVector(tx *gorm.DB, userID, bookmarkID uuid.UUID) error {
	res := tx.Exec(`
UPDATE bookmarks b SET search_vector =
    setweight(to_tsvector('english', b.title), 'A') ||
    setweight(to_tsvector('english', b.url), 'B') ||
    setweight(to_tsvector('english',
        COALESCE((SELECT c.text FROM bookmark_content c WHERE c.bookmark_id = b.id), '')), 'C')
WHERE b.id = ? AND b.user_id = ?`, bookmarkID, userID)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// pgErrorCode returns the SQLSTATE of a PostgreSQL error, or "".
func pgErrorCode(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code
	}
	return ""
}

// FindByNormalizedURL returns the user's bookmark with that key, live or trashed.
func (r *BookmarkRepository) FindByNormalizedURL(ctx context.Context, userID uuid.UUID, normalizedURL string) (domain.Bookmark, error) {
	var b domain.Bookmark
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND normalized_url = ?", userID, normalizedURL).
		First(&b).Error
	return b, err
}

// CountByUserID counts the user's bookmarks, trashed ones included (NFR-17).
func (r *BookmarkRepository) CountByUserID(ctx context.Context, userID uuid.UUID) (int64, error) {
	var n int64
	err := r.db.WithContext(ctx).Model(&domain.Bookmark{}).Where("user_id = ?", userID).Count(&n).Error
	return n, err
}

// Create inserts a bookmark, sets its search vector from title and URL and increments
// the user's version, in one transaction. The (user_id, normalized_url) unique
// constraint decides a race between two saves of the same URL: the loser gets
// domain.ErrDuplicateBookmark.
func (r *BookmarkRepository) Create(ctx context.Context, b domain.Bookmark) error {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&b).Error; err != nil {
			return err
		}
		if err := refreshSearchVector(tx, b.UserID, b.ID); err != nil {
			return err
		}
		return bumpUserVersion(tx, b.UserID)
	})
	if pgErrorCode(err) == pgUniqueViolation {
		return domain.ErrDuplicateBookmark
	}
	return err
}

// GetDetail returns the user's bookmark, trashed or not, with its stored text.
func (r *BookmarkRepository) GetDetail(ctx context.Context, userID, id uuid.UUID) (domain.BookmarkDetail, error) {
	db := r.db.WithContext(ctx)
	var b domain.Bookmark
	if err := db.Where("id = ? AND user_id = ?", id, userID).First(&b).Error; err != nil {
		return domain.BookmarkDetail{}, err
	}
	detail := domain.BookmarkDetail{Bookmark: b}

	// bookmark_content has no user_id: it is reached only through the bookmark that
	// was just loaded for this user.
	var contents []domain.BookmarkContent
	if err := db.Where("bookmark_id = ?", b.ID).Limit(1).Find(&contents).Error; err != nil {
		return domain.BookmarkDetail{}, err
	}
	if len(contents) == 1 {
		detail.Content = &contents[0].Text
	}
	return detail, nil
}

// FindForFetch loads a bookmark by id alone. A fetch job carries no user, so this is
// the second system-level exception to "every query filters by user_id", after
// ListPendingIDs. Everything the fetch does afterwards uses the bookmark's own user_id.
func (r *BookmarkRepository) FindForFetch(ctx context.Context, id uuid.UUID) (domain.Bookmark, error) {
	var b domain.Bookmark
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&b).Error
	return b, err
}

// RecordFetchSuccess stores a finished fetch in one transaction. It writes only
// content, favicon, fetch status, an empty title and the search vector (FR-5b,
// FR-5c); a trashed bookmark is updated like any other. If the bookmark or its user
// is gone, or the bookmark is no longer pending, nothing is stored and it returns
// gorm.ErrRecordNotFound.
func (r *BookmarkRepository) RecordFetchSuccess(ctx context.Context, b domain.Bookmark, result domain.FetchResult) error {
	return r.fetchTx(ctx, func(tx *gorm.DB) error {
		var faviconID any // nil leaves favicon_id unchanged
		if f := result.Favicon; f != nil {
			var id uuid.UUID
			// Row().Scan, not Raw().Scan: GORM would read a uuid.UUID as a byte array.
			err := tx.Raw(`
INSERT INTO favicons (id, user_id, host, content_type, data) VALUES (?, ?, ?, ?, ?)
ON CONFLICT (user_id, host) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data
RETURNING id`, domain.NewID(), b.UserID, f.Host, f.ContentType, f.Data).Row().Scan(&id)
			if err != nil {
				return err
			}
			faviconID = id
		}

		res := tx.Exec(`
UPDATE bookmarks SET
    fetch_status = 'ok',
    title = CASE WHEN title = '' THEN ? ELSE title END,
    favicon_id = COALESCE(?::uuid, favicon_id),
    updated_at = now()
WHERE id = ? AND user_id = ? AND fetch_status = 'pending'`,
			result.Title, faviconID, b.ID, b.UserID)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}

		if err := tx.Exec(`
INSERT INTO bookmark_content (bookmark_id, text) VALUES (?, ?)
ON CONFLICT (bookmark_id) DO UPDATE SET text = EXCLUDED.text`, b.ID, result.Text).Error; err != nil {
			return err
		}
		if err := refreshSearchVector(tx, b.UserID, b.ID); err != nil {
			return err
		}
		return bumpUserVersion(tx, b.UserID)
	})
}

// RecordFetchFailure marks a pending bookmark's fetch as failed and increments the
// user's version, in one transaction. If the bookmark or its user is gone, or the
// bookmark is no longer pending, it returns gorm.ErrRecordNotFound.
func (r *BookmarkRepository) RecordFetchFailure(ctx context.Context, b domain.Bookmark) error {
	return r.fetchTx(ctx, func(tx *gorm.DB) error {
		res := tx.Exec(`
UPDATE bookmarks SET fetch_status = 'failed', updated_at = now()
WHERE id = ? AND user_id = ? AND fetch_status = 'pending'`, b.ID, b.UserID)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return bumpUserVersion(tx, b.UserID)
	})
}

// fetchTx runs fn in a transaction and reports a foreign key violation, which means
// the user was deleted while the page downloaded, as gorm.ErrRecordNotFound.
func (r *BookmarkRepository) fetchTx(ctx context.Context, fn func(tx *gorm.DB) error) error {
	err := r.db.WithContext(ctx).Transaction(fn)
	if pgErrorCode(err) == pgForeignKeyViolation {
		return gorm.ErrRecordNotFound
	}
	return err
}
