package usecase

import (
	"context"

	"github.com/google/uuid"

	"marker/internal/domain"
)

// FolderStore is the database access FolderService needs. Every method filters by
// userID; another user's folder is gorm.ErrRecordNotFound. Every write takes the user's
// folder lock first and increments the user's version, in one transaction.
type FolderStore interface {
	// List returns all of the user's folders ordered by lower-cased name, then id.
	List(ctx context.Context, userID uuid.UUID) ([]domain.FolderWithCount, error)
	// Get returns the user's folder with its live bookmark count.
	Get(ctx context.Context, userID, id uuid.UUID) (domain.FolderWithCount, error)
	// Subtree returns the folder and every descendant, all the user's.
	Subtree(ctx context.Context, userID, id uuid.UUID) ([]domain.Folder, error)
	// Create inserts the folder. f.Depth is the depth the usecase worked out; the store
	// re-reads the parent under the lock and stores the depth that follows from it,
	// reporting domain.ErrFolderDepthExceeded or gorm.ErrRecordNotFound if the tree
	// changed. A sibling with the same name (ignoring case) is domain.ErrFolderNameConflict.
	Create(ctx context.Context, f domain.Folder) (domain.FolderWithCount, error)
	// Update writes the fields of u that are set (the name already trimmed), sets the
	// depth of the folder and its descendants, and returns the stored folder. It repeats
	// the cycle and depth checks under the lock. A name collision in the resulting
	// location is domain.ErrFolderNameConflict.
	Update(ctx context.Context, userID, id uuid.UUID, u domain.FolderUpdate) (domain.FolderWithCount, error)
	// Delete trashes the live bookmarks of the subtree with one timestamp, deletes the
	// folder and its descendants, and reports both counts.
	Delete(ctx context.Context, userID, id uuid.UUID) (domain.FolderDeletion, error)
}
