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

func TestBookmarkService_Delete(t *testing.T) {
	t.Run("a live bookmark goes to the trash and keeps its fields", func(t *testing.T) {
		f := newUpdateFixture()
		require.NoError(t, f.svc.Delete(context.Background(), f.user, f.b.ID))
		got := f.store.bookmarks[0]
		require.NotNil(t, got.DeletedAt)
		require.Equal(t, f.b.Title, got.Title)
		require.Equal(t, f.b.Note, got.Note)
		require.Equal(t, f.b.FolderID, got.FolderID)
	})
	t.Run("unknown id is not found", func(t *testing.T) {
		f := newUpdateFixture()
		require.ErrorIs(t, f.svc.Delete(context.Background(), f.user, uuid.New()), gorm.ErrRecordNotFound)
	})
	t.Run("another user's bookmark is not found", func(t *testing.T) {
		f := newUpdateFixture()
		require.ErrorIs(t, f.svc.Delete(context.Background(), uuid.New(), f.b.ID), gorm.ErrRecordNotFound)
		require.Nil(t, f.store.bookmarks[0].DeletedAt)
	})
	t.Run("a trashed bookmark is in the trash", func(t *testing.T) {
		f := newUpdateFixture()
		f.trash()
		require.ErrorIs(t, f.svc.Delete(context.Background(), f.user, f.b.ID), domain.ErrBookmarkInTrash)
		require.Zero(t, f.store.versions[f.user])
	})
}

func TestBookmarkService_Restore(t *testing.T) {
	t.Run("a trashed bookmark returns at the top level", func(t *testing.T) {
		f := newUpdateFixture()
		f.trash()
		got, err := f.svc.Restore(context.Background(), f.user, f.b.ID)
		require.NoError(t, err)
		require.Nil(t, got.DeletedAt)
		require.Nil(t, got.FolderID)
		require.Equal(t, f.b.Title, got.Title)
	})
	t.Run("unknown id is not found", func(t *testing.T) {
		f := newUpdateFixture()
		_, err := f.svc.Restore(context.Background(), f.user, uuid.New())
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	})
	t.Run("a live bookmark is not in the trash", func(t *testing.T) {
		f := newUpdateFixture()
		_, err := f.svc.Restore(context.Background(), f.user, f.b.ID)
		require.ErrorIs(t, err, domain.ErrBookmarkNotInTrash)
		require.Zero(t, f.store.versions[f.user])
	})
	t.Run("restoring at the cap still works", func(t *testing.T) {
		f := newUpdateFixture()
		f.trash()
		for i := 1; i < domain.MaxBookmarks; i++ {
			f.store.bookmarks = append(f.store.bookmarks, domain.Bookmark{ID: domain.NewID(), UserID: f.user})
		}
		_, err := f.svc.Restore(context.Background(), f.user, f.b.ID)
		require.NoError(t, err)
	})
}

func TestBookmarkService_EmptyTrash(t *testing.T) {
	t.Run("returns the store's count", func(t *testing.T) {
		f := newUpdateFixture()
		now := time.Now()
		for i := 0; i < 2; i++ {
			f.store.bookmarks = append(f.store.bookmarks, domain.Bookmark{ID: domain.NewID(), UserID: f.user, DeletedAt: &now})
		}
		n, err := f.svc.EmptyTrash(context.Background(), f.user)
		require.NoError(t, err)
		require.EqualValues(t, 2, n)
		require.Len(t, f.store.bookmarks, 1, "the live bookmark stays")
	})
	t.Run("an empty trash is zero, not an error", func(t *testing.T) {
		f := newUpdateFixture()
		n, err := f.svc.EmptyTrash(context.Background(), f.user)
		require.NoError(t, err)
		require.Zero(t, n)
	})
}
