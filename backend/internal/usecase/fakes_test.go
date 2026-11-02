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
