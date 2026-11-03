package usecase

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

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
