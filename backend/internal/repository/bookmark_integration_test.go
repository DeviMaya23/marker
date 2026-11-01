//go:build integration

package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"marker/internal/domain"
	"marker/internal/repository"
	"marker/internal/testutil"
)

func TestBookmarkRepository_ListPendingIDs(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)

	// The shared database holds other tests' rows, so assert on membership, not equality.
	age := func(b *domain.Bookmark, d time.Duration) {
		t.Helper()
		// UpdateColumn skips GORM's automatic updated_at handling and hooks.
		require.NoError(t, db.Model(b).UpdateColumn("created_at", time.Now().Add(-d)).Error)
	}

	oldPending := newBookmark(user.ID, "https://example.com/old-pending")
	require.NoError(t, db.Create(&oldPending).Error)
	age(&oldPending, 10*time.Minute)

	oldTrashedPending := newBookmark(user.ID, "https://example.com/old-trashed-pending")
	require.NoError(t, db.Create(&oldTrashedPending).Error)
	age(&oldTrashedPending, 10*time.Minute)
	require.NoError(t, db.Model(&oldTrashedPending).Update("deleted_at", time.Now()).Error)

	freshPending := newBookmark(user.ID, "https://example.com/fresh-pending")
	require.NoError(t, db.Create(&freshPending).Error)

	oldDone := newBookmark(user.ID, "https://example.com/old-done")
	oldDone.FetchStatus = domain.FetchOK
	require.NoError(t, db.Create(&oldDone).Error)
	age(&oldDone, 10*time.Minute)

	ids, err := repo.ListPendingIDs(context.Background(), time.Now().Add(-2*time.Minute), 1000)
	require.NoError(t, err)

	require.Contains(t, ids, oldPending.ID)
	require.Contains(t, ids, oldTrashedPending.ID)
	require.NotContains(t, ids, freshPending.ID)
	require.NotContains(t, ids, oldDone.ID)
}

func TestBookmarkRepository_ListPendingIDs_RespectsLimit(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)

	for _, u := range []string{"a", "b", "c"} {
		b := newBookmark(user.ID, "https://example.com/limit-"+u)
		require.NoError(t, db.Create(&b).Error)
		require.NoError(t, db.Model(&b).UpdateColumn("created_at", time.Now().Add(-time.Hour)).Error)
	}

	ids, err := repo.ListPendingIDs(context.Background(), time.Now().Add(-2*time.Minute), 2)
	require.NoError(t, err)
	require.Len(t, ids, 2)
}
