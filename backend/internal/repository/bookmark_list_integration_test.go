//go:build integration

package repository_test

import (
	"bytes"
	"context"
	"log"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"marker/internal/domain"
	"marker/internal/repository"
	"marker/internal/testutil"
)

// listTestBase is a round second; the tests add microseconds to it.
var listTestBase = time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

// seedList stores a bookmark for the user. at is its created_at; trashedAt, if not nil,
// is its deleted_at.
func seedList(t *testing.T, db *gorm.DB, userID uuid.UUID, at time.Time, trashedAt *time.Time) domain.Bookmark {
	t.Helper()
	b := newBookmark(userID, "https://example.com/"+domain.NewID().String())
	b.CreatedAt, b.DeletedAt = at, trashedAt
	require.NoError(t, db.Create(&b).Error)
	return b
}

func pagePtr(at time.Time) *time.Time { return &at }

// listPages pages through one list the way the usecase does: ask for limit+1, keep
// limit, continue strictly after the last kept row. It stops when a page is the last.
func listPages(t *testing.T, repo *repository.BookmarkRepository, userID uuid.UUID, mode domain.ListMode, limit int) [][]domain.Bookmark {
	t.Helper()
	var pages [][]domain.Bookmark
	var after *domain.Cursor
	for len(pages) < 1000 {
		rows, err := repo.List(context.Background(), domain.BookmarkListQuery{UserID: userID, Mode: mode, After: after, Limit: limit + 1})
		require.NoError(t, err)
		if len(rows) <= limit {
			return append(pages, rows)
		}
		rows = rows[:limit]
		pages = append(pages, rows)
		last := rows[limit-1]
		at := last.CreatedAt
		if mode == domain.ListTrash {
			at = *last.DeletedAt
		}
		after = &domain.Cursor{Mode: mode, At: at, ID: last.ID}
	}
	require.Fail(t, "paging did not end")
	return nil
}

func flatten(pages [][]domain.Bookmark) []domain.Bookmark {
	var all []domain.Bookmark
	for _, p := range pages {
		all = append(all, p...)
	}
	return all
}

func ids(bs []domain.Bookmark) []uuid.UUID {
	out := make([]uuid.UUID, len(bs))
	for i, b := range bs {
		out[i] = b.ID
	}
	return out
}

func sizes(pages [][]domain.Bookmark) []int {
	out := make([]int, len(pages))
	for i, p := range pages {
		out[i] = len(p)
	}
	return out
}

func TestBookmarkRepository_List_LiveNewestFirstWithoutTrashed(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)

	oldest := seedList(t, db, user.ID, listTestBase, nil)
	newest := seedList(t, db, user.ID, listTestBase.Add(2*time.Hour), nil)
	middle := seedList(t, db, user.ID, listTestBase.Add(time.Hour), nil)
	// Trashed bookmarks are not in the live list, however new they are.
	seedList(t, db, user.ID, listTestBase.Add(3*time.Hour), pagePtr(listTestBase.Add(4*time.Hour)))

	pages := listPages(t, repo, user.ID, domain.ListLive, 50)
	require.Equal(t, []uuid.UUID{newest.ID, middle.ID, oldest.ID}, ids(flatten(pages)))
	for _, b := range flatten(pages) {
		require.Nil(t, b.DeletedAt)
		require.Equal(t, user.ID, b.UserID)
	}
}

func TestBookmarkRepository_List_EmptyForAUserWithNoBookmarks(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)

	for _, mode := range []domain.ListMode{domain.ListLive, domain.ListTrash} {
		rows, err := repo.List(context.Background(), domain.BookmarkListQuery{UserID: user.ID, Mode: mode, Limit: 51})
		require.NoError(t, err)
		require.Empty(t, rows)
	}
}

func TestBookmarkRepository_List_SameCreatedAtOrdersByIDDescendingAndPagesSplitTheTie(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)

	var tied []domain.Bookmark
	for i := 0; i < 5; i++ {
		tied = append(tied, seedList(t, db, user.ID, listTestBase, nil))
	}
	newer := seedList(t, db, user.ID, listTestBase.Add(time.Second), nil)
	older := seedList(t, db, user.ID, listTestBase.Add(-time.Second), nil)

	// UUIDv7 ids made one after another ascend, so id DESC is reverse creation order.
	want := []uuid.UUID{newer.ID}
	for i := len(tied) - 1; i >= 0; i-- {
		want = append(want, tied[i].ID)
	}
	want = append(want, older.ID)

	require.Equal(t, want, ids(flatten(listPages(t, repo, user.ID, domain.ListLive, 50))))

	// Page sizes 2 and 3 end inside the tie; every row still appears exactly once.
	for _, limit := range []int{2, 3} {
		require.Equal(t, want, ids(flatten(listPages(t, repo, user.ID, domain.ListLive, limit))), "limit %d", limit)
	}
}

