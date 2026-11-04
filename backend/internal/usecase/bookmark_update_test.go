package usecase

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/domain"
)

type updateFixture struct {
	svc    *BookmarkService
	store  *fakeBookmarkStore
	user   uuid.UUID
	folder uuid.UUID
	b      domain.Bookmark
}

// newUpdateFixture stores one live bookmark with a title, a note and a folder.
func newUpdateFixture() *updateFixture {
	f := newCreateFixture()
	folder := f.folderID
	b := domain.Bookmark{ID: domain.NewID(), UserID: f.user, URL: "https://e.com", Title: "Old", Note: "old note", FolderID: &folder}
	f.store.bookmarks = append(f.store.bookmarks, b)
	return &updateFixture{svc: f.svc, store: f.store, user: f.user, folder: folder, b: b}
}

func (f *updateFixture) trash() {
	now := time.Now()
	f.store.bookmarks[0].DeletedAt = &now
}

func TestBookmarkService_Update_ThreeStates(t *testing.T) {
	otherFolder := uuid.New()
	tests := []struct {
		name       string
		in         domain.BookmarkUpdate
		wantTitle  string
		wantNote   string
		wantFolder *uuid.UUID
	}{
		{"note and folder absent keep their values", domain.BookmarkUpdate{Title: domain.Value("New")}, "New", "old note", nil},
		{"note null clears it", domain.BookmarkUpdate{Note: domain.Null[string]()}, "Old", "", nil},
		{"note value sets it", domain.BookmarkUpdate{Note: domain.Value("fresh")}, "Old", "fresh", nil},
		{"folder null moves to top level", domain.BookmarkUpdate{FolderID: domain.Null[uuid.UUID]()}, "Old", "old note", nil},
		{"folder value moves", domain.BookmarkUpdate{FolderID: domain.Value(otherFolder)}, "Old", "old note", &otherFolder},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := newUpdateFixture()
			f.svc.folders = fakeFolders{owned: map[uuid.UUID]uuid.UUID{f.folder: f.user, otherFolder: f.user}}

			got, err := f.svc.Update(context.Background(), f.user, f.b.ID, tc.in)
			require.NoError(t, err)

			require.Equal(t, tc.wantTitle, got.Title)
			require.Equal(t, tc.wantNote, got.Note)
			wantFolder := tc.wantFolder
			if wantFolder == nil && !tc.in.FolderID.Set {
				wantFolder = &f.folder // absent keeps the stored folder
			}
			require.Equal(t, wantFolder, got.FolderID)

			require.Len(t, f.store.updates, 1)
			require.Equal(t, tc.in, f.store.updates[0], "the store receives exactly the fields that were present")
			require.EqualValues(t, 1, f.store.versions[f.user])
		})
	}
}

func TestBookmarkService_Update_CheckOrder(t *testing.T) {
	tooLong := strings.Repeat("a", domain.MaxTitleLength+1)

	t.Run("unknown key before a too-long title", func(t *testing.T) {
		f := newUpdateFixture()
		_, err := f.svc.Update(context.Background(), f.user, f.b.ID, domain.BookmarkUpdate{
			Title: domain.Value(tooLong), UnknownKeys: []string{"url", "foo"},
		})
		var ve *domain.ValidationError
		require.ErrorAs(t, err, &ve)
		require.Equal(t, []domain.FieldError{
			{Field: "url", Code: "unknown_field"}, {Field: "foo", Code: "unknown_field"},
		}, ve.Fields)
		require.Empty(t, f.store.updates)
	})

	t.Run("too-long field on a trashed bookmark is 422, not 409", func(t *testing.T) {
		f := newUpdateFixture()
		f.trash()
		_, err := f.svc.Update(context.Background(), f.user, f.b.ID, domain.BookmarkUpdate{Title: domain.Value(tooLong)})
		require.ErrorIs(t, err, domain.ErrValidation)
	})

	t.Run("trashed with an unknown folder is 409, not 404", func(t *testing.T) {
		f := newUpdateFixture()
		f.trash()
		_, err := f.svc.Update(context.Background(), f.user, f.b.ID, domain.BookmarkUpdate{FolderID: domain.Value(uuid.New())})
		require.ErrorIs(t, err, domain.ErrBookmarkInTrash)
		require.Empty(t, f.store.updates)
	})

	t.Run("missing bookmark is not found, before the folder", func(t *testing.T) {
		f := newUpdateFixture()
		_, err := f.svc.Update(context.Background(), f.user, uuid.New(), domain.BookmarkUpdate{FolderID: domain.Value(uuid.New())})
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	})

	t.Run("another user's bookmark is not found", func(t *testing.T) {
		f := newUpdateFixture()
		_, err := f.svc.Update(context.Background(), uuid.New(), f.b.ID, domain.BookmarkUpdate{Title: domain.Value("x")})
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
		require.Empty(t, f.store.updates)
	})
}

