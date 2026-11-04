//go:build integration

package repository_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/domain"
	"marker/internal/repository"
	"marker/internal/testutil"
)

// vectorHits counts the bookmark's rows matching a full-text query on search_vector.
func vectorHits(t *testing.T, db *gorm.DB, id uuid.UUID, word string) int64 {
	t.Helper()
	var n int64
	require.NoError(t, db.Raw(`SELECT count(*) FROM bookmarks WHERE id = ? AND search_vector @@ plainto_tsquery('english', ?)`, id, word).Scan(&n).Error)
	return n
}

// seedEditable stores a live bookmark through Create (so it has a search vector) with a
// title, a note and a folder, and returns it as stored.
func seedEditable(t *testing.T, db *gorm.DB, repo *repository.BookmarkRepository, userID uuid.UUID, title string) (domain.Bookmark, domain.Folder) {
	t.Helper()
	folder := newFolder(userID, nil, "F-"+domain.NewID().String(), 1)
	require.NoError(t, db.Create(&folder).Error)
	b := newBookmark(userID, "https://example.com/"+domain.NewID().String())
	b.Title, b.FolderID = title, &folder.ID
	require.NoError(t, repo.Create(context.Background(), b))
	require.NoError(t, db.Model(&domain.Bookmark{}).Where("id = ?", b.ID).UpdateColumn("note", "first note").Error)
	got, err := repo.Get(context.Background(), userID, b.ID)
	require.NoError(t, err)
	return got, folder
}

func TestBookmarkRepository_Update_Fields(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	ctx := context.Background()

	t.Run("title, note and folder are written, version +1, updated_at moves", func(t *testing.T) {
		b, _ := seedEditable(t, db, repo, user.ID, "quokka")
		target := newFolder(user.ID, nil, "Target-"+domain.NewID().String(), 1)
		require.NoError(t, db.Create(&target).Error)
		before := userVersion(t, db, user.ID)
		time.Sleep(5 * time.Millisecond)

		got, err := repo.Update(ctx, user.ID, b.ID, domain.BookmarkUpdate{
			Title: domain.Value("wombat"), Note: domain.Value("second note"), FolderID: domain.Value(target.ID),
		})
		require.NoError(t, err)
		require.Equal(t, "wombat", got.Title)
		require.Equal(t, "second note", got.Note)
		require.Equal(t, &target.ID, got.FolderID)
		require.True(t, got.UpdatedAt.After(b.UpdatedAt), "updated_at changes")
		require.Equal(t, before+1, userVersion(t, db, user.ID))
	})

	t.Run("absent fields are not touched", func(t *testing.T) {
		b, folder := seedEditable(t, db, repo, user.ID, "quokka")
		got, err := repo.Update(ctx, user.ID, b.ID, domain.BookmarkUpdate{Title: domain.Value("only title")})
		require.NoError(t, err)
		require.Equal(t, "first note", got.Note)
		require.Equal(t, &folder.ID, got.FolderID)

		got, err = repo.Update(ctx, user.ID, b.ID, domain.BookmarkUpdate{Note: domain.Value("only note")})
		require.NoError(t, err)
		require.Equal(t, "only title", got.Title)
		require.Equal(t, &folder.ID, got.FolderID)
	})

	t.Run("null clears the note and the folder", func(t *testing.T) {
		b, _ := seedEditable(t, db, repo, user.ID, "quokka")
		got, err := repo.Update(ctx, user.ID, b.ID, domain.BookmarkUpdate{Note: domain.Null[string](), FolderID: domain.Null[uuid.UUID]()})
		require.NoError(t, err)
		require.Equal(t, "", got.Note)
		require.Nil(t, got.FolderID)
		require.Equal(t, "quokka", got.Title)
	})

	t.Run("a whitespace note and an empty title are stored as given", func(t *testing.T) {
		b, _ := seedEditable(t, db, repo, user.ID, "quokka")
		got, err := repo.Update(ctx, user.ID, b.ID, domain.BookmarkUpdate{Note: domain.Value("   "), Title: domain.Value("")})
		require.NoError(t, err)
		require.Equal(t, "   ", got.Note)
		require.Equal(t, "", got.Title)
	})
}

func TestBookmarkRepository_Update_SearchVector(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	ctx := context.Background()
	b, _ := seedEditable(t, db, repo, user.ID, "quokka")
	require.EqualValues(t, 1, vectorHits(t, db, b.ID, "quokka"))

	_, err := repo.Update(ctx, user.ID, b.ID, domain.BookmarkUpdate{Title: domain.Value("pangolin")})
	require.NoError(t, err)
	require.EqualValues(t, 1, vectorHits(t, db, b.ID, "pangolin"), "found on the new title")
	require.EqualValues(t, 0, vectorHits(t, db, b.ID, "quokka"), "no longer found on the old title")

	_, err = repo.Update(ctx, user.ID, b.ID, domain.BookmarkUpdate{Note: domain.Value("wombat")})
	require.NoError(t, err)
	require.EqualValues(t, 1, vectorHits(t, db, b.ID, "pangolin"), "a note-only change leaves the vector alone")
	require.EqualValues(t, 0, vectorHits(t, db, b.ID, "wombat"), "the note is not in the vector")
}

