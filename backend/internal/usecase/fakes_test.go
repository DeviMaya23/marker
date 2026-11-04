package usecase

import (
	"context"
	"sort"
	"strings"
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
	// lastList is the query the last List call received.
	lastList domain.BookmarkListQuery
	// lastSearch is the query the last Search call received; searchCalls counts the calls.
	lastSearch  domain.BookmarkSearchQuery
	searchCalls int
	// searchRows are the rows Search returns, from the offset, up to the limit.
	searchRows []domain.Bookmark
	// createErr, if set, is returned by Create (after nothing is stored).
	createErr error
	// updateErr, if set, is returned by Update after nothing is stored (for example a
	// folder that vanished between the check and the write).
	updateErr error
	// updates is every update the store was asked to write, as received.
	updates []domain.BookmarkUpdate
	// versions counts the writes per user, as users.version would.
	versions map[uuid.UUID]int64
}

func (f *fakeBookmarkStore) index(userID, id uuid.UUID) int {
	for i, b := range f.bookmarks {
		if b.ID == id && b.UserID == userID {
			return i
		}
	}
	return -1
}

func (f *fakeBookmarkStore) bump(userID uuid.UUID) {
	if f.versions == nil {
		f.versions = map[uuid.UUID]int64{}
	}
	f.versions[userID]++
}

func (f *fakeBookmarkStore) Get(_ context.Context, userID, id uuid.UUID) (domain.Bookmark, error) {
	i := f.index(userID, id)
	if i < 0 {
		return domain.Bookmark{}, gorm.ErrRecordNotFound
	}
	return f.bookmarks[i], nil
}

// Update applies exactly the fields that are set, as the repository does.
func (f *fakeBookmarkStore) Update(_ context.Context, userID, id uuid.UUID, u domain.BookmarkUpdate) (domain.Bookmark, error) {
	f.updates = append(f.updates, u)
	if f.updateErr != nil {
		return domain.Bookmark{}, f.updateErr
	}
	i := f.index(userID, id)
	if i < 0 {
		return domain.Bookmark{}, gorm.ErrRecordNotFound
	}
	b := f.bookmarks[i]
	if b.DeletedAt != nil {
		return domain.Bookmark{}, domain.ErrBookmarkInTrash
	}
	if u.Title.Set {
		b.Title = u.Title.Value
	}
	if u.Note.Set {
		b.Note = u.Note.Value // the zero value when null
	}
	if u.FolderID.Set {
		b.FolderID = nil
		if !u.FolderID.Null {
			fid := u.FolderID.Value
			b.FolderID = &fid
		}
	}
	f.bookmarks[i] = b
	f.bump(userID)
	return b, nil
}

func (f *fakeBookmarkStore) Trash(_ context.Context, userID, id uuid.UUID) error {
	i := f.index(userID, id)
	if i < 0 {
		return gorm.ErrRecordNotFound
	}
	if f.bookmarks[i].DeletedAt != nil {
		return domain.ErrBookmarkInTrash
	}
	now := time.Now().UTC()
	f.bookmarks[i].DeletedAt = &now
	f.bump(userID)
	return nil
}

func (f *fakeBookmarkStore) Restore(_ context.Context, userID, id uuid.UUID) (domain.Bookmark, error) {
	i := f.index(userID, id)
	if i < 0 {
		return domain.Bookmark{}, gorm.ErrRecordNotFound
	}
	if f.bookmarks[i].DeletedAt == nil {
		return domain.Bookmark{}, domain.ErrBookmarkNotInTrash
	}
	f.bookmarks[i].DeletedAt, f.bookmarks[i].FolderID = nil, nil
	f.bump(userID)
	return f.bookmarks[i], nil
}

