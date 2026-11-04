package usecase

import (
	"context"

	"github.com/google/uuid"

	"marker/internal/domain"
)

// Delete moves a live bookmark to the trash (FR-17). Nothing else about it changes.
func (s *BookmarkService) Delete(ctx context.Context, userID, id uuid.UUID) error {
	b, err := s.bookmarks.Get(ctx, userID, id)
	if err != nil {
		return err
	}
	if b.DeletedAt != nil {
		return domain.ErrBookmarkInTrash
	}
	return s.bookmarks.Trash(ctx, userID, id)
}

// Restore takes a trashed bookmark out of the trash, at the top level (FR-19). It runs
// no cap check: a trashed bookmark already counts (NFR-17).
func (s *BookmarkService) Restore(ctx context.Context, userID, id uuid.UUID) (domain.Bookmark, error) {
	b, err := s.bookmarks.Get(ctx, userID, id)
	if err != nil {
		return domain.Bookmark{}, err
	}
	if b.DeletedAt == nil {
		return domain.Bookmark{}, domain.ErrBookmarkNotInTrash
	}
	return s.bookmarks.Restore(ctx, userID, id)
}

// EmptyTrash permanently deletes the user's trashed bookmarks and returns how many (FR-20).
func (s *BookmarkService) EmptyTrash(ctx context.Context, userID uuid.UUID) (int64, error) {
	return s.bookmarks.EmptyTrash(ctx, userID)
}
