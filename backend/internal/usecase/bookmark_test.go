package usecase

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/domain"
)

type createFixture struct {
	svc      *BookmarkService
	store    *fakeBookmarkStore
	queue    *fakeEnqueuer
	log      *[]string
	user     uuid.UUID
	folderID uuid.UUID
}

func newCreateFixture() *createFixture {
	log := &[]string{}
	f := &createFixture{
		store:    newFakeBookmarkStore(log),
		queue:    &fakeEnqueuer{log: log},
		log:      log,
		user:     uuid.New(),
		folderID: uuid.New(),
	}
	folders := fakeFolders{owned: map[uuid.UUID]uuid.UUID{f.folderID: f.user}}
	f.svc = NewBookmarkService(f.store, folders, f.queue)
	return f
}

func TestBookmarkService_Create_HappyPath(t *testing.T) {
	f := newCreateFixture()
	b, err := f.svc.Create(context.Background(), f.user, CreateBookmarkInput{URL: "http://Example.com/a/?utm_source=x", Title: "Mine"})
	require.NoError(t, err)

	require.Equal(t, domain.FetchPending, b.FetchStatus)
	require.Equal(t, "http://Example.com/a/?utm_source=x", b.URL, "url is stored as submitted")
	require.Equal(t, "https://example.com/a", b.NormalizedURL)
	require.Equal(t, "Mine", b.Title, "a supplied title is stored")
	require.Len(t, f.store.bookmarks, 1)
	require.Equal(t, []uuid.UUID{b.ID}, f.queue.ids)
}

func TestBookmarkService_Create_NoTitleIsEmpty(t *testing.T) {
	f := newCreateFixture()
	b, err := f.svc.Create(context.Background(), f.user, CreateBookmarkInput{URL: "https://e.com"})
	require.NoError(t, err)
	require.Equal(t, "", b.Title)
}

func TestBookmarkService_Create_InvalidURL(t *testing.T) {
	for _, raw := range []string{"ftp://x", "javascript:x", "not a url", ""} {
		t.Run(raw, func(t *testing.T) {
			f := newCreateFixture()
			_, err := f.svc.Create(context.Background(), f.user, CreateBookmarkInput{URL: raw})
			require.ErrorIs(t, err, domain.ErrInvalidURL)
			require.Empty(t, f.store.bookmarks)
			require.Empty(t, *f.log)
		})
	}
}

func TestBookmarkService_Create_TooLong(t *testing.T) {
	longURL := "https://example.com/" + strings.Repeat("a", domain.MaxURLLength+1-len("https://example.com/"))
	require.Len(t, longURL, 2049)

	cases := []struct {
		name   string
		in     CreateBookmarkInput
		fields []domain.FieldError
	}{
		{"url", CreateBookmarkInput{URL: longURL}, []domain.FieldError{{Field: "url", Code: "too_long"}}},
		{"title", CreateBookmarkInput{URL: "https://e.com", Title: strings.Repeat("t", 301)}, []domain.FieldError{{Field: "title", Code: "too_long"}}},
		{"both", CreateBookmarkInput{URL: longURL, Title: strings.Repeat("t", 301)}, []domain.FieldError{{Field: "url", Code: "too_long"}, {Field: "title", Code: "too_long"}}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := newCreateFixture()
			_, err := f.svc.Create(context.Background(), f.user, c.in)
			require.ErrorIs(t, err, domain.ErrValidation)
			var ve *domain.ValidationError
			require.ErrorAs(t, err, &ve)
			require.Equal(t, c.fields, ve.Fields)
			require.Empty(t, f.store.bookmarks)
		})
	}

	t.Run("limits are inclusive", func(t *testing.T) {
		f := newCreateFixture()
		okURL := longURL[:domain.MaxURLLength]
		_, err := f.svc.Create(context.Background(), f.user, CreateBookmarkInput{URL: okURL, Title: strings.Repeat("t", 300)})
		require.NoError(t, err)
	})
}

