package usecase

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/domain"
)

var listBase = time.Date(2026, 1, 1, 12, 0, 0, 123456000, time.UTC)

// seedLive stores n live bookmarks for user, created one second apart (the last is newest).
func seedLive(f *createFixture, n int) {
	for i := 0; i < n; i++ {
		f.store.bookmarks = append(f.store.bookmarks, domain.Bookmark{
			ID: domain.NewID(), UserID: f.user, CreatedAt: listBase.Add(time.Duration(i) * time.Second),
		})
	}
}

func seedTrash(f *createFixture, n int) {
	for i := 0; i < n; i++ {
		del := listBase.Add(time.Duration(i) * time.Second)
		f.store.bookmarks = append(f.store.bookmarks, domain.Bookmark{
			ID: domain.NewID(), UserID: f.user, CreatedAt: listBase, DeletedAt: &del,
		})
	}
}

func TestBookmarkService_List_DefaultLimitAsksForOneMore(t *testing.T) {
	f := newCreateFixture()

	_, err := f.svc.List(context.Background(), f.user, domain.ListBookmarksInput{})
	require.NoError(t, err)
	require.Equal(t, 51, f.store.lastList.Limit)

	_, err = f.svc.List(context.Background(), f.user, domain.ListBookmarksInput{Limit: 7})
	require.NoError(t, err)
	require.Equal(t, 8, f.store.lastList.Limit)
}

func TestBookmarkService_List_Paging(t *testing.T) {
	tests := []struct {
		name       string
		trashed    bool
		stored     int
		limit      int
		wantItems  int
		wantCursor bool
	}{
		{"live, more rows than the limit", false, 4, 3, 3, true},
		{"live, exactly the limit", false, 3, 3, 3, false},
		{"live, fewer than the limit", false, 2, 3, 2, false},
		{"live, none", false, 0, 3, 0, false},
		{"trash, more rows than the limit", true, 4, 3, 3, true},
		{"trash, exactly the limit", true, 3, 3, 3, false},
		{"trash, none", true, 0, 3, 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newCreateFixture()
			if tt.trashed {
				seedTrash(f, tt.stored)
			} else {
				seedLive(f, tt.stored)
			}

			page, err := f.svc.List(context.Background(), f.user, domain.ListBookmarksInput{Trashed: tt.trashed, Limit: tt.limit})
			require.NoError(t, err)
			require.NotNil(t, page.Items)
			require.Len(t, page.Items, tt.wantItems)

			if !tt.wantCursor {
				require.Nil(t, page.NextCursor)
				return
			}
			require.NotNil(t, page.NextCursor)
			mode := domain.ListLive
			if tt.trashed {
				mode = domain.ListTrash
			}
			got, err := domain.DecodeCursor(*page.NextCursor, mode)
			require.NoError(t, err)
			last := page.Items[len(page.Items)-1]
			require.Equal(t, last.ID, got.ID, "the cursor points at the last returned row, not the extra one")
			wantAt := last.CreatedAt
			if tt.trashed {
				wantAt = *last.DeletedAt
			}
			require.Equal(t, wantAt.UnixNano(), got.At.UnixNano())
		})
	}
}

func TestBookmarkService_List_FollowingTheCursorVisitsEachRowOnce(t *testing.T) {
	f := newCreateFixture()
	seedLive(f, 7)

	seen := map[uuid.UUID]bool{}
	in := domain.ListBookmarksInput{Limit: 3}
	var sizes []int
	for {
		page, err := f.svc.List(context.Background(), f.user, in)
		require.NoError(t, err)
		sizes = append(sizes, len(page.Items))
		for _, b := range page.Items {
			require.False(t, seen[b.ID], "row repeated")
			seen[b.ID] = true
		}
		if page.NextCursor == nil {
			break
		}
		in.Cursor = *page.NextCursor
	}
	require.Equal(t, []int{3, 3, 1}, sizes)
	require.Len(t, seen, 7)
}

