package handler

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/api"
	"marker/internal/domain"
)

func listBookmarks(spy *bookmarkSpy, query string) *httptest.ResponseRecorder {
	return do(routerWith(spy), http.MethodGet, "/api/v1/bookmarks"+query, withSession(goodSession))
}

type fieldErr struct{ Field, Code string }

// requireListProblem asserts the application/problem+json shape of a 422 and its errors.
func requireListProblem(t *testing.T, rec *httptest.ResponseRecorder, want ...fieldErr) {
	t.Helper()
	requireProblem(t, rec, http.StatusUnprocessableEntity, api.ErrorCodeValidationError)
	var p api.ValidationProblem
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &p))
	require.NotNil(t, p.Errors)
	var got []fieldErr
	for _, e := range *p.Errors {
		got = append(got, fieldErr{e.Field, e.Code})
	}
	require.ElementsMatch(t, want, got)
}

func liveCursor() string {
	return domain.EncodeCursor(domain.Cursor{Mode: domain.ListLive, At: time.Now(), ID: uuid.New()})
}

func TestListBookmarks_PageShape(t *testing.T) {
	t.Run("empty page", func(t *testing.T) {
		rec := listBookmarks(&bookmarkSpy{page: domain.BookmarkPage{Items: []domain.Bookmark{}}}, "")
		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, `{"items": [], "next_cursor": null}`, rec.Body.String())
	})

	t.Run("a nil item slice still renders as an empty array", func(t *testing.T) {
		rec := listBookmarks(&bookmarkSpy{}, "")
		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, `{"items": [], "next_cursor": null}`, rec.Body.String())
	})

	t.Run("items and next cursor", func(t *testing.T) {
		created := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
		deleted := time.Date(2026, 2, 3, 4, 5, 6, 0, time.UTC)
		folder, favicon := uuid.New(), uuid.New()
		live := domain.Bookmark{ID: uuid.New(), URL: "https://a.example", Title: "A", Note: "n",
			FolderID: &folder, FaviconID: &favicon, FetchStatus: domain.FetchOK, CreatedAt: created}
		trashed := domain.Bookmark{ID: uuid.New(), URL: "https://b.example", Title: "B",
			FetchStatus: domain.FetchPending, CreatedAt: created, DeletedAt: &deleted}
		next := "abc"
		rec := listBookmarks(&bookmarkSpy{page: domain.BookmarkPage{Items: []domain.Bookmark{live, trashed}, NextCursor: &next}}, "")

		require.Equal(t, http.StatusOK, rec.Code)
		require.Contains(t, rec.Header().Get("Content-Type"), "application/json")
		var page api.BookmarkPage
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &page))
		require.Equal(t, &next, page.NextCursor)
		require.Len(t, page.Items, 2)

		require.Equal(t, live.ID, page.Items[0].Id)
		require.Equal(t, "https://a.example", page.Items[0].Url)
		require.Equal(t, "A", page.Items[0].Title)
		require.Equal(t, "n", *page.Items[0].Note)
		require.Equal(t, &folder, page.Items[0].FolderId)
		require.Equal(t, "/api/v1/favicons/"+favicon.String(), *page.Items[0].FaviconUrl)
		require.Equal(t, api.FetchStatus("ok"), page.Items[0].FetchStatus)
		require.True(t, created.Equal(page.Items[0].CreatedAt))
		require.Nil(t, page.Items[0].DeletedAt)

		require.Nil(t, page.Items[1].Note)
		require.NotNil(t, page.Items[1].DeletedAt)
		require.True(t, deleted.Equal(*page.Items[1].DeletedAt))

		// Page content is never part of a summary.
		require.NotContains(t, rec.Body.String(), `"content"`)
	})
}

var searchFolder = uuid.New()

