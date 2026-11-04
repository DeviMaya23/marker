package handler

import (
	"context"
	"errors"
	"strings"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/handler/middleware"
)

// ListBookmarks implements GET /api/v1/bookmarks; it shadows the 501 stub. This slice
// serves the live list (optionally one folder and its subfolders) and the trash; search answers 501.
func (s *Server) ListBookmarks(ctx context.Context, req api.ListBookmarksRequestObject) (api.ListBookmarksResponseObject, error) {
	auth, ok := middleware.AuthFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	p := req.Params

	in := domain.ListBookmarksInput{}
	if p.Trashed != nil {
		in.Trashed = *p.Trashed
	}
	if p.Cursor != nil {
		in.Cursor = *p.Cursor
	}
	if p.Limit != nil {
		in.Limit = *p.Limit
	}
	hasQ := p.Q != nil && strings.TrimSpace(*p.Q) != ""
	hasFolder := p.FolderId != nil
	in.FolderID = p.FolderId

	// The checks run in this order and the first failure answers.
	if p.Limit != nil && (*p.Limit < 1 || *p.Limit > domain.MaxListLimit) {
		return listProblem(domain.FieldError{Field: "limit", Code: domain.FieldCodeOutOfRange}), nil
	}
	if in.Trashed && (hasQ || hasFolder) {
		var fields []domain.FieldError
		if hasQ {
			fields = append(fields, domain.FieldError{Field: "q", Code: domain.FieldCodeNotAllowedWithTrash})
		}
		if hasFolder {
			fields = append(fields, domain.FieldError{Field: "folder_id", Code: domain.FieldCodeNotAllowedWithTrash})
		}
		return listProblem(fields...), nil
	}
	if in.Cursor != "" {
		if _, err := domain.DecodeCursor(in.Cursor, in.Mode()); err != nil {
			return listProblem(domain.FieldError{Field: "cursor", Code: domain.FieldCodeInvalid}), nil
		}
	}
	if !in.Trashed && hasQ {
		return nil, ErrNotImplemented
	}

	page, err := s.bookmarks.List(ctx, auth.UserID, in)
	if err != nil {
		var ve *domain.ValidationError
		if errors.As(err, &ve) {
			return api.ListBookmarks422ApplicationProblemPlusJSONResponse(validationProblem(ve)), nil
		}
		return nil, err
	}

	items := make([]api.BookmarkSummary, 0, len(page.Items))
	for _, b := range page.Items {
		items = append(items, summaryOf(b))
	}
	return api.ListBookmarks200JSONResponse(api.BookmarkPage{Items: items, NextCursor: page.NextCursor}), nil
}

func listProblem(fields ...domain.FieldError) api.ListBookmarksResponseObject {
	return api.ListBookmarks422ApplicationProblemPlusJSONResponse(validationProblem(&domain.ValidationError{Fields: fields}))
}
