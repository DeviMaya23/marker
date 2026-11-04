package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/usecase"
)

// bookmarkSpy is a value-return spy for BookmarkService.
type bookmarkSpy struct {
	created    domain.Bookmark
	detail     domain.BookmarkDetail
	err        error
	gotUser    uuid.UUID
	gotInput   usecase.CreateBookmarkInput
	gotGetID   uuid.UUID
	gotGetUser uuid.UUID

	// result is what Update and Restore return; emptied is what EmptyTrash returns.
	result      domain.Bookmark
	emptied     int64
	gotID       uuid.UUID
	gotUpdate   domain.BookmarkUpdate
	updateCalls int
	deleteCalls int
	emptyCalls  int

	page        domain.BookmarkPage
	gotListUser uuid.UUID
	gotList     domain.ListBookmarksInput
	listCalls   int
}

func (s *bookmarkSpy) Update(_ context.Context, userID, id uuid.UUID, in domain.BookmarkUpdate) (domain.Bookmark, error) {
	s.gotUser, s.gotID, s.gotUpdate = userID, id, in
	s.updateCalls++
	return s.result, s.err
}

func (s *bookmarkSpy) Delete(_ context.Context, userID, id uuid.UUID) error {
	s.gotUser, s.gotID = userID, id
	s.deleteCalls++
	return s.err
}

func (s *bookmarkSpy) Restore(_ context.Context, userID, id uuid.UUID) (domain.Bookmark, error) {
	s.gotUser, s.gotID = userID, id
	return s.result, s.err
}

func (s *bookmarkSpy) EmptyTrash(_ context.Context, userID uuid.UUID) (int64, error) {
	s.gotUser = userID
	s.emptyCalls++
	return s.emptied, s.err
}

func (s *bookmarkSpy) List(_ context.Context, userID uuid.UUID, in domain.ListBookmarksInput) (domain.BookmarkPage, error) {
	s.gotListUser, s.gotList = userID, in
	s.listCalls++
	return s.page, s.err
}

func (s *bookmarkSpy) Create(_ context.Context, userID uuid.UUID, in usecase.CreateBookmarkInput) (domain.Bookmark, error) {
	s.gotUser, s.gotInput = userID, in
	return s.created, s.err
}

func (s *bookmarkSpy) Get(_ context.Context, userID, id uuid.UUID) (domain.BookmarkDetail, error) {
	s.gotGetUser, s.gotGetID = userID, id
	return s.detail, s.err
}

var callerID = uuid.New()

// authFor authenticates the one good session as callerID.
type authFor struct{}

func (authFor) Authenticate(_ context.Context, token string) (domain.Session, error) {
	if token != goodSession {
		return domain.Session{}, domain.ErrUnauthenticated
	}
	return domain.Session{ID: uuid.New(), UserID: callerID}, nil
}

func routerWith(spy *bookmarkSpy) *echo.Echo {
	return NewRouter(Deps{Server: NewServer(spy, nil), Auth: authFor{}, AppOrigin: testOrigin})
}

func postBookmark(e *echo.Echo, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/bookmarks", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	withSession(goodSession)(req)
	withCSRF()(req)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

func getBookmark(e *echo.Echo, id string) *httptest.ResponseRecorder {
	return do(e, http.MethodGet, "/api/v1/bookmarks/"+id, withSession(goodSession))
}

func TestCreateBookmark_Created(t *testing.T) {
	folder := uuid.New()
	created := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	spy := &bookmarkSpy{created: domain.Bookmark{
		ID: uuid.New(), UserID: callerID, URL: "http://Example.com/a", Title: "Mine",
		FolderID: &folder, FetchStatus: domain.FetchPending, CreatedAt: created,
	}}

	rec := postBookmark(routerWith(spy), `{"url":"http://Example.com/a","title":"Mine","folder_id":"`+folder.String()+`"}`)

	require.Equal(t, http.StatusCreated, rec.Code)
	require.Equal(t, "application/json", rec.Header().Get("Content-Type"))
	var got map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, spy.created.ID.String(), got["id"])
	require.Equal(t, "http://Example.com/a", got["url"])
	require.Equal(t, "Mine", got["title"])
	require.Equal(t, "pending", got["fetch_status"])
	require.Equal(t, folder.String(), got["folder_id"])
	require.Nil(t, got["favicon_url"])
	require.Nil(t, got["note"])
	require.Nil(t, got["deleted_at"])
	require.Equal(t, "2026-01-02T03:04:05Z", got["created_at"])

	require.Equal(t, callerID, spy.gotUser)
	require.Equal(t, usecase.CreateBookmarkInput{URL: "http://Example.com/a", Title: "Mine", FolderID: &folder}, spy.gotInput)
}

func TestCreateBookmark_TitleAndFolderAreOptional(t *testing.T) {
	spy := &bookmarkSpy{created: domain.Bookmark{ID: uuid.New(), FetchStatus: domain.FetchPending}}
	rec := postBookmark(routerWith(spy), `{"url":"https://e.com"}`)
	require.Equal(t, http.StatusCreated, rec.Code)
	require.Equal(t, usecase.CreateBookmarkInput{URL: "https://e.com"}, spy.gotInput)
}