func TestBookmarkService_List_WrongModeCursorIsRejected(t *testing.T) {
	f := newCreateFixture()
	live := domain.EncodeCursor(domain.Cursor{Mode: domain.ListLive, At: listBase, ID: domain.NewID()})
	trash := domain.EncodeCursor(domain.Cursor{Mode: domain.ListTrash, At: listBase, ID: domain.NewID()})

	for name, in := range map[string]domain.ListBookmarksInput{
		"live cursor for the trash": {Trashed: true, Cursor: live},
		"trash cursor for the list": {Cursor: trash},
		"garbage":                   {Cursor: "!!"},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := f.svc.List(context.Background(), f.user, in)
			require.ErrorIs(t, err, domain.ErrValidation)
			var ve *domain.ValidationError
			require.ErrorAs(t, err, &ve)
			require.Equal(t, []domain.FieldError{{Field: "cursor", Code: "invalid"}}, ve.Fields)
		})
	}
}

func TestBookmarkService_List_PassesCursorAndUserToStore(t *testing.T) {
	f := newCreateFixture()
	at := time.Date(2026, 5, 6, 7, 8, 9, 123456789, time.UTC)
	id := domain.NewID() // an id that exists nowhere: paging must still start from it
	cursor := domain.EncodeCursor(domain.Cursor{Mode: domain.ListTrash, At: at, ID: id})

	_, err := f.svc.List(context.Background(), f.user, domain.ListBookmarksInput{Trashed: true, Cursor: cursor, Limit: 10})
	require.NoError(t, err)

	q := f.store.lastList
	require.Equal(t, f.user, q.UserID)
	require.Equal(t, domain.ListTrash, q.Mode)
	require.Equal(t, 11, q.Limit)
	require.NotNil(t, q.After)
	require.Equal(t, id, q.After.ID)
	require.Equal(t, at.UnixNano(), q.After.At.UnixNano())

	_, err = f.svc.List(context.Background(), f.user, domain.ListBookmarksInput{})
	require.NoError(t, err)
	require.Nil(t, f.store.lastList.After, "no cursor means the first page")
	require.Equal(t, domain.ListLive, f.store.lastList.Mode)
}

func TestBookmarkService_List_FolderFilter(t *testing.T) {
	ctx := context.Background()

	t.Run("the store receives the folder id", func(t *testing.T) {
		f := newCreateFixture()
		_, err := f.svc.List(ctx, f.user, domain.ListBookmarksInput{FolderID: &f.folderID})
		require.NoError(t, err)
		require.Equal(t, &f.folderID, f.store.lastList.FolderID)
	})

	t.Run("another user's or unknown folder is not found", func(t *testing.T) {
		f := newCreateFixture()
		unknown := uuid.New()
		for name, id := range map[string]uuid.UUID{"unknown": unknown} {
			_, err := f.svc.List(ctx, f.user, domain.ListBookmarksInput{FolderID: &id})
			require.ErrorIs(t, err, gorm.ErrRecordNotFound, name)
		}
		_, err := f.svc.List(ctx, uuid.New(), domain.ListBookmarksInput{FolderID: &f.folderID})
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	})

	t.Run("a bad cursor is reported before the folder", func(t *testing.T) {
		f := newCreateFixture()
		unknown := uuid.New()
		_, err := f.svc.List(ctx, f.user, domain.ListBookmarksInput{FolderID: &unknown, Cursor: "garbage"})
		require.ErrorIs(t, err, domain.ErrValidation)
	})

	t.Run("no folder filter means the store gets none", func(t *testing.T) {
		f := newCreateFixture()
		_, err := f.svc.List(ctx, f.user, domain.ListBookmarksInput{})
		require.NoError(t, err)
		require.Nil(t, f.store.lastList.FolderID)
	})
}

func seedSearchRows(f *createFixture, n int) {
	for i := 0; i < n; i++ {
		f.store.searchRows = append(f.store.searchRows, domain.Bookmark{ID: domain.NewID(), UserID: f.user})
	}
}

func TestBookmarkService_List_Search_PassesQueryToStore(t *testing.T) {
	ctx := context.Background()
	f := newCreateFixture()

	_, err := f.svc.List(ctx, f.user, domain.ListBookmarksInput{Query: "  go  ", IncludeNotes: true, FolderID: &f.folderID, Limit: 10})
	require.NoError(t, err)
	require.Equal(t, domain.BookmarkSearchQuery{
		UserID: f.user, Query: "go", IncludeNotes: true, FolderID: &f.folderID, Offset: 0, Limit: 11,
	}, f.store.lastSearch)
	require.Equal(t, domain.BookmarkListQuery{}, f.store.lastList, "the plain list is not used")

	fp := domain.SearchFingerprint("go", true, &f.folderID)
	cursor := domain.EncodeSearchCursor(30, fp)
	_, err = f.svc.List(ctx, f.user, domain.ListBookmarksInput{Query: "go", IncludeNotes: true, FolderID: &f.folderID, Cursor: cursor})
	require.NoError(t, err)
	require.Equal(t, 30, f.store.lastSearch.Offset)
	require.Equal(t, domain.DefaultListLimit+1, f.store.lastSearch.Limit)
}