func TestBookmarkRepository_Update_Trashed(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	b, folder := seedEditable(t, db, repo, user.ID, "quokka")
	require.NoError(t, repo.Trash(context.Background(), user.ID, b.ID))
	before := userVersion(t, db, user.ID)
	trashed, err := repo.Get(context.Background(), user.ID, b.ID)
	require.NoError(t, err)

	_, err = repo.Update(context.Background(), user.ID, b.ID, domain.BookmarkUpdate{Title: domain.Value("changed"), Note: domain.Null[string](), FolderID: domain.Null[uuid.UUID]()})
	require.ErrorIs(t, err, domain.ErrBookmarkInTrash)

	after, err := repo.Get(context.Background(), user.ID, b.ID)
	require.NoError(t, err)
	require.Equal(t, trashed, after, "the row is unchanged, updated_at included")
	require.Equal(t, "quokka", after.Title)
	require.Equal(t, &folder.ID, after.FolderID)
	require.Equal(t, before, userVersion(t, db, user.ID))
	require.EqualValues(t, 1, vectorHits(t, db, b.ID, "quokka"))
}

func TestBookmarkRepository_Update_FolderNotFound(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	alice, bob := newUser(t, db), newUser(t, db)
	b, folder := seedEditable(t, db, repo, alice.ID, "quokka")
	bobsFolder := newFolder(bob.ID, nil, "Bob-"+domain.NewID().String(), 1)
	require.NoError(t, db.Create(&bobsFolder).Error)
	before := userVersion(t, db, alice.ID)

	for name, fid := range map[string]uuid.UUID{"another user's folder": bobsFolder.ID, "a folder that does not exist": uuid.New()} {
		t.Run(name, func(t *testing.T) {
			_, err := repo.Update(context.Background(), alice.ID, b.ID, domain.BookmarkUpdate{Title: domain.Value("changed"), FolderID: domain.Value(fid)})
			require.ErrorIs(t, err, gorm.ErrRecordNotFound)
			got, err := repo.Get(context.Background(), alice.ID, b.ID)
			require.NoError(t, err)
			require.Equal(t, "quokka", got.Title, "nothing was written")
			require.Equal(t, &folder.ID, got.FolderID)
			require.Equal(t, before, userVersion(t, db, alice.ID))
		})
	}
}

func TestBookmarkRepository_Mutations_OtherUser(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	alice, bob := newUser(t, db), newUser(t, db)
	ctx := context.Background()
	live, _ := seedEditable(t, db, repo, alice.ID, "quokka")
	trashed, _ := seedEditable(t, db, repo, alice.ID, "wombat")
	require.NoError(t, repo.Trash(ctx, alice.ID, trashed.ID))
	aliceBefore, bobBefore := userVersion(t, db, alice.ID), userVersion(t, db, bob.ID)

	_, err := repo.Update(ctx, bob.ID, live.ID, domain.BookmarkUpdate{Title: domain.Value("hijack")})
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	require.ErrorIs(t, repo.Trash(ctx, bob.ID, live.ID), gorm.ErrRecordNotFound)
	_, err = repo.Restore(ctx, bob.ID, trashed.ID)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)

	gotLive, err := repo.Get(ctx, alice.ID, live.ID)
	require.NoError(t, err)
	require.Equal(t, live, gotLive)
	gotTrashed, err := repo.Get(ctx, alice.ID, trashed.ID)
	require.NoError(t, err)
	require.NotNil(t, gotTrashed.DeletedAt, "still trashed")
	require.Equal(t, aliceBefore, userVersion(t, db, alice.ID))
	require.Equal(t, bobBefore, userVersion(t, db, bob.ID))

	// An unknown id answers the same way.
	_, err = repo.Update(ctx, alice.ID, uuid.New(), domain.BookmarkUpdate{Title: domain.Value("x")})
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
}

// An update racing with a delete: whichever order the database picks, a trashed row is
// never written and users.version moves once per write that happened.
func TestBookmarkRepository_Update_RacesWithDelete(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	ctx := context.Background()

	for i := 0; i < 20; i++ {
		b, _ := seedEditable(t, db, repo, user.ID, "quokka")
		before := userVersion(t, db, user.ID)

		var updErr, delErr error
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			_, updErr = repo.Update(ctx, user.ID, b.ID, domain.BookmarkUpdate{Title: domain.Value("pangolin")})
		}()
		go func() {
			defer wg.Done()
			delErr = repo.Trash(ctx, user.ID, b.ID)
		}()
		wg.Wait()

		require.NoError(t, delErr, "the delete always succeeds: the update never trashes")
		got, err := repo.Get(ctx, user.ID, b.ID)
		require.NoError(t, err)
		require.NotNil(t, got.DeletedAt)
		if updErr == nil {
			require.Equal(t, "pangolin", got.Title)
			require.Equal(t, before+2, userVersion(t, db, user.ID))
		} else {
			require.ErrorIs(t, updErr, domain.ErrBookmarkInTrash)
			require.Equal(t, "quokka", got.Title, "a trashed row is not written")
			require.Equal(t, before+1, userVersion(t, db, user.ID))
		}
	}
}

