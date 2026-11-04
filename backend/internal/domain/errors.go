package domain

import (
	"errors"

	"github.com/google/uuid"
)

// ErrUnauthenticated means the request carries no valid session.
var ErrUnauthenticated = errors.New("unauthenticated")

// ErrInvalidLogin means a login attempt is bad or has expired: a malformed, tampered
// or expired state, a rejected authorization code, or an ID token that fails
// verification. It is the caller's problem (400), unlike a fault in the identity provider.
var ErrInvalidLogin = errors.New("invalid login attempt")

// Sentinel errors of the bookmark save and fetch flow.
var (
	// ErrInvalidURL means the submitted URL does not parse or is not http or https (FR-4).
	ErrInvalidURL = errors.New("invalid url")
	// ErrDuplicateBookmark means the user already has a bookmark with the same
	// normalized URL, live or trashed (FR-22, FR-23). A *DuplicateError carries the details.
	ErrDuplicateBookmark = errors.New("duplicate bookmark")
	// ErrBookmarkLimitReached means the user already holds the maximum number of
	// bookmarks, trashed ones included (NFR-17).
	ErrBookmarkLimitReached = errors.New("bookmark limit reached")
	// ErrValidation means one or more input fields are invalid. A *ValidationError
	// carries the per-field codes.
	ErrValidation = errors.New("validation error")
	// ErrBookmarkInTrash means the bookmark is in the trash and cannot be edited or
	// deleted again (FR-21a).
	ErrBookmarkInTrash = errors.New("bookmark in trash")
	// ErrBookmarkNotInTrash means the bookmark is live and so cannot be restored.
	ErrBookmarkNotInTrash = errors.New("bookmark not in trash")
)

// Sentinel errors of the folder operations.
var (
	// ErrFolderNameConflict means a sibling already has the name, ignoring case (FR-26).
	ErrFolderNameConflict = errors.New("folder name conflict")
	// ErrFolderDepthExceeded means the folder or its subtree would sit deeper than
	// MaxFolderDepth (FR-13).
	ErrFolderDepthExceeded = errors.New("folder depth exceeded")
	// ErrFolderCycle means a folder would be moved into itself or one of its descendants.
	ErrFolderCycle = errors.New("folder cycle")
)

// DuplicateError is the ErrDuplicateBookmark outcome of a save, naming the bookmark
// that already holds the URL.
type DuplicateError struct {
	ExistingID uuid.UUID
	InTrash    bool
}

func (e *DuplicateError) Error() string { return ErrDuplicateBookmark.Error() }
func (e *DuplicateError) Is(target error) bool {
	return target == ErrDuplicateBookmark
}

// FieldError is one invalid field and why.
type FieldError struct {
	Field string
	Code  string
}

// Per-field validation codes.
const (
	FieldCodeTooLong      = "too_long"
	FieldCodeUnknownField = "unknown_field"
	FieldCodeRequired     = "required"
)

// ValidationError is the ErrValidation outcome of a request with invalid fields.
type ValidationError struct {
	Fields []FieldError
}

func (e *ValidationError) Error() string { return ErrValidation.Error() }
func (e *ValidationError) Is(target error) bool {
	return target == ErrValidation
}
