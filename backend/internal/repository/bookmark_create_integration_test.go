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
	"marker/internal/usecase"
)

// stubQueue stands in for worker.Queue.
type stubQueue struct {
	mu  sync.Mutex
	ids []uuid.UUID
	err error
}

func (q *stubQueue) EnqueueFetch(_ context.Context, id uuid.UUID) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.ids = append(q.ids, id)
	return q.err
}

func userVersion(t *testing.T, db *gorm.DB, id uuid.UUID) int64 {
	t.Helper()
	var u domain.User
	require.NoError(t, db.First(&u, "id = ?", id).Error)
	return u.Version
}

func newBookmarkService(db *gorm.DB, q *stubQueue) *usecase.BookmarkService {
	return usecase.NewBookmarkService(repository.NewBookmarkRepository(db), repository.NewFolderRepository(db), q)
}

func TestCreateBookmark_PersistsRowSearchVectorAndVersion(t *testing.T) {
	db := testutil.NewDB(t)
	user := newUser(t, db)
	before := userVersion(t, db, user.ID)

	svc := newBookmarkService(db, &stubQueue{})
	b, err := svc.Create(context.Background(), user.ID, usecase.CreateBookmarkInput{
		URL: "http://Example.com/Zebras/?utm_source=x", Title: "Quokka facts",
	})
	require.NoError(t, err)

	var row domain.Bookmark
	require.NoError(t, db.First(&row, "id = ? AND user_id = ?", b.ID, user.ID).Error)
	require.Equal(t, "http://Example.com/Zebras/?utm_source=x", row.URL)
	require.Equal(t, "https://example.com/Zebras", row.NormalizedURL)
	require.Equal(t, "Quokka facts", row.Title)
	require.Equal(t, domain.FetchPending, row.FetchStatus)

	// search_vector is built from the title (A) and the URL (B).
	var hits int64
	require.NoError(t, db.Raw(
		`SELECT count(*) FROM bookmarks WHERE id = ? AND search_vector @@ plainto_tsquery('english', 'quokka')`, b.ID,
	).Scan(&hits).Error)
	require.EqualValues(t, 1, hits, "title is searchable")
	require.NoError(t, db.Raw(
		`SELECT count(*) FROM bookmarks WHERE id = ? AND search_vector @@ plainto_tsquery('english', 'zebras')`, b.ID,
	).Scan(&hits).Error)
	require.EqualValues(t, 1, hits, "url is searchable")

	require.Equal(t, before+1, userVersion(t, db, user.ID), "a save increments users.version once")
}

func TestCreateBookmark_ConcurrentSavesOfTheSameURL(t *testing.T) {
	db := testutil.NewDB(t)
	user := newUser(t, db)
	queue := &stubQueue{}
	svc := newBookmarkService(db, queue)

	const n = 8
	errs := make([]error, n)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			// Different spellings of one URL, so only the normalized key collides.
			url := "https://race.example.com/page"
			if i%2 == 1 {
				url = "http://RACE.example.com/page/#frag"
			}
			_, errs[i] = svc.Create(context.Background(), user.ID, usecase.CreateBookmarkInput{URL: url})
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
	require.Len(t, queue.ids, 1, "only the winner is enqueued")
	require.EqualValues(t, 1, userVersion(t, db, user.ID), "losers roll back their version bump")
}

func TestCreateBookmark_TrashedURLIsADuplicateWithInTrash(t *testing.T) {
	db := testutil.NewDB(t)
	user := newUser(t, db)
	svc := newBookmarkService(db, &stubQueue{})

	first, err := svc.Create(context.Background(), user.ID, usecase.CreateBookmarkInput{URL: "https://trash.example.com/a"})
	require.NoError(t, err)
	require.NoError(t, db.Model(&domain.Bookmark{}).Where("id = ?", first.ID).Update("deleted_at", time.Now()).Error)

	_, err = svc.Create(context.Background(), user.ID, usecase.CreateBookmarkInput{URL: "http://trash.example.com/a/"})
	var dup *domain.DuplicateError
	require.ErrorAs(t, err, &dup)
	require.Equal(t, first.ID, dup.ExistingID)
	require.True(t, dup.InTrash)
}

func TestCreateBookmark_SameURLForTwoUsers(t *testing.T) {
	db := testutil.NewDB(t)
	alice, bob := newUser(t, db), newUser(t, db)
	svc := newBookmarkService(db, &stubQueue{})

	_, err := svc.Create(context.Background(), alice.ID, usecase.CreateBookmarkInput{URL: "https://shared.example.com"})
	require.NoError(t, err)
	_, err = svc.Create(context.Background(), bob.ID, usecase.CreateBookmarkInput{URL: "https://shared.example.com"})
	require.NoError(t, err)
}

func TestCreateBookmark_ForeignFolderIsNotFound(t *testing.T) {
	db := testutil.NewDB(t)
	alice, bob := newUser(t, db), newUser(t, db)
	folder := newFolder(alice.ID, nil, "Alice's", 1)
	require.NoError(t, db.Create(&folder).Error)
	svc := newBookmarkService(db, &stubQueue{})

	_, err := svc.Create(context.Background(), bob.ID, usecase.CreateBookmarkInput{URL: "https://e.com", FolderID: &folder.ID})
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)

	_, err = svc.Create(context.Background(), alice.ID, usecase.CreateBookmarkInput{URL: "https://e.com", FolderID: &folder.ID})
	require.NoError(t, err)
}

func TestCreateBookmark_SweepFindsABookmarkWithNoJob(t *testing.T) {
	db := testutil.NewDB(t)
	user := newUser(t, db)
	queue := &stubQueue{err: errors.New("queue down")}
	svc := newBookmarkService(db, queue)

	b, err := svc.Create(context.Background(), user.ID, usecase.CreateBookmarkInput{URL: "https://sweep.example.com"})
	require.NoError(t, err, "an enqueue failure still saves")

	// The sweep only looks at bookmarks older than two minutes; look ahead of now.
	ids, err := repository.NewBookmarkRepository(db).ListPendingIDs(context.Background(), time.Now().Add(time.Minute), 1000)
	require.NoError(t, err)
	require.Contains(t, ids, b.ID)
}

func TestGetBookmark_OwnLiveAndTrashedButNeverAnotherUsers(t *testing.T) {
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