func TestListBookmarks_PassesParametersDown(t *testing.T) {
	cursor := liveCursor()
	tests := []struct {
		name  string
		query string
		want  domain.ListBookmarksInput
	}{
		{"nothing sent", "", domain.ListBookmarksInput{}},
		{"trashed false", "?trashed=false", domain.ListBookmarksInput{}},
		{"trashed true", "?trashed=true", domain.ListBookmarksInput{Trashed: true}},
		{"cursor and limit", "?cursor=" + cursor + "&limit=25", domain.ListBookmarksInput{Cursor: cursor, Limit: 25}},
		{"include_notes alone is ignored", "?include_notes=true", domain.ListBookmarksInput{}},
		{"empty q after trimming counts as absent", "?q=%20%20", domain.ListBookmarksInput{}},
		{"empty q with include_notes is a plain list", "?q=%20&include_notes=true", domain.ListBookmarksInput{}},
		{"q is trimmed", "?q=%20go%20", domain.ListBookmarksInput{Query: "go"}},
		{"q alone does not set include_notes", "?q=go", domain.ListBookmarksInput{Query: "go"}},
		{"include_notes with q is passed down", "?include_notes=true&q=go", domain.ListBookmarksInput{Query: "go", IncludeNotes: true}},
		{"include_notes=false with q", "?include_notes=false&q=go", domain.ListBookmarksInput{Query: "go"}},
		{"q with a folder and limit", "?q=go&limit=5&folder_id=" + searchFolder.String(), domain.ListBookmarksInput{Query: "go", Limit: 5, FolderID: &searchFolder}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spy := &bookmarkSpy{}
			rec := listBookmarks(spy, tt.query)
			require.Equal(t, http.StatusOK, rec.Code)
			require.Equal(t, tt.want, spy.gotList)
			require.Equal(t, callerID, spy.gotListUser)
		})
	}
}

func TestListBookmarks_LimitRange(t *testing.T) {
	for _, limit := range []string{"0", "101", "-1"} {
		t.Run("limit="+limit+" is out of range", func(t *testing.T) {
			spy := &bookmarkSpy{}
			requireListProblem(t, listBookmarks(spy, "?limit="+limit), fieldErr{"limit", "out_of_range"})
			require.Zero(t, spy.listCalls)
		})
	}
	for _, limit := range []string{"1", "100"} {
		t.Run("limit="+limit+" passes", func(t *testing.T) {
			spy := &bookmarkSpy{}
			require.Equal(t, http.StatusOK, listBookmarks(spy, "?limit="+limit).Code)
			require.Equal(t, 1, spy.listCalls)
		})
	}

	t.Run("a limit that is not an integer is the wrapper's 400", func(t *testing.T) {
		spy := &bookmarkSpy{}
		requireProblem(t, listBookmarks(spy, "?limit=abc"), http.StatusBadRequest, api.ErrorCodeValidationError)
		require.Zero(t, spy.listCalls)
	})

	t.Run("the limit check comes first", func(t *testing.T) {
		requireListProblem(t, listBookmarks(&bookmarkSpy{}, "?limit=0&trashed=true&q=go&cursor=bad"), fieldErr{"limit", "out_of_range"})
	})
}

func TestListBookmarks_TrashedCombinations(t *testing.T) {
	folder := uuid.NewString()
	tests := []struct {
		name  string
		query string
		want  []fieldErr
	}{
		{"with q", "?trashed=true&q=go", []fieldErr{{"q", "not_allowed_with_trashed"}}},
		{"with folder_id", "?trashed=true&folder_id=" + folder, []fieldErr{{"folder_id", "not_allowed_with_trashed"}}},
		{"with both", "?trashed=true&q=go&folder_id=" + folder, []fieldErr{{"q", "not_allowed_with_trashed"}, {"folder_id", "not_allowed_with_trashed"}}},
		{"combination comes before the cursor check", "?trashed=true&q=go&cursor=bad", []fieldErr{{"q", "not_allowed_with_trashed"}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spy := &bookmarkSpy{}
			requireListProblem(t, listBookmarks(spy, tt.query), tt.want...)
			require.Zero(t, spy.listCalls)
		})
	}

	for _, query := range []string{"?trashed=true&q=", "?trashed=true&q=%20"} {
		t.Run("empty q is allowed: "+query, func(t *testing.T) {
			spy := &bookmarkSpy{}
			require.Equal(t, http.StatusOK, listBookmarks(spy, query).Code)
			require.True(t, spy.gotList.Trashed)
		})
	}
}

func TestListBookmarks_InvalidCursor(t *testing.T) {
	trashCursor := domain.EncodeCursor(domain.Cursor{Mode: domain.ListTrash, At: time.Now(), ID: uuid.New()})
	tests := []struct{ name, query string }{
		{"garbage", "?cursor=not-a-cursor"},
		{"a live cursor used for the trash", "?trashed=true&cursor=" + liveCursor()},
		{"a trash cursor used for the live list", "?cursor=" + trashCursor},
		{"a cursor with q does not reach the 501", "?q=go&cursor=bad"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spy := &bookmarkSpy{}
			requireListProblem(t, listBookmarks(spy, tt.query), fieldErr{"cursor", "invalid"})
			require.Zero(t, spy.listCalls)
		})
	}
}

