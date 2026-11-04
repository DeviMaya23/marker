package usecase

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"marker/internal/domain"
)

// List returns one page of the user's live bookmarks or trash. It reads one row more
// than the page size to learn whether a next page exists; that row is never returned.
func (s *BookmarkService) List(ctx context.Context, userID uuid.UUID, in domain.ListBookmarksInput) (domain.BookmarkPage, error) {
	if in.IsSearch() {
		return s.search(ctx, userID, in)
	}
	mode := in.Mode()
	limit := in.Limit
	if limit <= 0 {
		limit = domain.DefaultListLimit
	}

	q := domain.BookmarkListQuery{UserID: userID, Mode: mode, Limit: limit + 1}
	if in.Cursor != "" {
		c, err := domain.DecodeCursor(in.Cursor, mode)
		if err != nil {
			return domain.BookmarkPage{}, &domain.ValidationError{Fields: []domain.FieldError{{Field: "cursor", Code: domain.FieldCodeInvalid}}}
		}
		q.After = &c
	}

	// The folder is checked after the cursor, and only for the live list.
	if in.FolderID != nil && mode == domain.ListLive {
		if _, err := s.folders.GetFolder(ctx, userID, *in.FolderID); err != nil {
			return domain.BookmarkPage{}, err
		}
		q.FolderID = in.FolderID
	}

	rows, err := s.bookmarks.List(ctx, q)
	if err != nil {
		return domain.BookmarkPage{}, err
	}

	page := domain.BookmarkPage{Items: rows}
	if len(rows) > limit {
		page.Items = rows[:limit]
		last := page.Items[limit-1]
		at := last.CreatedAt
		if mode == domain.ListTrash {
			if last.DeletedAt == nil {
				return domain.BookmarkPage{}, errors.New("trash row without deleted_at")
			}
			at = *last.DeletedAt
		}
		next := domain.EncodeCursor(domain.Cursor{Mode: mode, At: at, ID: last.ID})
		page.NextCursor = &next
	}
	if page.Items == nil {
		page.Items = []domain.Bookmark{}
	}
	return page, nil
}

// search returns one page of the user's live bookmarks that match in.Query, best first.
// Paging is by offset, carried in a cursor that is only valid for this same search.
func (s *BookmarkService) search(ctx context.Context, userID uuid.UUID, in domain.ListBookmarksInput) (domain.BookmarkPage, error) {
	limit := in.Limit
	if limit <= 0 {
		limit = domain.DefaultListLimit
	}
	fingerprint := domain.SearchFingerprint(in.Query, in.IncludeNotes, in.FolderID)

	offset := 0
	if in.Cursor != "" {
		o, err := domain.DecodeSearchCursor(in.Cursor, fingerprint)
		if err != nil {
			return domain.BookmarkPage{}, &domain.ValidationError{Fields: []domain.FieldError{{Field: "cursor", Code: domain.FieldCodeInvalid}}}
		}
		offset = o
	}

	if in.FolderID != nil {
		if _, err := s.folders.GetFolder(ctx, userID, *in.FolderID); err != nil {
			return domain.BookmarkPage{}, err
		}
	}

	rows, err := s.bookmarks.Search(ctx, domain.BookmarkSearchQuery{
		UserID:       userID,
		Query:        strings.TrimSpace(in.Query),
		IncludeNotes: in.IncludeNotes,
		FolderID:     in.FolderID,
		Offset:       offset,
		Limit:        limit + 1,
	})
	if err != nil {
		return domain.BookmarkPage{}, err
	}

	page := domain.BookmarkPage{Items: rows}
	if len(rows) > limit {
		page.Items = rows[:limit]
		next := domain.EncodeSearchCursor(offset+limit, fingerprint)
		page.NextCursor = &next
	}
	if page.Items == nil {
		page.Items = []domain.Bookmark{}
	}
	return page, nil
}
