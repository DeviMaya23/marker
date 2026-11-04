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
)

// folderSpy is a value-return spy for FolderService.
type folderSpy struct {
	list    []domain.FolderWithCount
	result  domain.FolderWithCount
	deleted domain.FolderDeletion
	err     error

	gotUser   uuid.UUID
	gotID     uuid.UUID
	gotCreate domain.FolderCreate
	gotUpdate domain.FolderUpdate
	calls     int
}

func (s *folderSpy) List(_ context.Context, userID uuid.UUID) ([]domain.FolderWithCount, error) {
	s.gotUser = userID
	s.calls++
	return s.list, s.err
}

func (s *folderSpy) Create(_ context.Context, userID uuid.UUID, in domain.FolderCreate) (domain.FolderWithCount, error) {
	s.gotUser, s.gotCreate = userID, in
	s.calls++
	return s.result, s.err
}

func (s *folderSpy) Update(_ context.Context, userID, id uuid.UUID, in domain.FolderUpdate) (domain.FolderWithCount, error) {
	s.gotUser, s.gotID, s.gotUpdate = userID, id, in
	s.calls++
	return s.result, s.err
}

func (s *folderSpy) Delete(_ context.Context, userID, id uuid.UUID) (domain.FolderDeletion, error) {
	s.gotUser, s.gotID = userID, id
	s.calls++
	return s.deleted, s.err
}

func folderRouter(spy *folderSpy) *echo.Echo {
	return NewRouter(Deps{Server: NewServer(&bookmarkSpy{}, spy, nil, nil, nil), Auth: authFor{}, AppOrigin: testOrigin})
}

func sendFolder(e *echo.Echo, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	withSession(goodSession)(req)
	withCSRF()(req)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

func postFolder(spy *folderSpy, body string) *httptest.ResponseRecorder {
	return sendFolder(folderRouter(spy), http.MethodPost, "/api/v1/folders", body)
}

func patchFolder(spy *folderSpy, id uuid.UUID, body string) *httptest.ResponseRecorder {
	return sendFolder(folderRouter(spy), http.MethodPatch, "/api/v1/folders/"+id.String(), body)
}

var folderTime = time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)

func sampleFolder(parent *uuid.UUID, depth, count int) domain.FolderWithCount {
	return domain.FolderWithCount{
		Folder:        domain.Folder{ID: uuid.New(), Name: "Work", ParentID: parent, Depth: depth, CreatedAt: folderTime, UpdatedAt: folderTime},
		BookmarkCount: count,
	}
}

func TestListFolders_Success(t *testing.T) {
	t.Run("items", func(t *testing.T) {
		parent := uuid.New()
		root, child := sampleFolder(nil, 1, 3), sampleFolder(&parent, 2, 0)
		spy := &folderSpy{list: []domain.FolderWithCount{root, child}}

		rec := do(folderRouter(spy), http.MethodGet, "/api/v1/folders", withSession(goodSession))

		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, "application/json", rec.Header().Get("Content-Type"))
		require.Equal(t, callerID, spy.gotUser)
		require.JSONEq(t, `{"items": [
			{"id": "`+root.ID.String()+`", "name": "Work", "parent_id": null, "depth": 1, "bookmark_count": 3,
			 "created_at": "2026-01-02T03:04:05Z", "updated_at": "2026-01-02T03:04:05Z"},
			{"id": "`+child.ID.String()+`", "name": "Work", "parent_id": "`+parent.String()+`", "depth": 2, "bookmark_count": 0,
			 "created_at": "2026-01-02T03:04:05Z", "updated_at": "2026-01-02T03:04:05Z"}
		]}`, rec.Body.String())
	})

	t.Run("none is an empty array, not null", func(t *testing.T) {
		for name, list := range map[string][]domain.FolderWithCount{"nil": nil, "empty": {}} {
			rec := do(folderRouter(&folderSpy{list: list}), http.MethodGet, "/api/v1/folders", withSession(goodSession))
			require.Equal(t, http.StatusOK, rec.Code, name)
			require.JSONEq(t, `{"items": []}`, rec.Body.String(), name)
		}
	})
}

func TestCreateFolder_Created(t *testing.T) {
	spy := &folderSpy{result: sampleFolder(nil, 1, 0)}

	rec := postFolder(spy, `{"name":"Work"}`)

	require.Equal(t, http.StatusCreated, rec.Code)
	require.Equal(t, "application/json", rec.Header().Get("Content-Type"))
	require.JSONEq(t, `{"id": "`+spy.result.ID.String()+`", "name": "Work", "parent_id": null, "depth": 1,
		"bookmark_count": 0, "created_at": "2026-01-02T03:04:05Z", "updated_at": "2026-01-02T03:04:05Z"}`, rec.Body.String())
	require.Equal(t, callerID, spy.gotUser)
	require.Equal(t, domain.FolderCreate{Name: "Work"}, spy.gotCreate)
}

