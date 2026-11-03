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

func userVersion(t *testing.T, db *gorm.DB, id uuid.UUID) int64 {
	t.Helper()
	var u domain.User
	require.NoError(t, db.First(&u, "id = ?", id).Error)
	return u.Version
}

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

func TestBookmarkRepository_Create_PersistsRowSearchVectorAndVersion(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	before := userVersion(t, db, user.ID)

	b := newBookmark(user.ID, "https://example.com/Zebras")
	b.URL = "http://Example.com/Zebras/?utm_source=x"
	b.Title = "Quokka facts"
	require.NoError(t, repo.Create(context.Background(), b))

	var row domain.Bookmark
	require.NoError(t, db.First(&row, "id = ? AND user_id = ?", b.ID, user.ID).Error)
	require.Equal(t, b.URL, row.URL)
	require.Equal(t, b.NormalizedURL, row.NormalizedURL)
	require.Equal(t, "Quokka facts", row.Title)
	require.Equal(t, domain.FetchPending, row.FetchStatus)

	// search_vector is built from the title (A) and the URL (B).
	var hits int64
	require.NoError(t, db.Raw(
		`SELECT count(*) FROM bookmarks WHERE id = ? AND search_vector @@ plainto_tsquery('english', 'quokka')`, b.ID,
	).Scan(&hits).Error)
	require.EqualValues(t, 1, hits, "title is searchable")
	require.NoError(t, db.Raw(
		`SELECT count(*) FROM bookmarks WHERE id = ? AND search_vector @@ plainto_tsquery('english', 'example.com')`, b.ID,
	).Scan(&hits).Error)
	require.EqualValues(t, 1, hits, "the url is searchable by its host (the parser keeps a URL as host and path tokens, not words)")

	require.Equal(t, before+1, userVersion(t, db, user.ID), "a save increments users.version once")
}

func TestBookmarkRepository_Create_ConcurrentSavesOfTheSameURL(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)

	const n = 8
	errs := make([]error, n)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			errs[i] = repo.Create(context.Background(), newBookmark(user.ID, "https://race.example.com/page"))
		}()
	}
	close(start)
	wg.Wait()

	var created, duplicates int
	for _, err := range errs {
		switch {
		case err == nil:
			created++
		case errors.Is(err, domain.ErrDuplicateBookmark):
			duplicates++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}
	require.Equal(t, 1, created)
	require.Equal(t, n-1, duplicates)

	var rows int64
	require.NoError(t, db.Model(&domain.Bookmark{}).Where("user_id = ?", user.ID).Count(&rows).Error)
	require.EqualValues(t, 1, rows)
	require.EqualValues(t, 1, userVersion(t, db, user.ID), "losers roll back their version bump")
}

func TestBookmarkRepository_Create_TrashedURLStillBlocksAndCanBeFound(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)

	first := newBookmark(user.ID, "https://trash.example.com/a")
	require.NoError(t, repo.Create(context.Background(), first))
	require.NoError(t, db.Model(&domain.Bookmark{}).Where("id = ?", first.ID).Update("deleted_at", time.Now()).Error)

	err := repo.Create(context.Background(), newBookmark(user.ID, "https://trash.example.com/a"))
	require.ErrorIs(t, err, domain.ErrDuplicateBookmark)

	// The usecase names the winner from this lookup, so it must see trashed rows too.
	found, err := repo.FindByNormalizedURL(context.Background(), user.ID, "https://trash.example.com/a")
	require.NoError(t, err)
	require.Equal(t, first.ID, found.ID)
	require.NotNil(t, found.DeletedAt)
}

func TestBookmarkRepository_Create_SameURLForTwoUsers(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	alice, bob := newUser(t, db), newUser(t, db)

	require.NoError(t, repo.Create(context.Background(), newBookmark(alice.ID, "https://shared.example.com")))
	require.NoError(t, repo.Create(context.Background(), newBookmark(bob.ID, "https://shared.example.com")))

	// Another user's bookmark is invisible to the lookup (NFR-7).
	_, err := repo.FindByNormalizedURL(context.Background(), bob.ID, "https://only-alice.example.com")
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
}

