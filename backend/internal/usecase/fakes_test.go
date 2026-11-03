package usecase

import (
	"context"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"marker/internal/domain"
)

// fakeSessionStore is an in-memory SessionStore. The tests read existing sessions
// and assert what was stored afterwards, so a fake fits better than a spy.
type fakeSessionStore struct {
	sessions map[uuid.UUID]domain.Session
	touches  int
}

func newFakeSessionStore() *fakeSessionStore {
	return &fakeSessionStore{sessions: map[uuid.UUID]domain.Session{}}
}

func (f *fakeSessionStore) CreateSession(_ context.Context, s domain.Session) error {
	f.sessions[s.ID] = s
	return nil
}

func (f *fakeSessionStore) FindSessionByTokenHash(_ context.Context, hash []byte) (domain.Session, error) {
	for _, s := range f.sessions {
		if string(s.TokenHash) == string(hash) {
			return s, nil
		}
	}
	return domain.Session{}, gorm.ErrRecordNotFound
}

func (f *fakeSessionStore) TouchSession(_ context.Context, id uuid.UUID, lastSeenAt, expiresAt time.Time) error {
	s := f.sessions[id]
	s.LastSeenAt, s.ExpiresAt = lastSeenAt, expiresAt
	f.sessions[id] = s
	f.touches++
	return nil
}

func (f *fakeSessionStore) DeleteSession(_ context.Context, id uuid.UUID) error {
	delete(f.sessions, id)
	return nil
}

func (f *fakeSessionStore) DeleteExpiredSessions(_ context.Context, now time.Time) error {
	for id, s := range f.sessions {
		if s.Expired(now) {
			delete(f.sessions, id)
		}
	}
	return nil
}

// fakeUserStore is an in-memory UserStore keyed by identity provider subject.
type fakeUserStore struct {
	users map[string]domain.User
}

func newFakeUserStore() *fakeUserStore {
	return &fakeUserStore{users: map[string]domain.User{}}
}

func (f *fakeUserStore) FindOrCreateUserByIdpID(_ context.Context, idpID string) (domain.User, error) {
	if u, ok := f.users[idpID]; ok {
		return u, nil
	}
	u := domain.User{ID: domain.NewID(), IdpID: idpID}
	f.users[idpID] = u
	return u, nil
}

// fakeBookmarkStore is an in-memory BookmarkStore. Create events go to the shared log
// so tests can assert the order against the queue.
type fakeBookmarkStore struct {
	bookmarks []domain.Bookmark
	contents  map[uuid.UUID]string
	log       *[]string
	// createErr, if set, is returned by Create (after nothing is stored).
	createErr error
}

func newFakeBookmarkStore(log *[]string) *fakeBookmarkStore {
	return &fakeBookmarkStore{contents: map[uuid.UUID]string{}, log: log}
}

func (f *fakeBookmarkStore) FindByNormalizedURL(_ context.Context, userID uuid.UUID, n string) (domain.Bookmark, error) {
	for _, b := range f.bookmarks {
		if b.UserID == userID && b.NormalizedURL == n {
			return b, nil
		}
	}
	return domain.Bookmark{}, gorm.ErrRecordNotFound
}

func (f *fakeBookmarkStore) CountByUserID(_ context.Context, userID uuid.UUID) (int64, error) {
	var n int64
	for _, b := range f.bookmarks {
		if b.UserID == userID {
			n++
		}
	}
	return n, nil
}

func (f *fakeBookmarkStore) Create(_ context.Context, b domain.Bookmark) error {
	if f.createErr != nil {
		return f.createErr
	}
	f.bookmarks = append(f.bookmarks, b)
	if f.log != nil {
		*f.log = append(*f.log, "commit")
	}
	return nil
}

func (f *fakeBookmarkStore) GetDetail(_ context.Context, userID, id uuid.UUID) (domain.BookmarkDetail, error) {
	for _, b := range f.bookmarks {
		if b.ID == id && b.UserID == userID {
			d := domain.BookmarkDetail{Bookmark: b}
			if text, ok := f.contents[id]; ok {
				d.Content = &text
			}
			return d, nil
		}
	}
	return domain.BookmarkDetail{}, gorm.ErrRecordNotFound
}

// fakeFolders knows which folders exist per user.
type fakeFolders struct{ owned map[uuid.UUID]uuid.UUID } // folder ID -> owner

func (f fakeFolders) GetFolder(_ context.Context, userID, id uuid.UUID) (domain.Folder, error) {
	if f.owned[id] == userID {
		return domain.Folder{ID: id, UserID: userID}, nil
	}
	return domain.Folder{}, gorm.ErrRecordNotFound
}

// fakeEnqueuer records enqueues in the shared log.
type fakeEnqueuer struct {
	log *[]string
	ids []uuid.UUID
	err error
}

func (f *fakeEnqueuer) EnqueueFetch(_ context.Context, id uuid.UUID) error {
	*f.log = append(*f.log, "enqueue")
	f.ids = append(f.ids, id)
	return f.err
}

// fakeFetchStore is an in-memory FetchStore that honours the contract's rules: a
// success fills only an empty title, sets content, favicon and status, and bumps the
// user's version; a deleted bookmark is gorm.ErrRecordNotFound.
type fakeFetchStore struct {
	bookmarks map[uuid.UUID]domain.Bookmark
	contents  map[uuid.UUID]string
	favicons  map[uuid.UUID]domain.FaviconData
	versions  map[uuid.UUID]int64
}

func newFakeFetchStore(bs ...domain.Bookmark) *fakeFetchStore {
	f := &fakeFetchStore{
		bookmarks: map[uuid.UUID]domain.Bookmark{},
		contents:  map[uuid.UUID]string{},
		favicons:  map[uuid.UUID]domain.FaviconData{},
		versions:  map[uuid.UUID]int64{},
	}
	for _, b := range bs {
		f.bookmarks[b.ID] = b
	}
	return f
}

func (f *fakeFetchStore) FindForFetch(_ context.Context, id uuid.UUID) (domain.Bookmark, error) {
	b, ok := f.bookmarks[id]
	if !ok {
		return domain.Bookmark{}, gorm.ErrRecordNotFound
	}
	return b, nil
}

func (f *fakeFetchStore) RecordFetchSuccess(_ context.Context, b domain.Bookmark, r domain.FetchResult) error {
	cur, ok := f.bookmarks[b.ID]
	if !ok {
		return gorm.ErrRecordNotFound
	}
	if cur.Title == "" {
		cur.Title = r.Title
	}
	if r.Favicon != nil {
		fid := domain.NewID()
		f.favicons[fid] = *r.Favicon
		cur.FaviconID = &fid
	}
	cur.FetchStatus = domain.FetchOK
	f.bookmarks[b.ID] = cur
	f.contents[b.ID] = r.Text
	f.versions[b.UserID]++
	return nil
}

func (f *fakeFetchStore) RecordFetchFailure(_ context.Context, b domain.Bookmark) error {
	cur, ok := f.bookmarks[b.ID]
	if !ok {
		return gorm.ErrRecordNotFound
	}
	cur.FetchStatus = domain.FetchFailed
	f.bookmarks[b.ID] = cur
	f.versions[b.UserID]++
	return nil
}