func TestCreateFolder_RequestHandling(t *testing.T) {
	parent := uuid.New()

	t.Run("parent_id reaches the usecase", func(t *testing.T) {
		spy := &folderSpy{result: sampleFolder(&parent, 2, 0)}
		require.Equal(t, http.StatusCreated, postFolder(spy, `{"name":"x","parent_id":"`+parent.String()+`"}`).Code)
		require.Equal(t, &parent, spy.gotCreate.ParentID)
	})
	t.Run("null parent_id is the top level", func(t *testing.T) {
		spy := &folderSpy{result: sampleFolder(nil, 1, 0)}
		require.Equal(t, http.StatusCreated, postFolder(spy, `{"name":"x","parent_id":null}`).Code)
		require.Nil(t, spy.gotCreate.ParentID)
	})
	t.Run("unknown keys reach the usecase, sorted", func(t *testing.T) {
		spy := &folderSpy{result: sampleFolder(nil, 1, 0)}
		postFolder(spy, `{"name":"x","foo":1,"depth":2,"id":"a"}`)
		require.Equal(t, []string{"depth", "foo", "id"}, spy.gotCreate.UnknownKeys)
	})
	t.Run("a missing or null name reaches the usecase as empty", func(t *testing.T) {
		for _, body := range []string{`{}`, `{"name":null}`} {
			spy := &folderSpy{}
			postFolder(spy, body)
			require.Equal(t, 1, spy.calls, body)
			require.Equal(t, "", spy.gotCreate.Name, body)
		}
	})
	t.Run("a validation error from the usecase is 422 with its codes", func(t *testing.T) {
		spy := &folderSpy{err: &domain.ValidationError{Fields: []domain.FieldError{
			{Field: "depth", Code: "unknown_field"}, {Field: "id", Code: "unknown_field"}, {Field: "foo", Code: "unknown_field"},
		}}}
		requireListProblem(t, postFolder(spy, `{"name":"x"}`),
			fieldErr{"depth", "unknown_field"}, fieldErr{"id", "unknown_field"}, fieldErr{"foo", "unknown_field"})
	})
	t.Run("a missing name is 422 required", func(t *testing.T) {
		spy := &folderSpy{err: &domain.ValidationError{Fields: []domain.FieldError{{Field: "name", Code: "required"}}}}
		requireListProblem(t, postFolder(spy, `{}`), fieldErr{"name", "required"})
	})
	t.Run("binding failures keep the generated answer", func(t *testing.T) {
		for _, body := range []string{`{"name":`, `[]`, `{"name":5}`, `{"name":"x","parent_id":"nope"}`} {
			spy := &folderSpy{}
			requireProblem(t, postFolder(spy, body), http.StatusBadRequest, api.ErrorCodeValidationError)
			require.Zero(t, spy.calls, body)
		}
	})
}

func TestUpdateFolder_Success(t *testing.T) {
	parent := uuid.New()
	spy := &folderSpy{result: sampleFolder(&parent, 2, 5)}

	rec := patchFolder(spy, spy.result.ID, `{"name":"Work"}`)

	require.Equal(t, http.StatusOK, rec.Code)
	require.JSONEq(t, `{"id": "`+spy.result.ID.String()+`", "name": "Work", "parent_id": "`+parent.String()+`", "depth": 2,
		"bookmark_count": 5, "created_at": "2026-01-02T03:04:05Z", "updated_at": "2026-01-02T03:04:05Z"}`, rec.Body.String())
	require.Equal(t, callerID, spy.gotUser)
	require.Equal(t, spy.result.ID, spy.gotID)
}

