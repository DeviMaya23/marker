package domain

import "github.com/google/uuid"

// BookmarkContent is the extracted main text of a page, as plain text (never HTML).
// It is a separate table so list queries never load it. No row means no content;
// the bookmark's FetchStatus says why.
type BookmarkContent struct {
	BookmarkID uuid.UUID `gorm:"column:bookmark_id;primaryKey"`
	Text       string    `gorm:"column:text"`
}

func (BookmarkContent) TableName() string { return "bookmark_content" }
