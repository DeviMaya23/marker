package handler

import (
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

func patchBookmark(e *echo.Echo, id, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/bookmarks/"+id, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	withSession(goodSession)(req)
	withCSRF()(req)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

func TestUpdateBookmark_Success(t *testing.T) {
	id, folder := uuid.New(), uuid.New()
	spy := &bookmarkSpy{result: domain.Bookmark{
		ID: id, URL: "https://e.com", Title: "New", Note: "n", FolderID: &folder,
		FetchStatus: domain.FetchOK, CreatedAt: time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC),
	}}

	rec := patchBookmark(routerWith(spy), id.String(), `{"title":"New"}`)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "application/json", rec.Header().Get("Content-Type"))
	var got map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, id.String(), got["id"])
	require.Equal(t, "New", got["title"])
	require.Equal(t, "n", got["note"])
	require.Equal(t, folder.String(), got["folder_id"])
	require.Equal(t, "ok", got["fetch_status"])
	require.Equal(t, "2026-01-02T03:04:05Z", got["created_at"])
	require.Nil(t, got["deleted_at"])
	require.Equal(t, callerID, spy.gotUser)
	require.Equal(t, id, spy.gotID)
}

func TestUpdateBookmark_ClearedNoteIsNull(t *testing.T) {
	spy := &bookmarkSpy{result: domain.Bookmark{ID: uuid.New(), FetchStatus: domain.FetchOK}}
	rec := patchBookmark(routerWith(spy), uuid.NewString(), `{"note":null}`)
	require.Equal(t, http.StatusOK, rec.Code)
	var got map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Contains(t, got, "note")
	require.Nil(t, got["note"])
}

func TestUpdateBookmark_PassesThreeStates(t *testing.T) {
	folder := uuid.New()
	tests := []struct {
		name string
		body string
		want domain.BookmarkUpdate
	}{
		{"empty object", `{}`, domain.BookmarkUpdate{}},
		{"note absent", `{"title":"t"}`, domain.BookmarkUpdate{Title: domain.Value("t")}},
		{"note null", `{"note":null}`, domain.BookmarkUpdate{Note: domain.Null[string]()}},
		{"note value", `{"note":"x"}`, domain.BookmarkUpdate{Note: domain.Value("x")}},
		{"note empty string", `{"note":""}`, domain.BookmarkUpdate{Note: domain.Value("")}},
		{"note whitespace", `{"note":"   "}`, domain.BookmarkUpdate{Note: domain.Value("   ")}},
		{"title empty string", `{"title":""}`, domain.BookmarkUpdate{Title: domain.Value("")}},
		{"folder null", `{"folder_id":null}`, domain.BookmarkUpdate{FolderID: domain.Null[uuid.UUID]()}},
		{"folder value", `{"folder_id":"` + folder.String() + `"}`, domain.BookmarkUpdate{FolderID: domain.Value(folder)}},
		{"title null", `{"title":null}`, domain.BookmarkUpdate{Title: domain.Null[string]()}},
		{"all three", `{"title":"t","note":null,"folder_id":null}`, domain.BookmarkUpdate{
			Title: domain.Value("t"), Note: domain.Null[string](), FolderID: domain.Null[uuid.UUID](),
		}},
		{"json null body", `null`, domain.BookmarkUpdate{}},
		{"duplicate key keeps the last", `{"note":"x","note":null}`, domain.BookmarkUpdate{Note: domain.Null[string]()}},
		{"unknown keys sorted", `{"url":"x","fetch_status":"ok","foo":1}`, domain.BookmarkUpdate{UnknownKeys: []string{"fetch_status", "foo", "url"}}},
		{"keys are case-sensitive", `{"Title":"x"}`, domain.BookmarkUpdate{UnknownKeys: []string{"Title"}}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			spy := &bookmarkSpy{result: domain.Bookmark{ID: uuid.New()}}
			rec := patchBookmark(routerWith(spy), uuid.NewString(), tc.body)
			require.Equal(t, http.StatusOK, rec.Code)
			require.Equal(t, 1, spy.updateCalls)
			require.Equal(t, tc.want, spy.gotUpdate)
		})
	}
}

func TestUpdateBookmark_ValidationFromTheUsecase(t *testing.T) {
	tests := []struct {
		name   string
		body   string
		err    *domain.ValidationError
		fields []map[string]string
	}{
		{"unknown keys", `{"url":"x","foo":1}`, &domain.ValidationError{Fields: []domain.FieldError{
			{Field: "foo", Code: "unknown_field"}, {Field: "url", Code: "unknown_field"},
		}}, []map[string]string{{"field": "foo", "code": "unknown_field"}, {"field": "url", "code": "unknown_field"}}},
		{"title null", `{"title":null}`, &domain.ValidationError{Fields: []domain.FieldError{{Field: "title", Code: "invalid"}}},
			[]map[string]string{{"field": "title", "code": "invalid"}}},
		{"title too long", `{"title":"` + strings.Repeat("a", 301) + `"}`, &domain.ValidationError{Fields: []domain.FieldError{{Field: "title", Code: "too_long"}}},
			[]map[string]string{{"field": "title", "code": "too_long"}}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			spy := &bookmarkSpy{err: tc.err}
			rec := patchBookmark(routerWith(spy), uuid.NewString(), tc.body)

			requireProblem(t, rec, http.StatusUnprocessableEntity, api.ErrorCodeValidationError)
			var body struct {
				Errors []map[string]string `json:"errors"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
			require.Equal(t, tc.fields, body.Errors)
		})
	}

	t.Run("the 301-character title reaches the usecase to be judged", func(t *testing.T) {
		spy := &bookmarkSpy{result: domain.Bookmark{ID: uuid.New()}}
		patchBookmark(routerWith(spy), uuid.NewString(), `{"title":"`+strings.Repeat("a", 301)+`"}`)
		require.Equal(t, domain.Value(strings.Repeat("a", 301)), spy.gotUpdate.Title)
	})
}

func TestUpdateBookmark_Problems(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		status int
		code   api.ErrorCode
	}{
		{"not found", gorm.ErrRecordNotFound, http.StatusNotFound, api.ErrorCodeNotFound},
		{"in trash", domain.ErrBookmarkInTrash, http.StatusConflict, api.ErrorCodeBookmarkInTrash},
		{"other error is a 500", assertErr("boom"), http.StatusInternalServerError, "internal_error"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := patchBookmark(routerWith(&bookmarkSpy{err: c.err}), uuid.NewString(), `{"title":"x"}`)
			requireProblem(t, rec, c.status, c.code)
			require.NotContains(t, rec.Body.String(), "boom")
		})
	}
}

func TestUpdateBookmark_BindingFailures(t *testing.T) {
	for name, body := range map[string]string{
		"malformed id":    "",
		"array body":      `[1]`,
		"string body":     `"x"`,
		"broken json":     `{"note":`,
		"folder not uuid": `{"folder_id":"nope"}`,
	} {
		t.Run(name, func(t *testing.T) {
			spy := &bookmarkSpy{}
			id := uuid.NewString()
			if name == "malformed id" {
				id, body = "not-a-uuid", `{}`
			}
			rec := patchBookmark(routerWith(spy), id, body)
			requireProblem(t, rec, http.StatusBadRequest, api.ErrorCodeValidationError)
			require.Zero(t, spy.updateCalls)
		})
	}
}