func TestBookmarkService_Create_Duplicate(t *testing.T) {
	for _, trashed := range []bool{false, true} {
		name := "live"
		if trashed {
			name = "trashed"
		}
		t.Run(name, func(t *testing.T) {
			f := newCreateFixture()
			existing := domain.Bookmark{ID: uuid.New(), UserID: f.user, NormalizedURL: "https://e.com/a"}
			if trashed {
				now := time.Now()
				existing.DeletedAt = &now
			}
			f.store.bookmarks = append(f.store.bookmarks, existing)

			_, err := f.svc.Create(context.Background(), f.user, CreateBookmarkInput{URL: "http://E.com/a/#x"})
			require.ErrorIs(t, err, domain.ErrDuplicateBookmark)
			var de *domain.DuplicateError
			require.ErrorAs(t, err, &de)
			require.Equal(t, existing.ID, de.ExistingID)
			require.Equal(t, trashed, de.InTrash)
			require.Empty(t, f.queue.ids)
		})
	}
}

func TestBookmarkService_Create_DuplicateFromConstraintRace(t *testing.T) {
	// The pre-check passes, but a concurrent save wins the insert: the store reports the
	// constraint violation and the usecase turns it into the duplicate outcome.
	f := newCreateFixture()
	winner := domain.Bookmark{ID: uuid.New(), UserID: f.user, NormalizedURL: "https://e.com/a"}
	f.store.createErr = domain.ErrDuplicateBookmark
	svc := NewBookmarkService(&racingStore{fakeBookmarkStore: f.store, winner: winner}, fakeFolders{}, f.queue)

	_, err := svc.Create(context.Background(), f.user, CreateBookmarkInput{URL: "https://e.com/a"})
	var de *domain.DuplicateError
	require.ErrorAs(t, err, &de)
	require.Equal(t, winner.ID, de.ExistingID)
	require.Empty(t, f.queue.ids, "the loser is not enqueued")
}

// racingStore hides the winner from the first lookup, like a save that commits
// between the duplicate check and the insert.
type racingStore struct {
	*fakeBookmarkStore
	winner domain.Bookmark
	lookup int
}

func (r *racingStore) FindByNormalizedURL(_ context.Context, _ uuid.UUID, _ string) (domain.Bookmark, error) {
	r.lookup++
	if r.lookup == 1 {
		return domain.Bookmark{}, gorm.ErrRecordNotFound
	}
	return r.winner, nil
}

func TestBookmarkService_Create_Cap(t *testing.T) {
	fill := func(f *createFixture, n int) {
		for i := 0; i < n; i++ {
			f.store.bookmarks = append(f.store.bookmarks, domain.Bookmark{
				ID: uuid.New(), UserID: f.user, NormalizedURL: "https://e.com/" + uuid.NewString(),
			})
		}
	}

	t.Run("at the cap", func(t *testing.T) {
		f := newCreateFixture()
		fill(f, domain.MaxBookmarks)
		_, err := f.svc.Create(context.Background(), f.user, CreateBookmarkInput{URL: "https://new.com"})
		require.ErrorIs(t, err, domain.ErrBookmarkLimitReached)
	})
	t.Run("trashed bookmarks count", func(t *testing.T) {
		f := newCreateFixture()
		fill(f, domain.MaxBookmarks)
		now := time.Now()
		for i := range f.store.bookmarks {
			f.store.bookmarks[i].DeletedAt = &now
		}
		_, err := f.svc.Create(context.Background(), f.user, CreateBookmarkInput{URL: "https://new.com"})
		require.ErrorIs(t, err, domain.ErrBookmarkLimitReached)
	})
	t.Run("just under the cap", func(t *testing.T) {
		f := newCreateFixture()
		fill(f, domain.MaxBookmarks-1)
		_, err := f.svc.Create(context.Background(), f.user, CreateBookmarkInput{URL: "https://new.com"})
		require.NoError(t, err)
	})
	t.Run("a duplicate at the cap is a duplicate", func(t *testing.T) {
		f := newCreateFixture()
		fill(f, domain.MaxBookmarks-1)
		f.store.bookmarks = append(f.store.bookmarks, domain.Bookmark{ID: uuid.New(), UserID: f.user, NormalizedURL: "https://dup.com"})
		_, err := f.svc.Create(context.Background(), f.user, CreateBookmarkInput{URL: "https://dup.com/"})
		require.ErrorIs(t, err, domain.ErrDuplicateBookmark)
		require.NotErrorIs(t, err, domain.ErrBookmarkLimitReached)
	})
	t.Run("another user's bookmarks do not count", func(t *testing.T) {
		f := newCreateFixture()
		other := uuid.New()
		for i := 0; i < domain.MaxBookmarks; i++ {
			f.store.bookmarks = append(f.store.bookmarks, domain.Bookmark{ID: uuid.New(), UserID: other, NormalizedURL: "https://e.com/" + uuid.NewString()})
		}
		_, err := f.svc.Create(context.Background(), f.user, CreateBookmarkInput{URL: "https://new.com"})
		require.NoError(t, err)
	})
}