// holdRow locks one bookmark row in a transaction of its own, and returns the function
// that releases it.
func holdRow(t *testing.T, db *gorm.DB, id uuid.UUID) (release func()) {
	t.Helper()
	tx := db.Begin()
	require.NoError(t, tx.Error)
	require.NoError(t, tx.Exec(`SELECT id FROM bookmarks WHERE id = ? FOR UPDATE`, id).Error)
	released := false
	release = func() {
		if !released {
			released = true
			require.NoError(t, tx.Rollback().Error)
		}
	}
	t.Cleanup(release)
	return release
}

// TestWritesTakeTheUserLockFirst: with a bookmark row held by someone else, each write
// has already locked the user's row while it waits for the bookmark. That is the lock
// order that keeps a bookmark write and a folder delete from deadlocking.
func TestWritesTakeTheUserLockFirst(t *testing.T) {
	ctx := context.Background()
	tests := []struct {
		name string
		// seed makes the bookmark the operation targets and returns the operation.
		seed func(t *testing.T, db *gorm.DB, repo *repository.BookmarkRepository, user domain.User) (domain.Bookmark, func() error)
	}{
		{"Update", func(t *testing.T, db *gorm.DB, repo *repository.BookmarkRepository, u domain.User) (domain.Bookmark, func() error) {
			b, _ := seedEditable(t, db, repo, u.ID, "quokka")
			return b, func() error {
				_, err := repo.Update(ctx, u.ID, b.ID, domain.BookmarkUpdate{Note: domain.Value("n")})
				return err
			}
		}},
		{"Trash", func(t *testing.T, db *gorm.DB, repo *repository.BookmarkRepository, u domain.User) (domain.Bookmark, func() error) {
			b, _ := seedEditable(t, db, repo, u.ID, "quokka")
			return b, func() error { return repo.Trash(ctx, u.ID, b.ID) }
		}},
		{"Restore", func(t *testing.T, db *gorm.DB, repo *repository.BookmarkRepository, u domain.User) (domain.Bookmark, func() error) {
			b, _ := seedEditable(t, db, repo, u.ID, "quokka")
			require.NoError(t, repo.Trash(ctx, u.ID, b.ID))
			return b, func() error { _, err := repo.Restore(ctx, u.ID, b.ID); return err }
		}},
		{"EmptyTrash", func(t *testing.T, db *gorm.DB, repo *repository.BookmarkRepository, u domain.User) (domain.Bookmark, func() error) {
			b, _ := seedEditable(t, db, repo, u.ID, "quokka")
			require.NoError(t, repo.Trash(ctx, u.ID, b.ID))
			return b, func() error { _, err := repo.EmptyTrash(ctx, u.ID); return err }
		}},
		{"RecordFetchSuccess", func(t *testing.T, db *gorm.DB, repo *repository.BookmarkRepository, u domain.User) (domain.Bookmark, func() error) {
			b := newBookmark(u.ID, "https://lock.example.com/"+domain.NewID().String())
			require.NoError(t, db.Create(&b).Error)
			return b, func() error {
				return repo.RecordFetchSuccess(ctx, b, domain.FetchResult{Title: "T", Text: "x"})
			}
		}},
		{"RecordFetchFailure", func(t *testing.T, db *gorm.DB, repo *repository.BookmarkRepository, u domain.User) (domain.Bookmark, func() error) {
			b := newBookmark(u.ID, "https://lock.example.com/"+domain.NewID().String())
			require.NoError(t, db.Create(&b).Error)
			return b, func() error { return repo.RecordFetchFailure(ctx, b) }
		}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			db := testutil.NewDB(t)
			repo := repository.NewBookmarkRepository(db)
			user := newUser(t, db)
			b, op := tc.seed(t, db, repo, user)
			before := userVersion(t, db, user.ID)

			release := holdRow(t, db, b.ID)
			done := make(chan error, 1)
			go func() { done <- op() }()

			select {
			case err := <-done:
				t.Fatalf("the operation finished while its bookmark row was held: %v", err)
			case <-time.After(300 * time.Millisecond):
			}

			// A third connection: the user's row must already be locked by the operation.
			err := db.Transaction(func(tx *gorm.DB) error {
				return tx.Exec(`SELECT id FROM users WHERE id = ? FOR UPDATE NOWAIT`, user.ID).Error
			})
			requirePgCode(t, err, "55P03") // lock_not_available

			release()
			select {
			case err := <-done:
				require.NoError(t, err)
			case <-time.After(10 * time.Second):
				t.Fatal("the operation did not finish after the row was released")
			}
			require.Equal(t, before+1, userVersion(t, db, user.ID), "one real write, one version increment")
		})
	}
}
