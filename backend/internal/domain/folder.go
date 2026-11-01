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
