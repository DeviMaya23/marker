package domain

import (
	"time"

	"github.com/google/uuid"
)

// FetchStatus is the state of the background page fetch for a bookmark.
type FetchStatus string

const (
	FetchPending FetchStatus = "pending"
	FetchOK      FetchStatus = "ok"
	FetchFailed  FetchStatus = "failed"
)

// Bookmark is a saved link. A bookmark is in the trash when DeletedAt is set.
//
// DeletedAt is a plain *time.Time, not gorm.DeletedAt, on purpose: GORM's automatic
// soft-delete scoping would hide trashed rows from queries that must see them
// (the trash view, the duplicate check). Repositories filter on it explicitly.
//
// The search_vector column is deliberately not mapped here. It is maintained with
// raw SQL in the repository, in the same transaction that changes title, url or content.
type Bookmark struct {
	ID            uuid.UUID   `gorm:"column:id;primaryKey"`
	UserID        uuid.UUID   `gorm:"column:user_id"`
	URL           string      `gorm:"column:url"`
	NormalizedURL string      `gorm:"column:normalized_url"`
	Title         string      `gorm:"column:title"`
	Note          string      `gorm:"column:note"`
	FolderID      *uuid.UUID  `gorm:"column:folder_id"`
	FaviconID     *uuid.UUID  `gorm:"column:favicon_id"`
	FetchStatus   FetchStatus `gorm:"column:fetch_status"`
	CreatedAt     time.Time   `gorm:"column:created_at"`
	UpdatedAt     time.Time   `gorm:"column:updated_at"`
	DeletedAt     *time.Time  `gorm:"column:deleted_at"`
}

func (Bookmark) TableName() string { return "bookmarks" }
