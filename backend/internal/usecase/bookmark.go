package usecase

import (
	"context"
	"errors"
	"log/slog"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"marker/internal/domain"
)

// FolderLookup finds a folder owned by a user. Another user's folder is
// gorm.ErrRecordNotFound.
type FolderLookup interface {
	GetFolder(ctx context.Context, userID, id uuid.UUID) (domain.Folder, error)
}

// FetchEnqueuer queues the page fetch for a saved bookmark. It is satisfied by
// worker.Queue.
type FetchEnqueuer interface {
	EnqueueFetch(ctx context.Context, bookmarkID uuid.UUID) error
}

// BookmarkService saves and reads bookmarks.
type BookmarkService struct {
	bookmarks BookmarkStore
	folders   FolderLookup
	queue     FetchEnqueuer
	now       func() time.Time
}

func NewBookmarkService(bookmarks BookmarkStore, folders FolderLookup, queue FetchEnqueuer) *BookmarkService {
	return &BookmarkService{bookmarks: bookmarks, folders: folders, queue: queue, now: time.Now}
}

// CreateBookmarkInput is a save request. Title is empty if none was supplied.
type CreateBookmarkInput struct {
	URL      string
	Title    string
	FolderID *uuid.UUID
}

// Create saves a URL as a pending bookmark and queues its fetch. It never fetches the
// page itself (NFR-5).
func (s *BookmarkService) Create(ctx context.Context, userID uuid.UUID, in CreateBookmarkInput) (domain.Bookmark, error) {
	// 1. Validate.
	if _, err := domain.ParseBookmarkURL(in.URL); err != nil {
		return domain.Bookmark{}, err
	}
	var fields []domain.FieldError
	if utf8.RuneCountInString(in.URL) > domain.MaxURLLength {
		fields = append(fields, domain.FieldError{Field: "url", Code: domain.FieldCodeTooLong})
	}
	if utf8.RuneCountInString(in.Title) > domain.MaxTitleLength {
		fields = append(fields, domain.FieldError{Field: "title", Code: domain.FieldCodeTooLong})
	}
	if len(fields) > 0 {
		return domain.Bookmark{}, &domain.ValidationError{Fields: fields}
	}
	if in.FolderID != nil {
		if _, err := s.folders.GetFolder(ctx, userID, *in.FolderID); err != nil {
			return domain.Bookmark{}, err
		}
	}

	// 2. Normalize.
	normalized, err := domain.NormalizeURL(in.URL)
	if err != nil {
		return domain.Bookmark{}, err
	}

	// 3. Duplicate check, before the cap.
	if err := s.checkDuplicate(ctx, userID, normalized); err != nil {
		return domain.Bookmark{}, err
	}

	// 4. Cap check.
	count, err := s.bookmarks.CountByUserID(ctx, userID)
	if err != nil {
		return domain.Bookmark{}, err
	}
	if count >= domain.MaxBookmarks {
		return domain.Bookmark{}, domain.ErrBookmarkLimitReached
	}

	// 5. Insert. The store re-checks the URL and the cap under a lock on the user, and
	// the unique constraint backs that up. A duplicate it reports names the winner,
	// found by a lookup. If the winner is already gone (emptied from the trash in
	// between), the URL is free again, so try once more.
	now := s.now().UTC()
	b := domain.Bookmark{
		ID:            domain.NewID(),
		UserID:        userID,
		URL:           in.URL,
		NormalizedURL: normalized,
		Title:         in.Title,
		FolderID:      in.FolderID,
		FetchStatus:   domain.FetchPending,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	for attempt := 1; ; attempt++ {
		err := s.bookmarks.Create(ctx, b)
		if err == nil {
			break
		}
		if !errors.Is(err, domain.ErrDuplicateBookmark) {
			return domain.Bookmark{}, err
		}
		if dup := s.checkDuplicate(ctx, userID, normalized); dup != nil {
			return domain.Bookmark{}, dup
		}
		if attempt == 2 {
			return domain.Bookmark{}, domain.ErrDuplicateBookmark
		}
	}

	// 6. Enqueue after the commit. A failure is not the caller's problem: the sweep
	// picks up the pending bookmark.
	if err := s.queue.EnqueueFetch(ctx, b.ID); err != nil {
		slog.Warn("enqueue fetch failed; the sweep will recover it", "bookmark_id", b.ID, "error", err)
	}
	return b, nil
}

func (s *BookmarkService) checkDuplicate(ctx context.Context, userID uuid.UUID, normalized string) error {
	existing, err := s.bookmarks.FindByNormalizedURL(ctx, userID, normalized)
	switch {
	case err == nil:
		return &domain.DuplicateError{ExistingID: existing.ID, InTrash: existing.DeletedAt != nil}
	case errors.Is(err, gorm.ErrRecordNotFound):
		return nil
	default:
		return err
	}
}

// Get returns the user's bookmark, trashed or not.
func (s *BookmarkService) Get(ctx context.Context, userID, id uuid.UUID) (domain.BookmarkDetail, error) {
	return s.bookmarks.GetDetail(ctx, userID, id)
}