func TestListBookmarks_CursorLengthBoundary(t *testing.T) {
	base := `{"m":"live","t":"2026-01-01T00:00:00Z","id":"` + uuid.NewString() + `"}`
	padTo := func(n int) string {
		for i := 0; ; i++ {
			s := base64.RawURLEncoding.EncodeToString([]byte(base + strings.Repeat(" ", i)))
			if len(s) >= n {
				return s
			}
		}
	}
	// No valid base64url string is 513 characters long, so the 513 case is one more character.
	at512 := padTo(domain.MaxCursorLength)
	at513 := at512 + "A"
	require.Len(t, at512, 512)
	require.Len(t, at513, 513)

	spy := &bookmarkSpy{}
	require.Equal(t, http.StatusOK, listBookmarks(spy, "?cursor="+at512).Code)
	require.Equal(t, at512, spy.gotList.Cursor)

	spy = &bookmarkSpy{}
	requireListProblem(t, listBookmarks(spy, "?cursor="+at513), fieldErr{"cursor", "invalid"})
	require.Zero(t, spy.listCalls)
}

func TestListBookmarks_UsecaseValidationErrorIs422(t *testing.T) {
	spy := &bookmarkSpy{err: &domain.ValidationError{Fields: []domain.FieldError{{Field: "cursor", Code: "invalid"}}}}
	requireListProblem(t, listBookmarks(spy, ""), fieldErr{"cursor", "invalid"})
}

func TestListBookmarks_UnexpectedErrorIs500(t *testing.T) {
	spy := &bookmarkSpy{err: http.ErrAbortHandler}
	requireProblem(t, listBookmarks(spy, ""), http.StatusInternalServerError, "internal_error")
}

func TestListBookmarks_FolderFilter(t *testing.T) {
	folder := uuid.New()

	t.Run("folder_id alone reaches the usecase", func(t *testing.T) {
		spy := &bookmarkSpy{}
		rec := listBookmarks(spy, "?trashed=false&folder_id="+folder.String())
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, 1, spy.listCalls)
		require.Equal(t, &folder, spy.gotList.FolderID)
		require.False(t, spy.gotList.Trashed)
	})

	t.Run("no folder_id reaches the usecase as nil", func(t *testing.T) {
		spy := &bookmarkSpy{}
		require.Equal(t, http.StatusOK, listBookmarks(spy, "").Code)
		require.Nil(t, spy.gotList.FolderID)
	})

	t.Run("an unknown folder is 404", func(t *testing.T) {
		spy := &bookmarkSpy{err: gorm.ErrRecordNotFound}
		requireProblem(t, listBookmarks(spy, "?folder_id="+folder.String()), http.StatusNotFound, api.ErrorCodeNotFound)
	})

	t.Run("with trashed=true is 422", func(t *testing.T) {
		spy := &bookmarkSpy{}
		requireListProblem(t, listBookmarks(spy, "?trashed=true&folder_id="+folder.String()), fieldErr{"folder_id", "not_allowed_with_trashed"})
		require.Zero(t, spy.listCalls)
	})

	t.Run("a bad cursor is 422 before the folder is looked up", func(t *testing.T) {
		spy := &bookmarkSpy{err: gorm.ErrRecordNotFound}
		requireListProblem(t, listBookmarks(spy, "?cursor=garbage&folder_id="+folder.String()), fieldErr{"cursor", "invalid"})
		require.Zero(t, spy.listCalls)
	})

	t.Run("a bad limit is 422 before everything", func(t *testing.T) {
		spy := &bookmarkSpy{}
		requireListProblem(t, listBookmarks(spy, "?limit=0&trashed=true&folder_id="+folder.String()), fieldErr{"limit", "out_of_range"})
	})

	t.Run("with q, an unknown folder is 404", func(t *testing.T) {
		spy := &bookmarkSpy{err: gorm.ErrRecordNotFound}
		requireProblem(t, listBookmarks(spy, "?q=go&folder_id="+folder.String()), http.StatusNotFound, api.ErrorCodeNotFound)
		require.Equal(t, 1, spy.listCalls)
	})
}

