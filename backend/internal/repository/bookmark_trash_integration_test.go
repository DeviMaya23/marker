//go:build integration

package repository_test

import (
	"context"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"marker/internal/domain"
	"marker/internal/repository"
	"marker/internal/testutil"
)

func TestBookmarkRepository_Trash(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	ctx := context.Background()
	b, folder := seedEditable(t, db, repo, user.ID, "quokka")
	before := userVersion(t, db, user.ID)

	require.NoError(t, repo.Trash(ctx, user.ID, b.ID))

	got, err := repo.Get(ctx, user.ID, b.ID)
	require.NoError(t, err)
	require.NotNil(t, got.DeletedAt, "deleted_at is set")
	require.Equal(t, b.Title, got.Title, "nothing else changes")
	require.Equal(t, b.Note, got.Note)
	require.Equal(t, &folder.ID, got.FolderID)
	require.Equal(t, before+1, userVersion(t, db, user.ID))

	live, err := repo.List(ctx, domain.BookmarkListQuery{UserID: user.ID, Mode: domain.ListLive, Limit: 100})
	require.NoError(t, err)
	require.NotContains(t, ids(live), b.ID, "it leaves the live list")
	trash, err := repo.List(ctx, domain.BookmarkListQuery{UserID: user.ID, Mode: domain.ListTrash, Limit: 100})
	require.NoError(t, err)
	require.NotEmpty(t, trash)
	require.Equal(t, b.ID, trash[0].ID, "it is first in the trash list")

	require.ErrorIs(t, repo.Trash(ctx, user.ID, b.ID), domain.ErrBookmarkInTrash, "a second delete")
	require.Equal(t, before+1, userVersion(t, db, user.ID), "a refused delete writes nothing")
}

func TestBookmarkRepository_Trash_ConcurrentDeletes(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	b, _ := seedEditable(t, db, repo, user.ID, "quokka")
	before := userVersion(t, db, user.ID)

	const n = 8
	errs := make([]error, n)
	var wg sync.WaitGroup
	for i := range errs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs[i] = repo.Trash(context.Background(), user.ID, b.ID)
		}()
	}
	wg.Wait()

	ok := 0
	for _, err := range errs {
		if err == nil {
			ok++
		} else {
			require.ErrorIs(t, err, domain.ErrBookmarkInTrash)
		}
	}
	require.Equal(t, 1, ok, "exactly one delete succeeds")
	require.Equal(t, before+1, userVersion(t, db, user.ID))
}

func TestBookmarkRepository_Restore(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	ctx := context.Background()
	b, _ := seedEditable(t, db, repo, user.ID, "quokka")

	_, err := repo.Restore(ctx, user.ID, b.ID)
	require.ErrorIs(t, err, domain.ErrBookmarkNotInTrash, "a live bookmark")

	require.NoError(t, repo.Trash(ctx, user.ID, b.ID))
	countBefore, err := repo.CountByUserID(ctx, user.ID)
	require.NoError(t, err)
	versionBefore := userVersion(t, db, user.ID)

	got, err := repo.Restore(ctx, user.ID, b.ID)
	require.NoError(t, err)
	require.Nil(t, got.DeletedAt)
	require.Nil(t, got.FolderID, "a bookmark that had a folder comes back at the top level")
	require.Equal(t, "quokka", got.Title)
	require.Equal(t, "first note", got.Note)

	stored, err := repo.Get(ctx, user.ID, b.ID)
	require.NoError(t, err)
	require.Nil(t, stored.DeletedAt)
	require.Nil(t, stored.FolderID)
	require.Equal(t, versionBefore+1, userVersion(t, db, user.ID))
	countAfter, err := repo.CountByUserID(ctx, user.ID)
	require.NoError(t, err)
	require.Equal(t, countBefore, countAfter, "restoring does not change the count")
}

func TestBookmarkRepository_EmptyTrash(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	alice, bob := newUser(t, db), newUser(t, db)
	ctx := context.Background()

	t.Run("an empty trash deletes nothing and writes nothing", func(t *testing.T) {
		before := userVersion(t, db, alice.ID)
		n, err := repo.EmptyTrash(ctx, alice.ID)
		require.NoError(t, err)
		require.Zero(t, n)
		require.Equal(t, before, userVersion(t, db, alice.ID))
	})

	live, _ := seedEditable(t, db, repo, alice.ID, "live")
	t1, _ := seedEditable(t, db, repo, alice.ID, "one")
	t2, _ := seedEditable(t, db, repo, alice.ID, "two")
	bobsTrashed, _ := seedEditable(t, db, repo, bob.ID, "bobs")
	for _, b := range []domain.Bookmark{t1, t2} {
		require.NoError(t, db.Create(&domain.BookmarkContent{BookmarkID: b.ID, Text: "page text"}).Error)
		require.NoError(t, repo.Trash(ctx, alice.ID, b.ID))
	}
	require.NoError(t, repo.Trash(ctx, bob.ID, bobsTrashed.ID))
	countBefore, err := repo.CountByUserID(ctx, alice.ID)
	require.NoError(t, err)
	aliceBefore, bobBefore := userVersion(t, db, alice.ID), userVersion(t, db, bob.ID)

	n, err := repo.EmptyTrash(ctx, alice.ID)
	require.NoError(t, err)
	require.EqualValues(t, 2, n)

	_, err = repo.Get(ctx, alice.ID, live.ID)
	require.NoError(t, err, "a live bookmark stays")
	_, err = repo.Get(ctx, bob.ID, bobsTrashed.ID)
	require.NoError(t, err, "another user's trashed bookmark stays")
	for _, b := range []domain.Bookmark{t1, t2} {
		_, err = repo.Get(ctx, alice.ID, b.ID)
		require.Error(t, err)
		var contents int64
		require.NoError(t, db.Model(&domain.BookmarkContent{}).Where("bookmark_id = ?", b.ID).Count(&contents).Error)
		require.Zero(t, contents, "bookmark_content goes with the bookmark")
	}
	require.Equal(t, aliceBefore+1, userVersion(t, db, alice.ID), "the version goes up once")
	require.Equal(t, bobBefore, userVersion(t, db, bob.ID))
	countAfter, err := repo.CountByUserID(ctx, alice.ID)
	require.NoError(t, err)
	require.Equal(t, countBefore-2, countAfter)
}