func TestCreateBookmark_Problems(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		status int
		code   api.ErrorCode
	}{
		{"invalid url", domain.ErrInvalidURL, http.StatusUnprocessableEntity, api.ErrorCodeInvalidUrl},
		{"limit", domain.ErrBookmarkLimitReached, http.StatusConflict, api.ErrorCodeBookmarkLimitReached},
		{"folder not found", gorm.ErrRecordNotFound, http.StatusNotFound, api.ErrorCodeNotFound},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := postBookmark(routerWith(&bookmarkSpy{err: c.err}), `{"url":"https://e.com"}`)
			requireProblem(t, rec, c.status, c.code)
		})
	}
}

func TestCreateBookmark_Validation(t *testing.T) {
	spy := &bookmarkSpy{err: &domain.ValidationError{Fields: []domain.FieldError{
		{Field: "url", Code: "too_long"}, {Field: "title", Code: "too_long"},
	}}}
	rec := postBookmark(routerWith(spy), `{"url":"https://e.com"}`)

	requireProblem(t, rec, http.StatusUnprocessableEntity, api.ErrorCodeValidationError)
	var p api.ValidationProblem
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &p))
	require.NotNil(t, p.Errors)
	require.Len(t, *p.Errors, 2)
	require.Equal(t, "url", (*p.Errors)[0].Field)
	require.Equal(t, "too_long", (*p.Errors)[0].Code)
	require.Equal(t, "title", (*p.Errors)[1].Field)
}

func TestCreateBookmark_Duplicate(t *testing.T) {
	for _, inTrash := range []bool{false, true} {
		existing := uuid.New()
		spy := &bookmarkSpy{err: &domain.DuplicateError{ExistingID: existing, InTrash: inTrash}}
		rec := postBookmark(routerWith(spy), `{"url":"https://e.com"}`)

		requireProblem(t, rec, http.StatusConflict, api.ErrorCodeDuplicateBookmark)
		var p api.DuplicateBookmarkProblem
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &p))
		require.Equal(t, existing, p.ExistingBookmarkId)
		require.Equal(t, inTrash, p.InTrash)
	}
}

func TestCreateBookmark_InternalErrorHidesDetail(t *testing.T) {
	rec := postBookmark(routerWith(&bookmarkSpy{err: assertErr("secret detail")}), `{"url":"https://e.com"}`)
	require.Equal(t, http.StatusInternalServerError, rec.Code)
	require.NotContains(t, rec.Body.String(), "secret detail")
}

type assertErr string

func (e assertErr) Error() string { return string(e) }

func TestCreateBookmark_BindingFailures(t *testing.T) {
	e := routerWith(&bookmarkSpy{})
	t.Run("malformed JSON", func(t *testing.T) {
		requireProblem(t, postBookmark(e, `{"url":`), http.StatusBadRequest, api.ErrorCodeValidationError)
	})
}

func TestGetBookmark_Detail(t *testing.T) {
	id, favicon := uuid.New(), uuid.New()
	content := "page text"
	deleted := time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC)
	spy := &bookmarkSpy{detail: domain.BookmarkDetail{
		Bookmark: domain.Bookmark{
			ID: id, URL: "https://e.com", Title: "T", Note: "n", FaviconID: &favicon,
			FetchStatus: domain.FetchOK, DeletedAt: &deleted,
		},
		Content: &content,
	}}

	rec := getBookmark(routerWith(spy), id.String())

	require.Equal(t, http.StatusOK, rec.Code)
	var got map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, "page text", got["content"])
	require.Equal(t, "/api/v1/favicons/"+favicon.String(), got["favicon_url"])
	require.Equal(t, "ok", got["fetch_status"])
	require.Equal(t, "n", got["note"])
	require.Equal(t, "2026-03-04T05:06:07Z", got["deleted_at"])
	require.Equal(t, id, spy.gotGetID)
	require.Equal(t, callerID, spy.gotGetUser)
}

func TestGetBookmark_PendingHasNullContent(t *testing.T) {
	spy := &bookmarkSpy{detail: domain.BookmarkDetail{Bookmark: domain.Bookmark{ID: uuid.New(), FetchStatus: domain.FetchPending}}}
	rec := getBookmark(routerWith(spy), uuid.NewString())

	require.Equal(t, http.StatusOK, rec.Code)
	var got map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, "null", string(got["content"]), "content is present and null")
	require.Equal(t, "null", string(got["favicon_url"]))
	require.Equal(t, "null", string(got["deleted_at"]))
}

func TestGetBookmark_NotFound(t *testing.T) {
	rec := getBookmark(routerWith(&bookmarkSpy{err: gorm.ErrRecordNotFound}), uuid.NewString())
	requireProblem(t, rec, http.StatusNotFound, api.ErrorCodeNotFound)
}

func TestGetBookmark_BadID(t *testing.T) {
	rec := getBookmark(routerWith(&bookmarkSpy{}), "not-a-uuid")
	requireProblem(t, rec, http.StatusBadRequest, api.ErrorCodeValidationError)
}

func TestBookmarkOperations_RequireASession(t *testing.T) {
	e := routerWith(&bookmarkSpy{})
	requireProblem(t, do(e, http.MethodGet, "/api/v1/bookmarks/"+uuid.NewString()), http.StatusUnauthorized, api.ErrorCodeUnauthenticated)
}