func TestBookmarkRepository_List_PagingThrough120And100Bookmarks(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)

	t.Run("120 rows at limit 50 are 50, 50 and 20", func(t *testing.T) {
		user := newUser(t, db)
		var created []domain.Bookmark
		for i := 0; i < 120; i++ {
			created = append(created, seedList(t, db, user.ID, listTestBase.Add(time.Duration(i)*time.Second), nil))
		}
		pages := listPages(t, repo, user.ID, domain.ListLive, 50)
		require.Equal(t, []int{50, 50, 20}, sizes(pages))

		var want []uuid.UUID
		for i := len(created) - 1; i >= 0; i-- {
			want = append(want, created[i].ID)
		}
		require.Equal(t, want, ids(flatten(pages)))
	})

	t.Run("a boundary exactly at the end has no empty third page", func(t *testing.T) {
		user := newUser(t, db)
		for i := 0; i < 100; i++ {
			seedList(t, db, user.ID, listTestBase.Add(time.Duration(i)*time.Second), nil)
		}
		require.Equal(t, []int{50, 50}, sizes(listPages(t, repo, user.ID, domain.ListLive, 50)))
	})
}

func TestBookmarkRepository_List_MicrosecondDifferencesAreOrderedAndPaged(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)

	// Six bookmarks inside one millisecond: a cursor that rounds to milliseconds would
	// skip or repeat them at every page boundary.
	var created []domain.Bookmark
	for i := 0; i < 6; i++ {
		created = append(created, seedList(t, db, user.ID, listTestBase.Add(time.Duration(i)*time.Microsecond), nil))
	}
	var want []uuid.UUID
	for i := len(created) - 1; i >= 0; i-- {
		want = append(want, created[i].ID)
	}

	for _, limit := range []int{1, 2, 4} {
		require.Equal(t, want, ids(flatten(listPages(t, repo, user.ID, domain.ListLive, limit))), "limit %d", limit)
	}

	// The same holds for the trash, through deleted_at.
	var trashed []domain.Bookmark
	for i := 0; i < 6; i++ {
		trashed = append(trashed, seedList(t, db, user.ID, listTestBase, pagePtr(listTestBase.Add(time.Duration(i)*time.Microsecond))))
	}
	var wantTrash []uuid.UUID
	for i := len(trashed) - 1; i >= 0; i-- {
		wantTrash = append(wantTrash, trashed[i].ID)
	}
	for _, limit := range []int{1, 2, 4} {
		require.Equal(t, wantTrash, ids(flatten(listPages(t, repo, user.ID, domain.ListTrash, limit))), "limit %d", limit)
	}
}

func TestBookmarkRepository_List_TrashIsTrashedOnlyMostRecentlyTrashedFirst(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)

	// Created order and trashed order differ on purpose.
	trashedFirst := seedList(t, db, user.ID, listTestBase.Add(3*time.Hour), pagePtr(listTestBase.Add(time.Hour)))
	trashedLast := seedList(t, db, user.ID, listTestBase, pagePtr(listTestBase.Add(3*time.Hour)))
	trashedMiddle := seedList(t, db, user.ID, listTestBase.Add(time.Hour), pagePtr(listTestBase.Add(2*time.Hour)))
	seedList(t, db, user.ID, listTestBase.Add(5*time.Hour), nil) // live: not in the trash

	pages := listPages(t, repo, user.ID, domain.ListTrash, 50)
	require.Equal(t, []uuid.UUID{trashedLast.ID, trashedMiddle.ID, trashedFirst.ID}, ids(flatten(pages)))
	for _, b := range flatten(pages) {
		require.NotNil(t, b.DeletedAt)
	}
}

func TestBookmarkRepository_List_TrashTiesOnDeletedAtSplitByID(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)

	deletedAt := listTestBase.Add(time.Hour)
	var tied []domain.Bookmark
	for i := 0; i < 5; i++ {
		// Different created_at values must not influence the trash order.
		tied = append(tied, seedList(t, db, user.ID, listTestBase.Add(time.Duration(5-i)*time.Minute), pagePtr(deletedAt)))
	}
	var want []uuid.UUID
	for i := len(tied) - 1; i >= 0; i-- {
		want = append(want, tied[i].ID)
	}

	for _, limit := range []int{50, 2, 3} {
		require.Equal(t, want, ids(flatten(listPages(t, repo, user.ID, domain.ListTrash, limit))), "limit %d", limit)
	}

	t.Run("a trash of 120 pages as 50, 50 and 20", func(t *testing.T) {
		other := newUser(t, db)
		for i := 0; i < 120; i++ {
			seedList(t, db, other.ID, listTestBase, pagePtr(listTestBase.Add(time.Duration(i)*time.Second)))
		}
		require.Equal(t, []int{50, 50, 20}, sizes(listPages(t, repo, other.ID, domain.ListTrash, 50)))
	})
}

