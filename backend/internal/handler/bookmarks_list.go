package handler

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/handler/middleware"
)

// ListBookmarks implements GET /api/v1/bookmarks; it shadows the 501 stub. This slice
// serves the live list (optionally one folder and its subfolders), the trash, and the
// search of the live bookmarks.
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
	q := ""
	if p.Q != nil {
		q = strings.TrimSpace(*p.Q)
	}
	hasQ := q != ""
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
	if utf8.RuneCountInString(q) > domain.MaxSearchQueryLength {
		return listProblem(domain.FieldError{Field: "q", Code: domain.FieldCodeTooLong}), nil
	}
	if hasQ {
		in.Query = q
		if p.IncludeNotes != nil {
			in.IncludeNotes = *p.IncludeNotes
		}
	}
	if in.Cursor != "" {
		var err error
		if in.IsSearch() {
			_, err = domain.DecodeSearchCursor(in.Cursor, domain.SearchFingerprint(in.Query, in.IncludeNotes, in.FolderID))
		} else {
			_, err = domain.DecodeCursor(in.Cursor, in.Mode())
		}
		if err != nil {
			return listProblem(domain.FieldError{Field: "cursor", Code: domain.FieldCodeInvalid}), nil
		}
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
