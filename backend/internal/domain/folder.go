package domain

import (
	"time"

	"github.com/google/uuid"
)

// MaxFolderDepth is the deepest a folder may sit. A root-level folder has depth 1.
const MaxFolderDepth = 3

// Folder is a node in a user's folder tree. ParentID is nil for a root-level folder.
type Folder struct {
	ID        uuid.UUID  `gorm:"column:id;primaryKey"`
	UserID    uuid.UUID  `gorm:"column:user_id"`
	Name      string     `gorm:"column:name"`
	ParentID  *uuid.UUID `gorm:"column:parent_id"`
	Depth     int        `gorm:"column:depth"`
	CreatedAt time.Time  `gorm:"column:created_at"`
	UpdatedAt time.Time  `gorm:"column:updated_at"`
}

func (Folder) TableName() string { return "folders" }

// MaxFolderNameLength is the longest folder name, in characters (NFR-14).
const MaxFolderNameLength = 100

// FolderWithCount is a folder as the API shows it: BookmarkCount is the number of live
// bookmarks directly in it, not those of its subfolders and not trashed ones.
type FolderWithCount struct {
	Folder
	BookmarkCount int `gorm:"column:bookmark_count"`
}

// FolderCreate is a request to create a folder. A missing or null name is the empty
// string, which the usecase rejects as required. ParentID nil means the top level.
// UnknownKeys lists the body keys that are not name or parent_id.
type FolderCreate struct {
	Name        string
	ParentID    *uuid.UUID
	UnknownKeys []string
}

// FolderUpdate is a PATCH of a folder. Each field is absent, null or a value; a null
// ParentID moves the folder to the top level. UnknownKeys lists the body keys that are
// not name or parent_id.
type FolderUpdate struct {
	Name        Field[string]
	ParentID    Field[uuid.UUID]
	UnknownKeys []string
}

// Empty reports whether the update names none of the recognised fields.
func (u FolderUpdate) Empty() bool { return !u.Name.Set && !u.ParentID.Set }

// FolderDeletion is what deleting a folder did.
type FolderDeletion struct {
	DeletedFolders   int
	TrashedBookmarks int
}

// PlanMove decides whether folder, whose subtree (the folder included) is subtree, may
// move under newParent (nil is the top level). It returns the depth the folder would
// have, ErrFolderCycle if newParent is the folder or one of its descendants, or
// ErrFolderDepthExceeded if the deepest descendant would sit below MaxFolderDepth.
// The cycle check comes first.
func PlanMove(folder Folder, newParent *Folder, subtree []Folder) (int, error) {
	if newParent != nil {
		for _, f := range subtree {
			if f.ID == newParent.ID {
				return 0, ErrFolderCycle
			}
		}
	}
	newDepth := 1
	if newParent != nil {
		newDepth = newParent.Depth + 1
	}
	deepest := folder.Depth
	for _, f := range subtree {
		deepest = max(deepest, f.Depth)
	}
	height := deepest - folder.Depth + 1
	if newDepth+height-1 > MaxFolderDepth {
		return 0, ErrFolderDepthExceeded
	}
	return newDepth, nil
}
