//go:build integration

package repository_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/domain"
	"marker/internal/repository"
	"marker/internal/testutil"
)

func TestUserRepository_Version(t *testing.T) {
	ctx := context.Background()
	db := testutil.NewDB(t)
	users := repository.NewUserRepository(db)
	bookmarks := repository.NewBookmarkRepository(db)
	folders := repository.NewFolderRepository(db)

	newUserID := func(t *testing.T) uuid.UUID {
		t.Helper()
		u, err := users.FindOrCreateUserByIdpID(ctx, "idp|"+domain.NewID().String())
		require.NoError(t, err)
		return u.ID
	}
	version := func(t *testing.T, id uuid.UUID) int64 {
		t.Helper()
		v, err := users.Version(ctx, id)
		require.NoError(t, err)
		return v
	}
	saveBookmark := func(t *testing.T, userID uuid.UUID) domain.Bookmark {
		t.Helper()
		b := newBookmark(userID, "https://example.com/"+domain.NewID().String())
		require.NoError(t, bookmarks.Create(ctx, b))
		return b
	}
	saveFolder := func(t *testing.T, userID uuid.UUID) domain.Folder {
		t.Helper()
		f := newFolder(userID, nil, "F-"+domain.NewID().String(), 1)
		_, err := folders.Create(ctx, f)
		require.NoError(t, err)
		return f
	}

	t.Run("new user is zero", func(t *testing.T) {
		require.Equal(t, int64(0), version(t, newUserID(t)))
	})

	writes := []struct {
		name  string
		setup func(t *testing.T, userID uuid.UUID) func() error
	}{
		{"bookmark create", func(t *testing.T, u uuid.UUID) func() error {
			b := newBookmark(u, "https://example.com/"+domain.NewID().String())
			return func() error { return bookmarks.Create(ctx, b) }
		}},
		{"bookmark update", func(t *testing.T, u uuid.UUID) func() error {
			b := saveBookmark(t, u)
			return func() error {
				_, err := bookmarks.Update(ctx, u, b.ID, domain.BookmarkUpdate{Note: domain.Value("a note")})
				return err
			}
		}},
		{"bookmark trash", func(t *testing.T, u uuid.UUID) func() error {
			b := saveBookmark(t, u)
			return func() error { return bookmarks.Trash(ctx, u, b.ID) }
		}},
		{"bookmark restore", func(t *testing.T, u uuid.UUID) func() error {
			b := saveBookmark(t, u)
			require.NoError(t, bookmarks.Trash(ctx, u, b.ID))
			return func() error { _, err := bookmarks.Restore(ctx, u, b.ID); return err }
		}},
		{"empty trash with a bookmark in it", func(t *testing.T, u uuid.UUID) func() error {
			b := saveBookmark(t, u)
			require.NoError(t, bookmarks.Trash(ctx, u, b.ID))
			return func() error {
				n, err := bookmarks.EmptyTrash(ctx, u)
				require.Positive(t, n)
				return err
			}
		}},
		{"folder create", func(t *testing.T, u uuid.UUID) func() error {
			f := newFolder(u, nil, "F-"+domain.NewID().String(), 1)
			return func() error { _, err := folders.Create(ctx, f); return err }
		}},
		{"folder rename", func(t *testing.T, u uuid.UUID) func() error {
			f := saveFolder(t, u)
			return func() error {
				_, err := folders.Update(ctx, u, f.ID, domain.FolderUpdate{Name: domain.Value("Renamed-" + domain.NewID().String())})
				return err
			}
		}},
		{"folder delete", func(t *testing.T, u uuid.UUID) func() error {
			f := saveFolder(t, u)
			return func() error { _, err := folders.Delete(ctx, u, f.ID); return err }
		}},
		{"RecordFetchSuccess", func(t *testing.T, u uuid.UUID) func() error {
			b := saveBookmark(t, u)
			return func() error {
				return bookmarks.RecordFetchSuccess(ctx, b, domain.FetchResult{Title: "T", Text: "text"})
			}
		}},
		{"RecordFetchFailure", func(t *testing.T, u uuid.UUID) func() error {
			b := saveBookmark(t, u)
			return func() error { return bookmarks.RecordFetchFailure(ctx, b) }
		}},
	}
	for _, w := range writes {
		t.Run("increments by one: "+w.name, func(t *testing.T) {
			u := newUserID(t)
			write := w.setup(t, u)
			before := version(t, u)

			require.NoError(t, write())

			require.Equal(t, before+1, version(t, u))
		})
	}

	t.Run("no increment: empty trash with nothing in it", func(t *testing.T) {
		u := newUserID(t)
		saveBookmark(t, u) // live, not in the trash
		before := version(t, u)

		n, err := bookmarks.EmptyTrash(ctx, u)

		require.NoError(t, err)
		require.Zero(t, n)
		require.Equal(t, before, version(t, u))
	})

	t.Run("no increment: a refused write", func(t *testing.T) {
		u := newUserID(t)
		b := saveBookmark(t, u)
		before := version(t, u)

		dup := newBookmark(u, b.NormalizedURL)
		require.ErrorIs(t, bookmarks.Create(ctx, dup), domain.ErrDuplicateBookmark)

		require.Equal(t, before, version(t, u))
	})

	t.Run("isolation: another user's write does not change mine", func(t *testing.T) {
		a, b := newUserID(t), newUserID(t)
		beforeA, beforeB := version(t, a), version(t, b)

		saveBookmark(t, b)

		require.Equal(t, beforeA, version(t, a))
		require.Equal(t, beforeB+1, version(t, b))
	})

	t.Run("unknown user is not found", func(t *testing.T) {
		_, err := users.Version(ctx, uuid.New())
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	})

	t.Run("reading does not write", func(t *testing.T) {
		u := newUserID(t)
		saveBookmark(t, u)

		first := version(t, u)
		second := version(t, u)

		require.Equal(t, first, second)
	})
}
