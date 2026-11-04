package usecase

import (
	"context"
	"unicode/utf8"

	"github.com/google/uuid"

	"marker/internal/domain"
)

// Update changes a bookmark's title, note and folder. The checks run in this order and
// the first failure answers: unknown keys, field values, the bookmark, the trash, the
// folder. A body that names no field returns the bookmark as it is and writes nothing.
func (s *BookmarkService) Update(ctx context.Context, userID, id uuid.UUID, in domain.BookmarkUpdate) (domain.Bookmark, error) {
	// 1. Unknown keys.
	if len(in.UnknownKeys) > 0 {
		fields := make([]domain.FieldError, len(in.UnknownKeys))
		for i, k := range in.UnknownKeys {
			fields[i] = domain.FieldError{Field: k, Code: domain.FieldCodeUnknownField}
		}
		return domain.Bookmark{}, &domain.ValidationError{Fields: fields}
	}

	// 2. Values.
	var fields []domain.FieldError
	switch {
	case in.Title.Null:
		fields = append(fields, domain.FieldError{Field: "title", Code: domain.FieldCodeInvalid})
	case in.Title.Set && utf8.RuneCountInString(in.Title.Value) > domain.MaxTitleLength:
		fields = append(fields, domain.FieldError{Field: "title", Code: domain.FieldCodeTooLong})
	}
	if in.Note.Set && !in.Note.Null && utf8.RuneCountInString(in.Note.Value) > domain.MaxNoteLength {
		fields = append(fields, domain.FieldError{Field: "note", Code: domain.FieldCodeTooLong})
	}
	if len(fields) > 0 {
		return domain.Bookmark{}, &domain.ValidationError{Fields: fields}
	}

	// 3 and 4. The bookmark, and the trash.
	b, err := s.bookmarks.Get(ctx, userID, id)
	if err != nil {
		return domain.Bookmark{}, err
	}
	if b.DeletedAt != nil {
		return domain.Bookmark{}, domain.ErrBookmarkInTrash
	}

	// 5. The folder.
	if in.FolderID.Set && !in.FolderID.Null {
		if _, err := s.folders.GetFolder(ctx, userID, in.FolderID.Value); err != nil {
			return domain.Bookmark{}, err
		}
	}

	// 6. Nothing to write.
	if in.Empty() {
		return b, nil
	}

	// 7. The write. The store re-checks the trash state and the folder atomically.
	return s.bookmarks.Update(ctx, userID, id, in)
}
