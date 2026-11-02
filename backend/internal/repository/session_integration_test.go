//go:build integration

package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/domain"
	"marker/internal/repository"
	"marker/internal/testutil"
)

func newSession(user domain.User, hash string, now time.Time) domain.Session {
	return domain.Session{
		ID:                domain.NewID(),
		UserID:            user.ID,
		TokenHash:         []byte(hash),
		CreatedAt:         now,
		LastSeenAt:        now,
		ExpiresAt:         now.Add(domain.SessionIdleTimeout),
		AbsoluteExpiresAt: now.Add(domain.SessionMaxLifetime),
	}
}

func TestSessionRepository_CreateFindTouchDelete(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewSessionRepository(db)
	ctx := context.Background()
	user := newUser(t, db)
	now := time.Now().UTC().Truncate(time.Microsecond)

	hash := "hash-" + domain.NewID().String()
	session := newSession(user, hash, now)
	require.NoError(t, repo.CreateSession(ctx, session))

	t.Run("finds by token hash", func(t *testing.T) {
		got, err := repo.FindSessionByTokenHash(ctx, []byte(hash))
		require.NoError(t, err)
		require.Equal(t, session.ID, got.ID)
		require.Equal(t, user.ID, got.UserID)
		require.WithinDuration(t, session.AbsoluteExpiresAt, got.AbsoluteExpiresAt, time.Millisecond)
	})

	t.Run("an unknown hash is not found", func(t *testing.T) {
		_, err := repo.FindSessionByTokenHash(ctx, []byte("no-such-hash"))
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	})

	t.Run("touch updates last seen and expiry", func(t *testing.T) {
		later := now.Add(2 * time.Hour)
		require.NoError(t, repo.TouchSession(ctx, session.ID, later, later.Add(domain.SessionIdleTimeout)))

		got, err := repo.FindSessionByTokenHash(ctx, []byte(hash))
		require.NoError(t, err)
		require.WithinDuration(t, later, got.LastSeenAt, time.Millisecond)
		require.WithinDuration(t, later.Add(domain.SessionIdleTimeout), got.ExpiresAt, time.Millisecond)
	})

	t.Run("delete removes the session", func(t *testing.T) {
		require.NoError(t, repo.DeleteSession(ctx, session.ID))
		_, err := repo.FindSessionByTokenHash(ctx, []byte(hash))
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	})
}

func TestSessionRepository_DeleteExpiredSessions(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewSessionRepository(db)
	ctx := context.Background()
	user := newUser(t, db)
	now := time.Now().UTC()

	live := newSession(user, "live-"+domain.NewID().String(), now)
	idleExpired := newSession(user, "idle-"+domain.NewID().String(), now)
	idleExpired.ExpiresAt = now.Add(-time.Minute)
	absoluteExpired := newSession(user, "abs-"+domain.NewID().String(), now)
	absoluteExpired.AbsoluteExpiresAt = now.Add(-time.Minute)
	for _, s := range []domain.Session{live, idleExpired, absoluteExpired} {
		require.NoError(t, repo.CreateSession(ctx, s))
	}

	require.NoError(t, repo.DeleteExpiredSessions(ctx, now))

	_, err := repo.FindSessionByTokenHash(ctx, live.TokenHash)
	require.NoError(t, err)
	_, err = repo.FindSessionByTokenHash(ctx, idleExpired.TokenHash)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	_, err = repo.FindSessionByTokenHash(ctx, absoluteExpired.TokenHash)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
}

func TestSessionRepository_DeletingUserRemovesTheirSessions(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewSessionRepository(db)
	ctx := context.Background()
	user := newUser(t, db)

	s := newSession(user, "cascade-"+domain.NewID().String(), time.Now().UTC())
	require.NoError(t, repo.CreateSession(ctx, s))

	require.NoError(t, db.Delete(&domain.User{}, "id = ?", user.ID).Error)

	_, err := repo.FindSessionByTokenHash(ctx, s.TokenHash)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
}

func TestUserRepository_FindOrCreateUserByIdpID(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()
	idpID := "idp|" + domain.NewID().String()

	first, err := repo.FindOrCreateUserByIdpID(ctx, idpID)
	require.NoError(t, err)
	require.Equal(t, idpID, first.IdpID)

	second, err := repo.FindOrCreateUserByIdpID(ctx, idpID)
	require.NoError(t, err)
	require.Equal(t, first.ID, second.ID, "the same subject must map to the same user")

	other, err := repo.FindOrCreateUserByIdpID(ctx, idpID+"-other")
	require.NoError(t, err)
	require.NotEqual(t, first.ID, other.ID)
}
