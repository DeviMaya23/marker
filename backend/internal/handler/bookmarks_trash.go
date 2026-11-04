package handler

import (
	"context"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/handler/middleware"
)

// DeleteBookmark implements DELETE /api/v1/bookmarks/{id}: it moves the bookmark to the
// trash. It shadows the 501 stub.
func (s *Server) DeleteBookmark(ctx context.Context, req api.DeleteBookmarkRequestObject) (api.DeleteBookmarkResponseObject, error) {
	auth, ok := middleware.AuthFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	if err := s.bookmarks.Delete(ctx, auth.UserID, req.Id); err != nil {
		return nil, err
	}
	return api.DeleteBookmark204Response{}, nil
}

// RestoreBookmark implements POST /api/v1/bookmarks/{id}/restore; it shadows the 501 stub.
func (s *Server) RestoreBookmark(ctx context.Context, req api.RestoreBookmarkRequestObject) (api.RestoreBookmarkResponseObject, error) {
	auth, ok := middleware.AuthFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	b, err := s.bookmarks.Restore(ctx, auth.UserID, req.Id)
	if err != nil {
		return nil, err
	}
	return api.RestoreBookmark200JSONResponse(summaryOf(b)), nil
}

// EmptyTrash implements DELETE /api/v1/trash; it shadows the 501 stub.
func (s *Server) EmptyTrash(ctx context.Context, _ api.EmptyTrashRequestObject) (api.EmptyTrashResponseObject, error) {
	auth, ok := middleware.AuthFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	n, err := s.bookmarks.EmptyTrash(ctx, auth.UserID)
	if err != nil {
		return nil, err
	}
	return api.EmptyTrash200JSONResponse{Deleted: int(n)}, nil
}
