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

func send(e *echo.Echo, method, path string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(""))
	withSession(goodSession)(req)
	withCSRF()(req)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

func TestDeleteBookmark_NoContent(t *testing.T) {
	id := uuid.New()
	spy := &bookmarkSpy{}
	rec := send(routerWith(spy), http.MethodDelete, "/api/v1/bookmarks/"+id.String())
	require.Equal(t, http.StatusNoContent, rec.Code)
	require.Empty(t, rec.Body.Bytes())
	require.Equal(t, callerID, spy.gotUser)
	require.Equal(t, id, spy.gotID)
}

func TestRestoreBookmark_Success(t *testing.T) {
	id := uuid.New()
	spy := &bookmarkSpy{result: domain.Bookmark{
		ID: id, URL: "https://e.com", Title: "T", FetchStatus: domain.FetchOK,
		CreatedAt: time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC),
	}}
	rec := send(routerWith(spy), http.MethodPost, "/api/v1/bookmarks/"+id.String()+"/restore")

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "application/json", rec.Header().Get("Content-Type"))
	var got map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, id.String(), got["id"])
	require.Equal(t, "T", got["title"])
	require.Nil(t, got["folder_id"])
	require.Nil(t, got["deleted_at"])
	require.Equal(t, id, spy.gotID)
	require.Equal(t, callerID, spy.gotUser)
}

func TestEmptyTrash_Counts(t *testing.T) {
	for _, n := range []int64{0, 3} {
		spy := &bookmarkSpy{emptied: n}
		rec := send(routerWith(spy), http.MethodDelete, "/api/v1/trash")
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, "application/json", rec.Header().Get("Content-Type"))
		var got map[string]any
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
		require.Equal(t, map[string]any{"deleted": float64(n)}, got)
		require.Equal(t, callerID, spy.gotUser)
	}
}

func TestTrashOperations_Problems(t *testing.T) {
	id := uuid.NewString()
	ops := []struct {
		name   string
		method string
		path   string
		errs   map[string]error // problem name -> error the usecase returns
	}{
		{"delete", http.MethodDelete, "/api/v1/bookmarks/" + id, map[string]error{
			"not_found": gorm.ErrRecordNotFound, "bookmark_in_trash": domain.ErrBookmarkInTrash}},
		{"restore", http.MethodPost, "/api/v1/bookmarks/" + id + "/restore", map[string]error{
			"not_found": gorm.ErrRecordNotFound, "bookmark_not_in_trash": domain.ErrBookmarkNotInTrash}},
		{"empty trash", http.MethodDelete, "/api/v1/trash", map[string]error{}},
	}
	status := map[string]int{"not_found": 404, "bookmark_in_trash": 409, "bookmark_not_in_trash": 409}
	for _, op := range ops {
		for code, err := range op.errs {
			t.Run(op.name+" "+code, func(t *testing.T) {
				rec := send(routerWith(&bookmarkSpy{err: err}), op.method, op.path)
				requireProblem(t, rec, status[code], api.ErrorCode(code))
			})
		}
		t.Run(op.name+" unexpected error is a 500", func(t *testing.T) {
			rec := send(routerWith(&bookmarkSpy{err: assertErr("boom")}), op.method, op.path)
			requireProblem(t, rec, http.StatusInternalServerError, "internal_error")
			require.NotContains(t, rec.Body.String(), "boom")
		})
	}
}

func TestTrashOperations_MalformedID(t *testing.T) {
	for _, op := range []struct{ method, path string }{
		{http.MethodDelete, "/api/v1/bookmarks/not-a-uuid"},
		{http.MethodPost, "/api/v1/bookmarks/not-a-uuid/restore"},
	} {
		t.Run(op.method+" "+op.path, func(t *testing.T) {
			spy := &bookmarkSpy{}
			rec := send(routerWith(spy), op.method, op.path)
			requireProblem(t, rec, http.StatusBadRequest, api.ErrorCodeValidationError)
			require.Zero(t, spy.deleteCalls)
		})
	}
}
