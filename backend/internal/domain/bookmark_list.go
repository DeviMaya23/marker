package domain

import "github.com/google/uuid"

// DefaultListLimit is the page size when a list request names none.
const DefaultListLimit = 50

// Field codes of a rejected list request. They live here, not in errors.go, to keep
// the list slice self-contained.
const (
	FieldCodeInvalid             = "invalid"
	FieldCodeOutOfRange          = "out_of_range"
	FieldCodeNotAllowedWithTrash = "not_allowed_with_trashed"
)

// MaxListLimit is the largest page a request may ask for.
const MaxListLimit = 100

// ListBookmarksInput is a request for one page of the live list or the trash.
// Cursor is the opaque string from a previous page, empty for the first page, and
// Limit is zero when the caller named none.
type ListBookmarksInput struct {
	Trashed bool
	Cursor  string
	Limit   int
}

// Mode is the list the request reads.
func (in ListBookmarksInput) Mode() ListMode {
	if in.Trashed {
		return ListTrash
	}
	return ListLive
}

// BookmarkListQuery is what a store runs: one list for one user, starting strictly
// after After (nil for the first page), at most Limit rows.
type BookmarkListQuery struct {
	UserID uuid.UUID
	Mode   ListMode
	After  *Cursor
	Limit  int
}

// BookmarkPage is one page of bookmarks. NextCursor is nil on the last page.
type BookmarkPage struct {
	Items      []Bookmark
	NextCursor *string
}
