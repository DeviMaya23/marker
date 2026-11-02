package domain

import (
	"errors"

	"github.com/google/uuid"
)

// ErrUnauthenticated means the request carries no valid session.
var ErrUnauthenticated = errors.New("unauthenticated")

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
const FieldCodeTooLong = "too_long"

// ValidationError is the ErrValidation outcome of a request with invalid fields.
type ValidationError struct {
	Fields []FieldError
}

func (e *ValidationError) Error() string { return ErrValidation.Error() }
func (e *ValidationError) Is(target error) bool {
	return target == ErrValidation
}