func TestListBookmarks_Query(t *testing.T) {
	t.Run("q reaches the usecase and answers 200", func(t *testing.T) {
		spy := &bookmarkSpy{}
		rec := listBookmarks(spy, "?q=go")
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, 1, spy.listCalls)
		require.Equal(t, "go", spy.gotList.Query)
	})

	t.Run("a blank q is a plain list", func(t *testing.T) {
		spy := &bookmarkSpy{}
		require.Equal(t, http.StatusOK, listBookmarks(spy, "?q=%20%20").Code)
		require.Empty(t, spy.gotList.Query)
		require.False(t, spy.gotList.IsSearch())
	})

	t.Run("an empty page answers an empty array and a null cursor", func(t *testing.T) {
		spy := &bookmarkSpy{}
		rec := listBookmarks(spy, "?q=the")
		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, `{"items":[],"next_cursor":null}`, rec.Body.String())
	})

	length := []struct {
		name   string
		q      string
		wantOK bool
	}{
		{"200 ASCII characters", strings.Repeat("a", 200), true},
		{"201 ASCII characters", strings.Repeat("a", 201), false},
		{"200 two-byte characters", strings.Repeat("é", 200), true},
		{"201 two-byte characters", strings.Repeat("é", 201), false},
		{"200 emoji", strings.Repeat("😀", 200), true},
		{"201 emoji", strings.Repeat("😀", 201), false},
		{"200 characters inside spaces", "  " + strings.Repeat("a", 200) + " ", true},
		{"201 characters inside spaces", "  " + strings.Repeat("a", 201) + " ", false},
	}
	for _, tt := range length {
		t.Run(tt.name, func(t *testing.T) {
			spy := &bookmarkSpy{}
			rec := listBookmarks(spy, "?q="+url.QueryEscape(tt.q))
			if tt.wantOK {
				require.Equal(t, http.StatusOK, rec.Code)
				require.Equal(t, 1, spy.listCalls)
				return
			}
			requireListProblem(t, rec, fieldErr{"q", "too_long"})
			require.Zero(t, spy.listCalls)
		})
	}
}

func TestListBookmarks_CheckOrder(t *testing.T) {
	long := strings.Repeat("a", 201)
	folder := uuid.NewString()
	tests := []struct {
		name  string
		query string
		want  []fieldErr
	}{
		{"limit comes before a too long q", "?limit=0&q=" + long, []fieldErr{{"limit", "out_of_range"}}},
		{"trashed comes before a too long q", "?trashed=true&q=" + long, []fieldErr{{"q", "not_allowed_with_trashed"}}},
		{"a too long q comes before a bad cursor", "?q=" + long + "&cursor=garbage", []fieldErr{{"q", "too_long"}}},
		{"a bad cursor comes before the folder lookup", "?q=go&cursor=garbage&folder_id=" + folder, []fieldErr{{"cursor", "invalid"}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spy := &bookmarkSpy{}
			requireListProblem(t, listBookmarks(spy, tt.query), tt.want...)
			require.Zero(t, spy.listCalls)
		})
	}
}

func TestListBookmarks_SearchCursor(t *testing.T) {
	folderID := uuid.New()
	mine := domain.EncodeSearchCursor(10, domain.SearchFingerprint("go", true, &folderID))

	t.Run("the cursor of the same search passes", func(t *testing.T) {
		spy := &bookmarkSpy{}
		rec := listBookmarks(spy, "?q=%20go&include_notes=true&folder_id="+folderID.String()+"&cursor="+mine)
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, mine, spy.gotList.Cursor)
	})

	rejected := []struct{ name, query string }{
		{"another q", "?q=rust&include_notes=true&folder_id=" + folderID.String() + "&cursor=" + mine},
		{"include_notes flipped", "?q=go&folder_id=" + folderID.String() + "&cursor=" + mine},
		{"another folder", "?q=go&include_notes=true&folder_id=" + uuid.NewString() + "&cursor=" + mine},
		{"no folder", "?q=go&include_notes=true&cursor=" + mine},
		{"a plain-list cursor", "?q=go&cursor=" + liveCursor()},
		{"a search cursor sent to the plain list", "?cursor=" + mine},
		{"a search cursor sent to the trash", "?trashed=true&cursor=" + mine},
	}
	for _, tt := range rejected {
		t.Run("rejects "+tt.name, func(t *testing.T) {
			spy := &bookmarkSpy{}
			requireListProblem(t, listBookmarks(spy, tt.query), fieldErr{"cursor", "invalid"})
			require.Zero(t, spy.listCalls)
		})
	}
}