func TestBookmarkRepository_List_CursorAtAnIDThatDoesNotExistStillPagesFromThere(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)

	older := seedList(t, db, user.ID, listTestBase, nil)
	newer := seedList(t, db, user.ID, listTestBase.Add(time.Hour), nil)

	rows, err := repo.List(context.Background(), domain.BookmarkListQuery{
		UserID: user.ID, Mode: domain.ListLive, Limit: 51,
		After: &domain.Cursor{Mode: domain.ListLive, At: listTestBase.Add(30 * time.Minute), ID: domain.NewID()},
	})
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{older.ID}, ids(rows))
	require.NotContains(t, ids(rows), newer.ID)
}

func TestBookmarkRepository_List_UserIsolation(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	alice, bob := newUser(t, db), newUser(t, db)

	// Interleave the two users' rows so every page boundary falls between them.
	mine := map[uuid.UUID]map[domain.ListMode][]uuid.UUID{alice.ID: {}, bob.ID: {}}
	for i := 0; i < 7; i++ {
		at := listTestBase.Add(time.Duration(i) * time.Second)
		for _, u := range []uuid.UUID{alice.ID, bob.ID} {
			live := seedList(t, db, u, at, nil)
			trashed := seedList(t, db, u, at, pagePtr(at))
			mine[u][domain.ListLive] = append([]uuid.UUID{live.ID}, mine[u][domain.ListLive]...)
			mine[u][domain.ListTrash] = append([]uuid.UUID{trashed.ID}, mine[u][domain.ListTrash]...)
		}
	}

	for _, u := range []uuid.UUID{alice.ID, bob.ID} {
		for _, mode := range []domain.ListMode{domain.ListLive, domain.ListTrash} {
			for _, limit := range []int{3, 50} {
				got := flatten(listPages(t, repo, u, mode, limit))
				require.Equal(t, mine[u][mode], ids(got), "user %s, %s, limit %d", u, mode, limit)
				for _, b := range got {
					require.Equal(t, u, b.UserID)
				}
			}
		}
	}

	t.Run("another user's cursor position does not leak rows", func(t *testing.T) {
		// Alice's last row as the cursor for Bob returns only Bob's rows after that position.
		aliceRows := flatten(listPages(t, repo, alice.ID, domain.ListLive, 50))
		last := aliceRows[len(aliceRows)-1]
		rows, err := repo.List(context.Background(), domain.BookmarkListQuery{
			UserID: bob.ID, Mode: domain.ListLive, Limit: 51,
			After: &domain.Cursor{Mode: domain.ListLive, At: last.CreatedAt, ID: last.ID},
		})
		require.NoError(t, err)
		for _, b := range rows {
			require.Equal(t, bob.ID, b.UserID)
		}
	})
}

func TestBookmarkRepository_List_ReturnsNoPageContent(t *testing.T) {
	db := testutil.NewDB(t)
	user := newUser(t, db)
	b := seedList(t, db, user.ID, listTestBase, nil)
	require.NoError(t, db.Exec(`INSERT INTO bookmark_content (bookmark_id, text) VALUES (?, ?)`, b.ID, "the saved page text").Error)

	// Capture the SQL the repository runs.
	var sql bytes.Buffer
	capture := logger.New(log.New(&sql, "", 0), logger.Config{LogLevel: logger.Info, Colorful: false})
	repo := repository.NewBookmarkRepository(db.Session(&gorm.Session{Logger: capture}))

	rows, err := repo.List(context.Background(), domain.BookmarkListQuery{UserID: user.ID, Mode: domain.ListLive, Limit: 51})
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{b.ID}, ids(rows))

	// domain.Bookmark has no content field, and the query never touches the table.
	require.NotContains(t, sql.String(), "bookmark_content")
	require.NotContains(t, sql.String(), "search_vector")
	require.NotContains(t, sql.String(), "normalized_url")
	require.NotContains(t, sql.String(), "OFFSET")
	require.Contains(t, sql.String(), "user_id =", "every query filters by user_id")
}
