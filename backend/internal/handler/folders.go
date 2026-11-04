package handler

import (
	"context"
	"errors"
	"sort"

	"github.com/google/uuid"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/handler/middleware"
)

// FolderService is what the folder operations call. It is satisfied by
// usecase.FolderService.
type FolderService interface {
	List(ctx context.Context, userID uuid.UUID) ([]domain.FolderWithCount, error)
	Create(ctx context.Context, userID uuid.UUID, in domain.FolderCreate) (domain.FolderWithCount, error)
	Update(ctx context.Context, userID, id uuid.UUID, in domain.FolderUpdate) (domain.FolderWithCount, error)
	Delete(ctx context.Context, userID, id uuid.UUID) (domain.FolderDeletion, error)
}

func folderOf(f domain.FolderWithCount) api.Folder {
	return api.Folder{
		Id: f.ID, Name: f.Name, ParentId: f.ParentID, Depth: f.Depth,
		BookmarkCount: f.BookmarkCount, CreatedAt: f.CreatedAt.UTC(), UpdatedAt: f.UpdatedAt.UTC(),
	}
}

// unknownFolderKeys lists the body keys that are not name or parent_id, sorted.
func unknownFolderKeys(keys bodyKeys) []string {
	var unknown []string
	for k := range keys {
		if k != "name" && k != "parent_id" {
			unknown = append(unknown, k)
		}
	}
	sort.Strings(unknown)
	return unknown
}

// ListFolders implements GET /api/v1/folders; it shadows the 501 stub.
func (s *Server) ListFolders(ctx context.Context, _ api.ListFoldersRequestObject) (api.ListFoldersResponseObject, error) {
	auth, ok := middleware.AuthFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	folders, err := s.folders.List(ctx, auth.UserID)
	if err != nil {
		return nil, err
	}
	items := make([]api.Folder, 0, len(folders))
	for _, f := range folders {
		items = append(items, folderOf(f))
	}
	return api.ListFolders200JSONResponse{Items: items}, nil
}

// CreateFolder implements POST /api/v1/folders; it shadows the 501 stub. The key check
// is the one from updateBookmark (recordBodyKeys).
func (s *Server) CreateFolder(ctx context.Context, req api.CreateFolderRequestObject) (api.CreateFolderResponseObject, error) {
	auth, ok := middleware.AuthFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	keys, ok := bodyKeysFrom(ctx)
	if !ok || req.Body == nil {
		return nil, errors.New("create folder: request body keys were not recorded")
	}

	f, err := s.folders.Create(ctx, auth.UserID, domain.FolderCreate{
		Name:        req.Body.Name,
		ParentID:    req.Body.ParentId,
		UnknownKeys: unknownFolderKeys(keys),
	})
	if err != nil {
		var ve *domain.ValidationError
		if errors.As(err, &ve) {
			return api.CreateFolder422ApplicationProblemPlusJSONResponse(validationProblem(ve)), nil
		}
		return nil, err
	}
	return api.CreateFolder201JSONResponse(folderOf(f)), nil
}

// UpdateFolder implements PATCH /api/v1/folders/{id}; it shadows the 501 stub.
func (s *Server) UpdateFolder(ctx context.Context, req api.UpdateFolderRequestObject) (api.UpdateFolderResponseObject, error) {
	auth, ok := middleware.AuthFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	keys, ok := bodyKeysFrom(ctx)
	if !ok || req.Body == nil {
		return nil, errors.New("update folder: request body keys were not recorded")
	}

	f, err := s.folders.Update(ctx, auth.UserID, req.Id, domain.FolderUpdate{
		Name:        fieldOf(keys, "name", req.Body.Name),
		ParentID:    fieldOf(keys, "parent_id", req.Body.ParentId),
		UnknownKeys: unknownFolderKeys(keys),
	})
	if err != nil {
		var ve *domain.ValidationError
		if errors.As(err, &ve) {
			return api.UpdateFolder422ApplicationProblemPlusJSONResponse(validationProblem(ve)), nil
		}
		return nil, err
	}
	return api.UpdateFolder200JSONResponse(folderOf(f)), nil
}

// DeleteFolder implements DELETE /api/v1/folders/{id}; it shadows the 501 stub.
func (s *Server) DeleteFolder(ctx context.Context, req api.DeleteFolderRequestObject) (api.DeleteFolderResponseObject, error) {
	auth, ok := middleware.AuthFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	d, err := s.folders.Delete(ctx, auth.UserID, req.Id)
	if err != nil {
		return nil, err
	}
	return api.DeleteFolder200JSONResponse{DeletedFolders: d.DeletedFolders, TrashedBookmarks: d.TrashedBookmarks}, nil
}