func TestBookmarkService_Update_Lengths(t *testing.T) {
	tests := []struct {
		name       string
		title      string
		note       string
		wantFields []domain.FieldError
	}{
		{"title 300 passes", strings.Repeat("a", 300), "", nil},
		{"title 301 fails", strings.Repeat("a", 301), "", []domain.FieldError{{Field: "title", Code: "too_long"}}},
		{"note 500 passes", "", strings.Repeat("a", 500), nil},
		{"note 501 fails", "", strings.Repeat("a", 501), []domain.FieldError{{Field: "note", Code: "too_long"}}},
		{"both too long report both", strings.Repeat("a", 301), strings.Repeat("a", 501), []domain.FieldError{
			{Field: "title", Code: "too_long"}, {Field: "note", Code: "too_long"},
		}},
		{"300 multi-byte characters pass", strings.Repeat("é", 300), strings.Repeat("日", 500), nil},
		{"301 multi-byte characters fail", strings.Repeat("é", 301), "", []domain.FieldError{{Field: "title", Code: "too_long"}}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := newUpdateFixture()
			in := domain.BookmarkUpdate{}
			if tc.title != "" {
				in.Title = domain.Value(tc.title)
			}
			if tc.note != "" {
				in.Note = domain.Value(tc.note)
			}
			_, err := f.svc.Update(context.Background(), f.user, f.b.ID, in)
			if tc.wantFields == nil {
				require.NoError(t, err)
				return
			}
			var ve *domain.ValidationError
			require.ErrorAs(t, err, &ve)
			require.Equal(t, tc.wantFields, ve.Fields)
			require.Empty(t, f.store.updates)
		})
	}
}

func TestBookmarkService_Update_TitleNullIsInvalid(t *testing.T) {
	f := newUpdateFixture()
	_, err := f.svc.Update(context.Background(), f.user, f.b.ID, domain.BookmarkUpdate{Title: domain.Null[string]()})
	var ve *domain.ValidationError
	require.ErrorAs(t, err, &ve)
	require.Equal(t, []domain.FieldError{{Field: "title", Code: "invalid"}}, ve.Fields)
}

func TestBookmarkService_Update_EmptyTitleAndNoteAreStoredAsGiven(t *testing.T) {
	f := newUpdateFixture()
	got, err := f.svc.Update(context.Background(), f.user, f.b.ID, domain.BookmarkUpdate{Title: domain.Value(""), Note: domain.Value("")})
	require.NoError(t, err)
	require.Equal(t, "", got.Title)
	require.Equal(t, "", got.Note, "an empty note is stored as no note")
}

func TestBookmarkService_Update_Folder(t *testing.T) {
	t.Run("a folder that is not the caller's is not found", func(t *testing.T) {
		f := newUpdateFixture()
		other := uuid.New()
		f.svc.folders = fakeFolders{owned: map[uuid.UUID]uuid.UUID{other: uuid.New()}}
		_, err := f.svc.Update(context.Background(), f.user, f.b.ID, domain.BookmarkUpdate{FolderID: domain.Value(other)})
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
		require.Empty(t, f.store.updates)
	})

	t.Run("a folder that disappears at write time is not found", func(t *testing.T) {
		f := newUpdateFixture()
		f.store.updateErr = gorm.ErrRecordNotFound // what the store reports for the foreign key error
		_, err := f.svc.Update(context.Background(), f.user, f.b.ID, domain.BookmarkUpdate{FolderID: domain.Value(f.folder)})
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
		require.Equal(t, f.b, f.store.bookmarks[0], "nothing was stored")
	})
}

func TestBookmarkService_Update_Empty(t *testing.T) {
	t.Run("writes nothing and returns the bookmark", func(t *testing.T) {
		f := newUpdateFixture()
		got, err := f.svc.Update(context.Background(), f.user, f.b.ID, domain.BookmarkUpdate{})
		require.NoError(t, err)
		require.Equal(t, f.b, got)
		require.Empty(t, f.store.updates)
		require.Zero(t, f.store.versions[f.user])
	})

	t.Run("on a trashed bookmark is 409", func(t *testing.T) {
		f := newUpdateFixture()
		f.trash()
		_, err := f.svc.Update(context.Background(), f.user, f.b.ID, domain.BookmarkUpdate{})
		require.ErrorIs(t, err, domain.ErrBookmarkInTrash)
	})
}
