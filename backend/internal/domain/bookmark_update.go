package domain

import "github.com/google/uuid"

// Field is one field of a partial update. It has three states, which a plain pointer
// cannot tell apart: absent (Set false, leave the stored value), null (Set and Null,
// clear it) and a value (Set, Value holds it).
type Field[T any] struct {
	Set   bool
	Null  bool
	Value T
}

// Absent is a field the request did not mention.
func Absent[T any]() Field[T] { return Field[T]{} }

// Null is a field the request set to null.
func Null[T any]() Field[T] { return Field[T]{Set: true, Null: true} }

// Value is a field the request set to v.
func Value[T any](v T) Field[T] { return Field[T]{Set: true, Value: v} }

// BookmarkUpdate is a PATCH of a bookmark's user-defined fields. UnknownKeys lists
// the body keys that are not title, note or folder_id; the usecase rejects them.
type BookmarkUpdate struct {
	Title       Field[string]
	Note        Field[string]
	FolderID    Field[uuid.UUID]
	UnknownKeys []string
}

// Empty reports whether the update names none of the recognised fields.
func (u BookmarkUpdate) Empty() bool {
	return !u.Title.Set && !u.Note.Set && !u.FolderID.Set
}