func TestBookmarkRepository_GetDetail_OwnLiveAndTrashedButNeverAnotherUsers(t *testing.T) {
	db := testutil.NewDB(t)
	alice, bob := newUser(t, db), newUser(t, db)
	repo := repository.NewBookmarkRepository(db)

	live := newBookmark(alice.ID, "https://get.example.com/live")
	trashed := newBookmark(alice.ID, "https://get.example.com/trashed")
	require.NoError(t, db.Create(&live).Error)
	require.NoError(t, db.Create(&trashed).Error)
	require.NoError(t, db.Model(&trashed).Update("deleted_at", time.Now()).Error)

	d, err := repo.GetDetail(context.Background(), alice.ID, live.ID)
	require.NoError(t, err)
	require.Nil(t, d.Content, "no content while pending")

	d, err = repo.GetDetail(context.Background(), alice.ID, trashed.ID)
	require.NoError(t, err)
	require.NotNil(t, d.DeletedAt)

	require.NoError(t, db.Create(&domain.BookmarkContent{BookmarkID: live.ID, Text: "stored text"}).Error)
	d, err = repo.GetDetail(context.Background(), alice.ID, live.ID)
	require.NoError(t, err)
	require.NotNil(t, d.Content)
	require.Equal(t, "stored text", *d.Content)

	// NFR-7: another user's bookmark and an unknown id look the same.
	_, err = repo.GetDetail(context.Background(), bob.ID, live.ID)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	_, err = repo.GetDetail(context.Background(), alice.ID, uuid.New())
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
}

func TestBookmarkRepository_Create_ConcurrentSavesNeverExceedTheCap(t *testing.T) {
	db := testutil.NewDB(t)
	user := newUser(t, db)
	repo := repository.NewBookmarkRepository(db)

	rows := make([]domain.Bookmark, domain.MaxBookmarks-1)
	for i := range rows {
		rows[i] = newBookmark(user.ID, "https://cap.example.com/"+uuid.NewString())
	}
	require.NoError(t, db.CreateInBatches(rows, 200).Error)

	const n = 6
	errs := make([]error, n)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			errs[i] = repo.Create(context.Background(), newBookmark(user.ID, "https://cap.example.com/new-"+uuid.NewString()))
		}()
	}
	close(start)
	wg.Wait()

	var created, atCap int
	for _, err := range errs {
		switch {
		case err == nil:
			created++
		case errors.Is(err, domain.ErrBookmarkLimitReached):
			atCap++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}
	require.Equal(t, 1, created, "only one save fits under the cap")
	require.Equal(t, n-1, atCap)

	var total int64
	require.NoError(t, db.Model(&domain.Bookmark{}).Where("user_id = ?", user.ID).Count(&total).Error)
	require.EqualValues(t, domain.MaxBookmarks, total)
}

func TestBookmarkRepository_Create_DuplicateAtTheCapIsADuplicate(t *testing.T) {
	db := testutil.NewDB(t)
	user := newUser(t, db)
	repo := repository.NewBookmarkRepository(db)

	rows := make([]domain.Bookmark, domain.MaxBookmarks)
	for i := range rows {
		rows[i] = newBookmark(user.ID, "https://capdup.example.com/"+uuid.NewString())
	}
	require.NoError(t, db.CreateInBatches(rows, 200).Error)

	dup := newBookmark(user.ID, rows[0].NormalizedURL)
	require.ErrorIs(t, repo.Create(context.Background(), dup), domain.ErrDuplicateBookmark)

	fresh := newBookmark(user.ID, "https://capdup.example.com/fresh")
	require.ErrorIs(t, repo.Create(context.Background(), fresh), domain.ErrBookmarkLimitReached)
}

func TestRecordFetchSuccess_StoresResultAndTouchesNothingElse(t *testing.T) {
	for _, trashed := range []bool{false, true} {
		db := testutil.NewDB(t)
		repo := repository.NewBookmarkRepository(db)
		user := newUser(t, db)
		folder := newFolder(user.ID, nil, "F-"+domain.NewID().String(), 1)
		require.NoError(t, db.Create(&folder).Error)

		b := newBookmark(user.ID, "https://fetch.example.com/"+domain.NewID().String())
		b.Note, b.FolderID = "my note", &folder.ID
		require.NoError(t, db.Create(&b).Error)
		if trashed {
			require.NoError(t, db.Model(&b).Update("deleted_at", time.Now()).Error)
		}
		before := userVersion(t, db, user.ID)

		err := repo.RecordFetchSuccess(context.Background(), b, domain.FetchResult{
			Title: "Fetched title", Text: "pangolin habitat",
			Favicon: &domain.FaviconData{Host: "fetch.example.com", ContentType: "image/png", Data: []byte{1, 2, 3}},
		})
		require.NoError(t, err)

		var got domain.Bookmark
		require.NoError(t, db.First(&got, "id = ?", b.ID).Error)
		require.Equal(t, domain.FetchOK, got.FetchStatus)
		require.Equal(t, "Fetched title", got.Title, "an empty title is filled")
		require.Equal(t, "my note", got.Note)
		require.Equal(t, &folder.ID, got.FolderID)
		require.Equal(t, trashed, got.DeletedAt != nil, "trash state is unchanged; a trashed bookmark is still updated")
		require.NotNil(t, got.FaviconID)

		var fav domain.Favicon
		require.NoError(t, db.First(&fav, "id = ?", *got.FaviconID).Error)
		require.Equal(t, user.ID, fav.UserID)
		require.Equal(t, []byte{1, 2, 3}, fav.Data)

		var content domain.BookmarkContent
		require.NoError(t, db.First(&content, "bookmark_id = ?", b.ID).Error)
		require.Equal(t, "pangolin habitat", content.Text)

		var hits int64
		require.NoError(t, db.Raw(`SELECT count(*) FROM bookmarks WHERE id = ? AND search_vector @@ plainto_tsquery('english', 'pangolin')`, b.ID).Scan(&hits).Error)
		require.EqualValues(t, 1, hits, "content is searchable once the fetch completes")

		require.Equal(t, before+1, userVersion(t, db, user.ID))
	}
}

