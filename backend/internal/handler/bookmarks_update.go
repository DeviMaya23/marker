package handler

import (
	"context"
	"errors"
	"sort"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/handler/middleware"
)

// UpdateBookmark implements PATCH /api/v1/bookmarks/{id}; it shadows the 501 stub.
//
// Which keys the body held, and which were null, comes from recordBodyKeys; the values
// come from the decoded body. The usecase decides whether the request is valid.
func (s *Server) UpdateBookmark(ctx context.Context, req api.UpdateBookmarkRequestObject) (api.UpdateBookmarkResponseObject, error) {
	auth, ok := middleware.AuthFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	keys, ok := bodyKeysFrom(ctx)
	if !ok || req.Body == nil {
		// The middleware always runs before a body that decoded; this is a wiring bug.
		return nil, errors.New("update bookmark: request body keys were not recorded")
	}

	in := domain.BookmarkUpdate{
		Title:    fieldOf(keys, "title", req.Body.Title),
		Note:     fieldOf(keys, "note", req.Body.Note),
		FolderID: fieldOf(keys, "folder_id", req.Body.FolderId),
	}
	for k := range keys {
		if k != "title" && k != "note" && k != "folder_id" {
			in.UnknownKeys = append(in.UnknownKeys, k)
		}
	}
	sort.Strings(in.UnknownKeys)

	b, err := s.bookmarks.Update(ctx, auth.UserID, req.Id, in)
	if err != nil {
		var ve *domain.ValidationError
		if errors.As(err, &ve) {
			return api.UpdateBookmark422ApplicationProblemPlusJSONResponse(validationProblem(ve)), nil
		}
		return nil, err
	}
	return api.UpdateBookmark200JSONResponse(summaryOf(b)), nil
}