func TestBookmarkService_Create_Folder(t *testing.T) {
	t.Run("own folder", func(t *testing.T) {
		f := newCreateFixture()
		b, err := f.svc.Create(context.Background(), f.user, CreateBookmarkInput{URL: "https://e.com", FolderID: &f.folderID})
		require.NoError(t, err)
		require.Equal(t, &f.folderID, b.FolderID)
	})
	t.Run("another user's folder is not found", func(t *testing.T) {
		f := newCreateFixture()
		_, err := f.svc.Create(context.Background(), uuid.New(), CreateBookmarkInput{URL: "https://e.com", FolderID: &f.folderID})
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
		require.Empty(t, f.store.bookmarks)
	})
}

func TestBookmarkService_Create_EnqueueFailureStillSucceeds(t *testing.T) {
	f := newCreateFixture()
	f.queue.err = errors.New("queue down")
	b, err := f.svc.Create(context.Background(), f.user, CreateBookmarkInput{URL: "https://e.com"})
	require.NoError(t, err)
	require.Equal(t, domain.FetchPending, b.FetchStatus)
	require.Len(t, f.store.bookmarks, 1)
}

func TestBookmarkService_Create_EnqueueAfterCommit(t *testing.T) {
	f := newCreateFixture()
	_, err := f.svc.Create(context.Background(), f.user, CreateBookmarkInput{URL: "https://e.com"})
	require.NoError(t, err)
	require.Equal(t, []string{"commit", "enqueue"}, *f.log)
}

func TestBookmarkService_Create_NoEnqueueWhenInsertFails(t *testing.T) {
	f := newCreateFixture()
	f.store.createErr = errors.New("db down")
	_, err := f.svc.Create(context.Background(), f.user, CreateBookmarkInput{URL: "https://e.com"})
	require.ErrorContains(t, err, "db down")
	require.Empty(t, f.queue.ids)
}

func TestBookmarkService_Get(t *testing.T) {
	f := newCreateFixture()
	other := uuid.New()
	now := time.Now()
	live := domain.Bookmark{ID: uuid.New(), UserID: f.user, FetchStatus: domain.FetchOK}
	trashed := domain.Bookmark{ID: uuid.New(), UserID: f.user, DeletedAt: &now, FetchStatus: domain.FetchPending}
	f.store.bookmarks = append(f.store.bookmarks, live, trashed)
	f.store.contents[live.ID] = "page text"

	d, err := f.svc.Get(context.Background(), f.user, live.ID)
	require.NoError(t, err)
	require.Equal(t, "page text", *d.Content)

	d, err = f.svc.Get(context.Background(), f.user, trashed.ID)
	require.NoError(t, err)
	require.Nil(t, d.Content, "no content while pending")
	require.NotNil(t, d.DeletedAt)

	_, err = f.svc.Get(context.Background(), other, live.ID)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	_, err = f.svc.Get(context.Background(), f.user, uuid.New())
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
}
