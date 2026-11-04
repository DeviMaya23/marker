//go:build integration

package repository_test

import (
	"context"
	"errors"
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

	t.Run("no increment: folder update with no fields", func(t *testing.T) {
		u := newUserID(t)
		f := saveFolder(t, u)
		before := version(t, u)

		_, err := folders.Update(ctx, u, f.ID, domain.FolderUpdate{})

		require.NoError(t, err)
		require.Equal(t, before, version(t, u))
	})

	t.Run("concurrent writes each count once, and another user polling is unaffected", func(t *testing.T) {
		a, b := newUserID(t), newUserID(t)
		beforeA, beforeB := version(t, a), version(t, b)
		const writers = 12
		var wg sync.WaitGroup
		errs := make(chan error, writers)
		for range writers {
			wg.Add(1)
			go func() {
				defer wg.Done()
				errs <- bookmarks.Create(ctx, newBookmark(a, "https://example.com/"+domain.NewID().String()))
			}()
		}
		for range 20 { // user B polls while A writes
			require.Equal(t, beforeB, version(t, b))
		}
		wg.Wait()
		close(errs)
		for err := range errs {
			require.NoError(t, err)
		}

		require.Equal(t, beforeA+writers, version(t, a))
		require.Equal(t, beforeB, version(t, b))
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

// seededAccount is everything one user owns, for the delete tests.
type seededAccount struct {
	user        domain.User
	bookmarkIDs []uuid.UUID
}

// seedAccount gives a user two sessions, a folder with a child, a live bookmark in the
// child, a trashed bookmark, and a bookmark with saved content and a favicon.
func seedAccount(t *testing.T, db *gorm.DB) seededAccount {
	t.Helper()
	user := newUser(t, db)
	now := time.Now()
	require.NoError(t, db.Create(&[]domain.Session{
		newSession(user, "a-"+uuid.NewString(), now),
		newSession(user, "b-"+uuid.NewString(), now),
	}).Error)

	parent := newFolder(user.ID, nil, "Parent", 1)
	child := newFolder(user.ID, &parent.ID, "Child", 2)
	require.NoError(t, db.Create(&parent).Error)
	require.NoError(t, db.Create(&child).Error)

	live := newBookmark(user.ID, "https://live.example.com/"+uuid.NewString())
	live.FolderID = &child.ID
	trashed := newBookmark(user.ID, "https://trash.example.com/"+uuid.NewString())
	deletedAt := now
	trashed.DeletedAt = &deletedAt
	require.NoError(t, db.Create(&live).Error)
	require.NoError(t, db.Create(&trashed).Error)

	storeIcon(t, db, user.ID, "icon.example.com", "image/png", []byte{1, 2, 3})
	require.NoError(t, db.Create(&domain.BookmarkContent{BookmarkID: live.ID, Text: "saved text"}).Error)

	var ids []uuid.UUID
	require.NoError(t, db.Model(&domain.Bookmark{}).Where("user_id = ?", user.ID).Pluck("id", &ids).Error)
	require.Len(t, ids, 3)
	return seededAccount{user: user, bookmarkIDs: ids}
}

func countFor(t *testing.T, db *gorm.DB, table, column string, id any) int64 {
	t.Helper()
	var n int64
	require.NoError(t, db.Table(table).Where(column+" = ?", id).Count(&n).Error)
	return n
}

func countContent(t *testing.T, db *gorm.DB, ids []uuid.UUID) int64 {
	t.Helper()
	var n int64
	require.NoError(t, db.Table("bookmark_content").Where("bookmark_id IN ?", ids).Count(&n).Error)
	return n
}

func TestUserRepository_DeleteUser_RemovesEverything(t *testing.T) {
	db := testutil.NewDB(t)
	a := seedAccount(t, db)
	require.EqualValues(t, 3, countFor(t, db, "bookmarks", "user_id", a.user.ID), "seed sanity")
	require.EqualValues(t, 1, countFor(t, db, "favicons", "user_id", a.user.ID), "seed sanity")
	require.EqualValues(t, 2, countContent(t, db, a.bookmarkIDs), "seed sanity")

	require.NoError(t, repository.NewUserRepository(db).DeleteUser(context.Background(), a.user.ID))

	require.Zero(t, countFor(t, db, "users", "id", a.user.ID), "users")
	require.Zero(t, countFor(t, db, "sessions", "user_id", a.user.ID), "sessions")
	require.Zero(t, countFor(t, db, "folders", "user_id", a.user.ID), "folders")
	require.Zero(t, countFor(t, db, "bookmarks", "user_id", a.user.ID), "bookmarks")
	require.Zero(t, countFor(t, db, "favicons", "user_id", a.user.ID), "favicons")
	require.Zero(t, countContent(t, db, a.bookmarkIDs), "bookmark_content")
}

func TestUserRepository_DeleteUser_LeavesOtherUsersAlone(t *testing.T) {
	db := testutil.NewDB(t)
	gone := seedAccount(t, db)
	kept := seedAccount(t, db)
	var before domain.User
	require.NoError(t, db.First(&before, "id = ?", kept.user.ID).Error)

	require.NoError(t, repository.NewUserRepository(db).DeleteUser(context.Background(), gone.user.ID))

	var after domain.User
	require.NoError(t, db.First(&after, "id = ?", kept.user.ID).Error)
	require.Equal(t, before.Version, after.Version, "users.version")
	require.EqualValues(t, 2, countFor(t, db, "sessions", "user_id", kept.user.ID), "sessions")
	require.EqualValues(t, 2, countFor(t, db, "folders", "user_id", kept.user.ID), "folders")
	require.EqualValues(t, 3, countFor(t, db, "bookmarks", "user_id", kept.user.ID), "bookmarks")
	require.EqualValues(t, 1, countFor(t, db, "favicons", "user_id", kept.user.ID), "favicons")
	require.EqualValues(t, 2, countContent(t, db, kept.bookmarkIDs), "bookmark_content")
}

func TestUserRepository_DeleteUser_MissingUser(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	require.ErrorIs(t, repo.DeleteUser(ctx, uuid.New()), gorm.ErrRecordNotFound)

	u := newUser(t, db)
	require.NoError(t, repo.DeleteUser(ctx, u.ID))
	require.ErrorIs(t, repo.DeleteUser(ctx, u.ID), gorm.ErrRecordNotFound, "second delete")
}

func TestUserRepository_DeleteUser_WaitsForTheUserLock(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewUserRepository(db)
	u := newUser(t, db)

	holder := db.Begin()
	require.NoError(t, holder.Error)
	var held []uuid.UUID
	require.NoError(t, holder.Raw(`SELECT id FROM users WHERE id = ? FOR UPDATE`, u.ID).Scan(&held).Error)
	require.Len(t, held, 1)

	done := make(chan error, 1)
	go func() { done <- repo.DeleteUser(context.Background(), u.ID) }()

	deadline := time.Now().Add(5 * time.Second)
	for {
		var waiting int64
		require.NoError(t, db.Raw(`SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'`).Scan(&waiting).Error)
		if waiting > 0 {
			break
		}
		if time.Now().After(deadline) {
			_ = holder.Rollback()
			t.Fatal("DeleteUser never waited on the user's lock")
		}
		time.Sleep(10 * time.Millisecond)
	}
	select {
	case err := <-done:
		t.Fatalf("DeleteUser returned while the lock was held: %v", err)
	default:
	}

	require.NoError(t, holder.Commit().Error)
	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(5 * time.Second):
		t.Fatal("DeleteUser did not finish after the lock was released")
	}
	require.Zero(t, countFor(t, db, "users", "id", u.ID))
}

func TestUserRepository_DeleteUser_ConcurrentDeletes(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewUserRepository(db)
	a := seedAccount(t, db)

	errs := make([]error, 2)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := range errs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			errs[i] = repo.DeleteUser(context.Background(), a.user.ID)
		}()
	}
	close(start)
	wg.Wait()

	var ok, notFound int
	for _, err := range errs {
		switch {
		case err == nil:
			ok++
		case errors.Is(err, gorm.ErrRecordNotFound):
			notFound++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}
	require.Equal(t, 1, ok)
	require.Equal(t, 1, notFound)
}

func TestUserRepository_DeleteUser_RacingSave(t *testing.T) {
	db := testutil.NewDB(t)
	users := repository.NewUserRepository(db)
	bookmarks := repository.NewBookmarkRepository(db)

	for round := 0; round < 25; round++ {
		u := newUser(t, db)
		var createErr, deleteErr error
		var wg sync.WaitGroup
		start := make(chan struct{})
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			createErr = bookmarks.Create(context.Background(), newBookmark(u.ID, "https://race.example.com/"+uuid.NewString()))
		}()
		go func() {
			defer wg.Done()
			<-start
			deleteErr = users.DeleteUser(context.Background(), u.ID)
		}()
		close(start)
		wg.Wait()

		require.NoError(t, deleteErr, "round %d", round)
		if createErr != nil {
			require.ErrorIs(t, createErr, gorm.ErrRecordNotFound, "round %d", round)
		}
		require.Zero(t, countFor(t, db, "bookmarks", "user_id", u.ID), "round %d", round)
	}
}