func TestRecordFetchSuccess_NeverOverwritesATitle(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	b := newBookmark(user.ID, "https://title.example.com/"+domain.NewID().String())
	b.Title = "Mine"
	require.NoError(t, db.Create(&b).Error)

	require.NoError(t, repo.RecordFetchSuccess(context.Background(), b, domain.FetchResult{Title: "From page", Text: "x"}))

	var got domain.Bookmark
	require.NoError(t, db.First(&got, "id = ?", b.ID).Error)
	require.Equal(t, "Mine", got.Title)
}

func TestRecordFetchSuccess_FaviconIsOnePerUserAndHost(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	host := domain.NewID().String() + ".example.com"

	var ids []string
	for _, path := range []string{"a", "b"} {
		b := newBookmark(user.ID, "https://"+host+"/"+path)
		require.NoError(t, db.Create(&b).Error)
		require.NoError(t, repo.RecordFetchSuccess(context.Background(), b, domain.FetchResult{
			Text: "x", Favicon: &domain.FaviconData{Host: host, ContentType: "image/png", Data: []byte(path)},
		}))
		var got domain.Bookmark
		require.NoError(t, db.First(&got, "id = ?", b.ID).Error)
		ids = append(ids, got.FaviconID.String())
	}
	require.Equal(t, ids[0], ids[1], "the upsert on (user_id, host) reuses the row")
}

func TestRecordFetchSuccess_DeletedBookmarkIsDiscarded(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	b := newBookmark(user.ID, "https://gone.example.com/"+domain.NewID().String())
	require.NoError(t, db.Create(&b).Error)
	require.NoError(t, db.Delete(&domain.Bookmark{}, "id = ?", b.ID).Error)
	before := userVersion(t, db, user.ID)

	err := repo.RecordFetchSuccess(context.Background(), b, domain.FetchResult{Text: "x",
		Favicon: &domain.FaviconData{Host: "gone.example.com", ContentType: "image/png", Data: []byte{1}}})
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)

	var favicons int64
	require.NoError(t, db.Model(&domain.Favicon{}).Where("user_id = ?", user.ID).Count(&favicons).Error)
	require.Zero(t, favicons, "the whole transaction rolled back")
	require.Equal(t, before, userVersion(t, db, user.ID))
}

func TestRecordFetch_DeletedUserIsDiscarded(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	b := newBookmark(user.ID, "https://nouser.example.com/"+domain.NewID().String())
	require.NoError(t, db.Create(&b).Error)
	require.NoError(t, db.Delete(&domain.User{}, "id = ?", user.ID).Error)

	// Favicon insert hits the user foreign key; the content insert hits the bookmark's.
	err := repo.RecordFetchSuccess(context.Background(), b, domain.FetchResult{Text: "x",
		Favicon: &domain.FaviconData{Host: "nouser.example.com", ContentType: "image/png", Data: []byte{1}}})
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	require.ErrorIs(t, repo.RecordFetchFailure(context.Background(), b), gorm.ErrRecordNotFound)
}

func TestRecordFetchFailure_SetsFailedAndBumpsVersion(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	b := newBookmark(user.ID, "https://fail.example.com/"+domain.NewID().String())
	b.Title, b.Note = "Mine", "note"
	require.NoError(t, db.Create(&b).Error)
	before := userVersion(t, db, user.ID)

	require.NoError(t, repo.RecordFetchFailure(context.Background(), b))

	var got domain.Bookmark
	require.NoError(t, db.First(&got, "id = ?", b.ID).Error)
	require.Equal(t, domain.FetchFailed, got.FetchStatus)
	require.Equal(t, "Mine", got.Title)
	require.Equal(t, "note", got.Note)
	require.Equal(t, before+1, userVersion(t, db, user.ID))

	// Not pending any more: a second result is discarded.
	require.ErrorIs(t, repo.RecordFetchFailure(context.Background(), b), gorm.ErrRecordNotFound)
}