func TestBookmarkService_List_Search_Paging(t *testing.T) {
	tests := []struct {
		name       string
		rows       int
		offset     int
		wantItems  int
		wantCursor bool
		wantOffset int
	}{
		{"more rows than the limit", 6, 0, 5, true, 5},
		{"exactly the limit", 5, 0, 5, false, 0},
		{"fewer than the limit", 3, 0, 3, false, 0},
		{"no rows", 0, 0, 0, false, 0},
		{"second page continues from the offset", 12, 5, 5, true, 10},
		{"offset past the end", 3, 100, 0, false, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newCreateFixture()
			seedSearchRows(f, tt.rows)
			in := domain.ListBookmarksInput{Query: "go", Limit: 5}
			if tt.offset > 0 {
				in.Cursor = domain.EncodeSearchCursor(tt.offset, domain.SearchFingerprint("go", false, nil))
			}
			page, err := f.svc.List(context.Background(), f.user, in)
			require.NoError(t, err)
			require.NotNil(t, page.Items)
			require.Len(t, page.Items, tt.wantItems)
			if !tt.wantCursor {
				require.Nil(t, page.NextCursor)
				return
			}
			require.NotNil(t, page.NextCursor)
			got, err := domain.DecodeSearchCursor(*page.NextCursor, domain.SearchFingerprint("go", false, nil))
			require.NoError(t, err)
			require.Equal(t, tt.wantOffset, got)
		})
	}
}

func TestBookmarkService_List_Search_WrongCursorIsRejected(t *testing.T) {
	f := newCreateFixture()
	other := domain.EncodeSearchCursor(5, domain.SearchFingerprint("rust", false, nil))
	notesFlipped := domain.EncodeSearchCursor(5, domain.SearchFingerprint("go", true, nil))
	live := domain.EncodeCursor(domain.Cursor{Mode: domain.ListLive, At: listBase, ID: domain.NewID()})
	trash := domain.EncodeCursor(domain.Cursor{Mode: domain.ListTrash, At: listBase, ID: domain.NewID()})

	for name, cursor := range map[string]string{
		"search cursor for another q":      other,
		"search cursor with notes flipped": notesFlipped,
		"plain-list cursor":                live,
		"trash cursor":                     trash,
		"garbage":                          "!!",
	} {
		t.Run(name, func(t *testing.T) {
			_, err := f.svc.List(context.Background(), f.user, domain.ListBookmarksInput{Query: "go", Cursor: cursor})
			require.ErrorIs(t, err, domain.ErrValidation)
			var ve *domain.ValidationError
			require.ErrorAs(t, err, &ve)
			require.Equal(t, []domain.FieldError{{Field: "cursor", Code: "invalid"}}, ve.Fields)
		})
	}
	require.Zero(t, f.store.searchCalls)

	t.Run("a search cursor sent to the plain list or the trash", func(t *testing.T) {
		s := domain.EncodeSearchCursor(5, domain.SearchFingerprint("go", false, nil))
		for _, trashed := range []bool{false, true} {
			_, err := f.svc.List(context.Background(), f.user, domain.ListBookmarksInput{Trashed: trashed, Cursor: s})
			require.ErrorIs(t, err, domain.ErrValidation)
		}
	})
}

func TestBookmarkService_List_Search_UnknownFolder(t *testing.T) {
	f := newCreateFixture()
	unknown := uuid.New()
	_, err := f.svc.List(context.Background(), f.user, domain.ListBookmarksInput{Query: "go", FolderID: &unknown})
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	require.Zero(t, f.store.searchCalls)

	_, err = f.svc.List(context.Background(), uuid.New(), domain.ListBookmarksInput{Query: "go", FolderID: &f.folderID})
	require.ErrorIs(t, err, gorm.ErrRecordNotFound, "another user's folder")
	require.Zero(t, f.store.searchCalls)
}
