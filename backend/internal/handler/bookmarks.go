package handler

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/handler/middleware"
	"marker/internal/usecase"
)

// BookmarkService is what the bookmark operations call. It is satisfied by
// usecase.BookmarkService.
type BookmarkService interface {
	Create(ctx context.Context, userID uuid.UUID, in usecase.CreateBookmarkInput) (domain.Bookmark, error)
	Get(ctx context.Context, userID, id uuid.UUID) (domain.BookmarkDetail, error)
	List(ctx context.Context, userID uuid.UUID, in domain.ListBookmarksInput) (domain.BookmarkPage, error)
}

// CreateBookmark implements POST /api/v1/bookmarks; it shadows the 501 stub.
func (s *Server) CreateBookmark(ctx context.Context, req api.CreateBookmarkRequestObject) (api.CreateBookmarkResponseObject, error) {
	auth, ok := middleware.AuthFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	if req.Body == nil {
		return createBookmarkProblem(&domain.ValidationError{Fields: []domain.FieldError{{Field: "url", Code: "required"}}})
	}

	in := usecase.CreateBookmarkInput{URL: req.Body.Url, FolderID: req.Body.FolderId}
	if req.Body.Title != nil {
		in.Title = *req.Body.Title
	}

	b, err := s.bookmarks.Create(ctx, auth.UserID, in)
	if err != nil {
		return createBookmarkProblem(err)
	}
	return api.CreateBookmark201JSONResponse(summaryOf(b)), nil
}

// createBookmarkProblem gives the two problems that carry extra fields their own
// response bodies. Every other error goes to ErrorHandler through domainProblems.
func createBookmarkProblem(err error) (api.CreateBookmarkResponseObject, error) {
	var dup *domain.DuplicateError
	if errors.As(err, &dup) {
		var body api.CreateBookmark409ApplicationProblemPlusJSONResponseBody
		problem := newProblem(http.StatusConflict, api.ErrorCodeDuplicateBookmark, "Bookmark already saved")
		if mErr := body.FromDuplicateBookmarkProblem(api.DuplicateBookmarkProblem{
			Code:               problem.Code,
			Status:             problem.Status,
			Title:              problem.Title,
			Type:               problem.Type,
			ExistingBookmarkId: dup.ExistingID,
			InTrash:            dup.InTrash,
		}); mErr != nil {
			return nil, mErr
		}
		return api.CreateBookmark409ApplicationProblemPlusJSONResponse(body), nil
	}

	var ve *domain.ValidationError
	if errors.As(err, &ve) {
		return api.CreateBookmark422ApplicationProblemPlusJSONResponse(validationProblem(ve)), nil
	}
	return nil, err
}

func validationProblem(ve *domain.ValidationError) api.ValidationProblem {
	problem := newProblem(http.StatusUnprocessableEntity, api.ErrorCodeValidationError, "Validation failed")
	fields := make([]struct {
		Code  string `json:"code"`
		Field string `json:"field"`
	}, len(ve.Fields))
	for i, f := range ve.Fields {
		fields[i].Code, fields[i].Field = f.Code, f.Field
	}
	return api.ValidationProblem{
		Code:   problem.Code,
		Status: problem.Status,
		Title:  problem.Title,
		Type:   problem.Type,
		Errors: &fields,
	}
}

// GetBookmark implements GET /api/v1/bookmarks/{id}; it shadows the 501 stub.
func (s *Server) GetBookmark(ctx context.Context, req api.GetBookmarkRequestObject) (api.GetBookmarkResponseObject, error) {
	auth, ok := middleware.AuthFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	d, err := s.bookmarks.Get(ctx, auth.UserID, req.Id)
	if err != nil {
		return nil, err
	}
	return api.GetBookmark200JSONResponse(detailOf(d)), nil
}

func summaryOf(b domain.Bookmark) api.BookmarkSummary {
	return api.BookmarkSummary{
		Id:          b.ID,
		Url:         b.URL,
		Title:       b.Title,
		Note:        noteOf(b.Note),
		FolderId:    b.FolderID,
		FaviconUrl:  faviconURL(b.FaviconID),
		FetchStatus: api.FetchStatus(b.FetchStatus),
		CreatedAt:   b.CreatedAt.UTC(),
		DeletedAt:   utcPtr(b),
	}
}

func detailOf(d domain.BookmarkDetail) api.BookmarkDetail {
	return api.BookmarkDetail{
		Id:          d.ID,
		Url:         d.URL,
		Title:       d.Title,
		Note:        noteOf(d.Note),
		FolderId:    d.FolderID,
		FaviconUrl:  faviconURL(d.FaviconID),
		FetchStatus: api.FetchStatus(d.FetchStatus),
		Content:     d.Content,
		CreatedAt:   d.CreatedAt.UTC(),
		UpdatedAt:   d.UpdatedAt.UTC(),
		DeletedAt:   utcPtr(d.Bookmark),
	}
}

// noteOf maps an empty note to null, as the contract describes a cleared note.
func noteOf(note string) *string {
	if note == "" {
		return nil
	}
	return &note
}

func faviconURL(id *uuid.UUID) *string {
	if id == nil {
		return nil
	}
	u := "/api/v1/favicons/" + id.String()
	return &u
}

func utcPtr(b domain.Bookmark) *time.Time {
	if b.DeletedAt == nil {
		return nil
	}
	t := b.DeletedAt.UTC()
	return &t
}
