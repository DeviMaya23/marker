package usecase

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"marker/internal/domain"
)

// FolderService creates, lists, renames, moves and deletes folders.
type FolderService struct {
	folders FolderStore
}

func NewFolderService(folders FolderStore) *FolderService {
	return &FolderService{folders: folders}
}

func (s *FolderService) List(ctx context.Context, userID uuid.UUID) ([]domain.FolderWithCount, error) {
	return s.folders.List(ctx, userID)
}

// checkFolderBody runs the first two checks of create and update: unknown keys, then
// the name. name is the raw name and present says whether it was given; it returns the
// trimmed name.
func checkFolderBody(unknown []string, name string, present bool) (string, error) {
	if len(unknown) > 0 {
		fields := make([]domain.FieldError, len(unknown))
		for i, k := range unknown {
			fields[i] = domain.FieldError{Field: k, Code: domain.FieldCodeUnknownField}
		}
		return "", &domain.ValidationError{Fields: fields}
	}
	if !present {
		return "", nil
	}
	trimmed := strings.TrimSpace(name)
	code := ""
	switch {
	case trimmed == "":
		code = domain.FieldCodeRequired
	case utf8.RuneCountInString(trimmed) > domain.MaxFolderNameLength:
		code = domain.FieldCodeTooLong
	}
	if code != "" {
		return "", &domain.ValidationError{Fields: []domain.FieldError{{Field: "name", Code: code}}}
	}
	return trimmed, nil
}

// Create makes a folder. The checks run in this order and the first failure answers:
// unknown keys, the name, the parent (not the caller's is not found), the depth.
func (s *FolderService) Create(ctx context.Context, userID uuid.UUID, in domain.FolderCreate) (domain.FolderWithCount, error) {
	name, err := checkFolderBody(in.UnknownKeys, in.Name, true)
	if err != nil {
		return domain.FolderWithCount{}, err
	}

	depth := 1
	if in.ParentID != nil {
		parent, err := s.folders.Get(ctx, userID, *in.ParentID)
		if err != nil {
			return domain.FolderWithCount{}, err
		}
		if parent.Depth >= domain.MaxFolderDepth {
			return domain.FolderWithCount{}, domain.ErrFolderDepthExceeded
		}
		depth = parent.Depth + 1
	}

	return s.folders.Create(ctx, domain.Folder{
		ID: domain.NewID(), UserID: userID, Name: name, ParentID: in.ParentID, Depth: depth,
	})
}

// Update renames and moves a folder. The checks run in this order and the first failure
// answers: unknown keys, the name, the folder, the new parent, a cycle, the depth. A
// request that names no field returns the folder as it is and writes nothing.
func (s *FolderService) Update(ctx context.Context, userID, id uuid.UUID, in domain.FolderUpdate) (domain.FolderWithCount, error) {
	if in.Name.Null {
		// Unknown keys still come first.
		if _, err := checkFolderBody(in.UnknownKeys, "", false); err != nil {
			return domain.FolderWithCount{}, err
		}
		return domain.FolderWithCount{}, &domain.ValidationError{Fields: []domain.FieldError{{Field: "name", Code: domain.FieldCodeInvalid}}}
	}
	name, err := checkFolderBody(in.UnknownKeys, in.Name.Value, in.Name.Set)
	if err != nil {
		return domain.FolderWithCount{}, err
	}
	if in.Name.Set {
		in.Name = domain.Value(name)
	}

	folder, err := s.folders.Get(ctx, userID, id)
	if err != nil {
		return domain.FolderWithCount{}, err
	}

	if in.ParentID.Set {
		var parent *domain.Folder
		if !in.ParentID.Null {
			p, err := s.folders.Get(ctx, userID, in.ParentID.Value)
			if err != nil {
				return domain.FolderWithCount{}, err
			}
			parent = &p.Folder
		}
		subtree, err := s.folders.Subtree(ctx, userID, id)
		if err != nil {
			return domain.FolderWithCount{}, err
		}
		if _, err := domain.PlanMove(folder.Folder, parent, subtree); err != nil {
			return domain.FolderWithCount{}, err
		}
	}

	if in.Empty() {
		return folder, nil
	}
	return s.folders.Update(ctx, userID, id, in)
}

// Delete removes a folder and its subtree; its live bookmarks go to the trash.
func (s *FolderService) Delete(ctx context.Context, userID, id uuid.UUID) (domain.FolderDeletion, error) {
	return s.folders.Delete(ctx, userID, id)
}