func (f *fakeBookmarkStore) EmptyTrash(_ context.Context, userID uuid.UUID) (int64, error) {
	var kept []domain.Bookmark
	var n int64
	for _, b := range f.bookmarks {
		if b.UserID == userID && b.DeletedAt != nil {
			n++
			continue
		}
		kept = append(kept, b)
	}
	f.bookmarks = kept
	if n > 0 {
		f.bump(userID)
	}
	return n, nil
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

// List serves the live list or the trash in the store's own order, honouring After and Limit.
func (f *fakeBookmarkStore) List(_ context.Context, q domain.BookmarkListQuery) ([]domain.Bookmark, error) {
	f.lastList = q
	var rows []domain.Bookmark
	for _, b := range f.bookmarks {
		if b.UserID != q.UserID || (b.DeletedAt != nil) != (q.Mode == domain.ListTrash) {
			continue
		}
		rows = append(rows, b)
	}
	key := func(b domain.Bookmark) time.Time {
		if q.Mode == domain.ListTrash {
			return *b.DeletedAt
		}
		return b.CreatedAt
	}
	sort.Slice(rows, func(i, j int) bool {
		ki, kj := key(rows[i]), key(rows[j])
		if !ki.Equal(kj) {
			return ki.After(kj)
		}
		return rows[i].ID.String() > rows[j].ID.String()
	})
	if q.After != nil {
		var rest []domain.Bookmark
		for _, b := range rows {
			k := key(b)
			if k.Before(q.After.At) || (k.Equal(q.After.At) && b.ID.String() < q.After.ID.String()) {
				rest = append(rest, b)
			}
		}
		rows = rest
	}
	if len(rows) > q.Limit {
		rows = rows[:q.Limit]
	}
	return rows, nil
}

// Search records the query and serves searchRows from the offset, up to the limit.
func (f *fakeBookmarkStore) Search(_ context.Context, q domain.BookmarkSearchQuery) ([]domain.Bookmark, error) {
	f.lastSearch = q
	f.searchCalls++
	rows := f.searchRows
	if q.Offset >= len(rows) {
		return nil, nil
	}
	rows = rows[q.Offset:]
	if len(rows) > q.Limit {
		rows = rows[:q.Limit]
	}
	return rows, nil
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

// fakeFolderStore is an in-memory FolderStore. The rules tests read the existing tree
// and assert what was written, so a fake fits better than a spy. It enforces the
// sibling-name rule the way the unique index does (ignoring case, the folder itself
// excluded) and counts the writes per user, as users.version would.
type fakeFolderStore struct {
	folders  []domain.Folder
	counts   map[uuid.UUID]int // live bookmarks directly in a folder
	versions map[uuid.UUID]int64
	// deletion is what Delete reports.
	deletion domain.FolderDeletion
	// lastCreated and lastUpdate are what the store was asked to write.
	lastCreated domain.Folder
	lastUpdate  domain.FolderUpdate
	updates     int
}

func newFakeFolderStore() *fakeFolderStore {
	return &fakeFolderStore{counts: map[uuid.UUID]int{}, versions: map[uuid.UUID]int64{}}
}

// add stores a folder of user under parent (nil for the top) and returns it. Its depth
// follows from the parent.
func (f *fakeFolderStore) add(user uuid.UUID, parent *domain.Folder, name string) domain.Folder {
	fo := domain.Folder{ID: domain.NewID(), UserID: user, Name: name, Depth: 1}
	if parent != nil {
		fo.ParentID, fo.Depth = &parent.ID, parent.Depth+1
	}
	f.folders = append(f.folders, fo)
	return fo
}

func (f *fakeFolderStore) index(userID, id uuid.UUID) int {
	for i, fo := range f.folders {
		if fo.ID == id && fo.UserID == userID {
			return i
		}
	}
	return -1
}

func (f *fakeFolderStore) withCount(fo domain.Folder) domain.FolderWithCount {
	return domain.FolderWithCount{Folder: fo, BookmarkCount: f.counts[fo.ID]}
}

func sameParent(a, b *uuid.UUID) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

func (f *fakeFolderStore) conflicts(userID uuid.UUID, self uuid.UUID, parent *uuid.UUID, name string) bool {
	for _, o := range f.folders {
		if o.UserID == userID && o.ID != self && sameParent(o.ParentID, parent) && strings.EqualFold(o.Name, name) {
			return true
		}
	}
	return false
}

func (f *fakeFolderStore) List(_ context.Context, userID uuid.UUID) ([]domain.FolderWithCount, error) {
	var out []domain.FolderWithCount
	for _, fo := range f.folders {
		if fo.UserID == userID {
			out = append(out, f.withCount(fo))
		}
	}
	return out, nil
}

func (f *fakeFolderStore) Get(_ context.Context, userID, id uuid.UUID) (domain.FolderWithCount, error) {
	i := f.index(userID, id)
	if i < 0 {
		return domain.FolderWithCount{}, gorm.ErrRecordNotFound
	}
	return f.withCount(f.folders[i]), nil
}

func (f *fakeFolderStore) Subtree(_ context.Context, userID, id uuid.UUID) ([]domain.Folder, error) {
	i := f.index(userID, id)
	if i < 0 {
		return nil, gorm.ErrRecordNotFound
	}
	out := []domain.Folder{f.folders[i]}
	for n := 0; n < len(out); n++ {
		for _, fo := range f.folders {
			if fo.UserID == userID && fo.ParentID != nil && *fo.ParentID == out[n].ID {
				out = append(out, fo)
			}
		}
	}
	return out, nil
}

func (f *fakeFolderStore) Create(_ context.Context, fo domain.Folder) (domain.FolderWithCount, error) {
	f.lastCreated = fo
	if f.conflicts(fo.UserID, fo.ID, fo.ParentID, fo.Name) {
		return domain.FolderWithCount{}, domain.ErrFolderNameConflict
	}
	f.folders = append(f.folders, fo)
	f.versions[fo.UserID]++
	return f.withCount(fo), nil
}

func (f *fakeFolderStore) Update(_ context.Context, userID, id uuid.UUID, u domain.FolderUpdate) (domain.FolderWithCount, error) {
	f.lastUpdate = u
	f.updates++
	i := f.index(userID, id)
	if i < 0 {
		return domain.FolderWithCount{}, gorm.ErrRecordNotFound
	}
	fo := f.folders[i]
	if u.Name.Set {
		fo.Name = u.Name.Value
	}
	if u.ParentID.Set {
		fo.ParentID = nil
		if !u.ParentID.Null {
			p := u.ParentID.Value
			fo.ParentID = &p
		}
	}
	if f.conflicts(userID, id, fo.ParentID, fo.Name) {
		return domain.FolderWithCount{}, domain.ErrFolderNameConflict
	}
	f.folders[i] = fo
	f.versions[userID]++
	return f.withCount(fo), nil
}

func (f *fakeFolderStore) Delete(_ context.Context, userID, id uuid.UUID) (domain.FolderDeletion, error) {
	if f.index(userID, id) < 0 {
		return domain.FolderDeletion{}, gorm.ErrRecordNotFound
	}
	f.versions[userID]++
	return f.deletion, nil
}

// fakeFaviconStore returns a fixed favicon or error and records the ids it was asked for.
type fakeFaviconStore struct {
	favicon             domain.Favicon
	err                 error
	gotUser, gotFavicon uuid.UUID
}

func (f *fakeFaviconStore) Find(_ context.Context, userID, id uuid.UUID) (domain.Favicon, error) {
	f.gotUser, f.gotFavicon = userID, id
	return f.favicon, f.err
}