func TestUpdateFolder_RequestHandling(t *testing.T) {
	id, parent := uuid.New(), uuid.New()
	spy := func() *folderSpy { return &folderSpy{result: sampleFolder(nil, 1, 0)} }

	t.Run("parent_id has three states", func(t *testing.T) {
		s := spy()
		require.Equal(t, http.StatusOK, patchFolder(s, id, `{"name":"x"}`).Code)
		require.Equal(t, domain.Absent[uuid.UUID](), s.gotUpdate.ParentID)

		s = spy()
		require.Equal(t, http.StatusOK, patchFolder(s, id, `{"parent_id":null}`).Code)
		require.Equal(t, domain.Null[uuid.UUID](), s.gotUpdate.ParentID)
		require.False(t, s.gotUpdate.Name.Set)

		s = spy()
		require.Equal(t, http.StatusOK, patchFolder(s, id, `{"parent_id":"`+parent.String()+`"}`).Code)
		require.Equal(t, domain.Value(parent), s.gotUpdate.ParentID)
	})
	t.Run("name has three states", func(t *testing.T) {
		s := spy()
		patchFolder(s, id, `{}`)
		require.Equal(t, domain.Absent[string](), s.gotUpdate.Name)
		s = spy()
		patchFolder(s, id, `{"name":null}`)
		require.Equal(t, domain.Null[string](), s.gotUpdate.Name)
		s = spy()
		patchFolder(s, id, `{"name":"  x "}`)
		require.Equal(t, domain.Value("  x "), s.gotUpdate.Name, "trimming is the usecase's job")
	})
	t.Run("unknown keys reach the usecase, sorted", func(t *testing.T) {
		s := spy()
		patchFolder(s, id, `{"foo":1,"depth":3,"id":"a"}`)
		require.Equal(t, []string{"depth", "foo", "id"}, s.gotUpdate.UnknownKeys)
	})
	t.Run("name null answers 422 invalid", func(t *testing.T) {
		s := &folderSpy{err: &domain.ValidationError{Fields: []domain.FieldError{{Field: "name", Code: "invalid"}}}}
		requireListProblem(t, patchFolder(s, id, `{"name":null}`), fieldErr{"name", "invalid"})
	})
	t.Run("binding failures keep the generated answer", func(t *testing.T) {
		s := spy()
		requireProblem(t, patchFolder(s, id, `{"parent_id":"nope"}`), http.StatusBadRequest, api.ErrorCodeValidationError)
		requireProblem(t, sendFolder(folderRouter(s), http.MethodPatch, "/api/v1/folders/not-a-uuid", `{}`), http.StatusBadRequest, api.ErrorCodeValidationError)
		require.Zero(t, s.calls)
	})
}

func TestDeleteFolder_Counts(t *testing.T) {
	id := uuid.New()
	spy := &folderSpy{deleted: domain.FolderDeletion{DeletedFolders: 3, TrashedBookmarks: 0}}

	rec := sendFolder(folderRouter(spy), http.MethodDelete, "/api/v1/folders/"+id.String(), "")

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "application/json", rec.Header().Get("Content-Type"))
	require.JSONEq(t, `{"deleted_folders": 3, "trashed_bookmarks": 0}`, rec.Body.String())
	require.Equal(t, callerID, spy.gotUser)
	require.Equal(t, id, spy.gotID)

	requireProblem(t, sendFolder(folderRouter(spy), http.MethodDelete, "/api/v1/folders/nope", ""), http.StatusBadRequest, api.ErrorCodeValidationError)
}

func TestFolderOperations_ErrorMappings(t *testing.T) {
	id := uuid.New().String()
	ops := map[string]func(*folderSpy) *httptest.ResponseRecorder{
		"list": func(s *folderSpy) *httptest.ResponseRecorder {
			return do(folderRouter(s), http.MethodGet, "/api/v1/folders", withSession(goodSession))
		},
		"create": func(s *folderSpy) *httptest.ResponseRecorder { return postFolder(s, `{"name":"x"}`) },
		"update": func(s *folderSpy) *httptest.ResponseRecorder {
			return sendFolder(folderRouter(s), http.MethodPatch, "/api/v1/folders/"+id, `{"name":"x"}`)
		},
		"delete": func(s *folderSpy) *httptest.ResponseRecorder {
			return sendFolder(folderRouter(s), http.MethodDelete, "/api/v1/folders/"+id, "")
		},
	}
	errs := []struct {
		name   string
		err    error
		status int
		code   api.ErrorCode
		only   []string // operations that can return it; empty means all
	}{
		{"not found", gorm.ErrRecordNotFound, http.StatusNotFound, api.ErrorCodeNotFound, []string{"create", "update", "delete"}},
		{"name conflict", domain.ErrFolderNameConflict, http.StatusConflict, api.ErrorCodeFolderNameConflict, []string{"create", "update"}},
		{"cycle", domain.ErrFolderCycle, http.StatusUnprocessableEntity, api.ErrorCodeFolderCycle, []string{"update"}},
		{"depth", domain.ErrFolderDepthExceeded, http.StatusUnprocessableEntity, api.ErrorCodeFolderDepthExceeded, []string{"create", "update"}},
		{"validation", &domain.ValidationError{Fields: []domain.FieldError{{Field: "name", Code: "required"}}}, http.StatusUnprocessableEntity, api.ErrorCodeValidationError, []string{"create", "update"}},
		{"unexpected", http.ErrAbortHandler, http.StatusInternalServerError, "internal_error", nil},
	}
	for _, e := range errs {
		names := e.only
		if len(names) == 0 {
			names = []string{"list", "create", "update", "delete"}
		}
		for _, op := range names {
			t.Run(op+" "+e.name, func(t *testing.T) {
				rec := ops[op](&folderSpy{err: e.err})
				requireProblem(t, rec, e.status, e.code)
				var raw map[string]any
				require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &raw))
				require.NotContains(t, rec.Body.String(), "abort", "internal text never reaches the client")
			})
		}
	}
}
