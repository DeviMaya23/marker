package usecase

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"marker/internal/domain"
)

var t0 = time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

const day = 24 * time.Hour

// newTestAuth returns a service whose clock the test controls by setting *now.
func newTestAuth() (*AuthService, *fakeSessionStore, *fakeUserStore, *time.Time) {
	users, sessions := newFakeUserStore(), newFakeSessionStore()
	svc := NewAuthService(users, sessions)
	now := t0
	svc.now = func() time.Time { return now }
	return svc, sessions, users, &now
}

func TestAuthService_StartSession(t *testing.T) {
	svc, sessions, users, _ := newTestAuth()

	grant, err := svc.StartSession(context.Background(), "idp|alice")
	require.NoError(t, err)

	t.Run("stores a hash of the token, never the token", func(t *testing.T) {
		require.Len(t, sessions.sessions, 1)
		for _, s := range sessions.sessions {
			require.Equal(t, hashToken(grant.Token), s.TokenHash)
			require.NotEqual(t, []byte(grant.Token), s.TokenHash)
		}
		require.NotEmpty(t, grant.Token)
		require.NotEmpty(t, grant.CSRFToken)
		require.NotEqual(t, grant.Token, grant.CSRFToken)
	})

	t.Run("sets the sliding and absolute limits", func(t *testing.T) {
		for _, s := range sessions.sessions {
			require.Equal(t, t0.Add(30*day), s.ExpiresAt)
			require.Equal(t, t0.Add(90*day), s.AbsoluteExpiresAt)
			require.Equal(t, s.AbsoluteExpiresAt, grant.ExpiresAt)
		}
	})

	t.Run("a second login reuses the user", func(t *testing.T) {
		_, err := svc.StartSession(context.Background(), "idp|alice")
		require.NoError(t, err)
		require.Len(t, users.users, 1)
		require.Len(t, sessions.sessions, 2)
	})
}

func TestAuthService_Authenticate_Rejects(t *testing.T) {
	ctx := context.Background()

	t.Run("an empty token", func(t *testing.T) {
		svc, _, _, _ := newTestAuth()
		_, err := svc.Authenticate(ctx, "")
		require.ErrorIs(t, err, domain.ErrUnauthenticated)
	})

	t.Run("an unknown token", func(t *testing.T) {
		svc, _, _, _ := newTestAuth()
		_, err := svc.Authenticate(ctx, "not-a-real-token")
		require.ErrorIs(t, err, domain.ErrUnauthenticated)
	})

	t.Run("a session unused for longer than the idle timeout", func(t *testing.T) {
		svc, _, _, now := newTestAuth()
		grant, err := svc.StartSession(ctx, "idp|alice")
		require.NoError(t, err)

		*now = t0.Add(31 * day)
		_, err = svc.Authenticate(ctx, grant.Token)
		require.ErrorIs(t, err, domain.ErrUnauthenticated)
	})
}

func TestAuthService_Authenticate_SlidingExpiry(t *testing.T) {
	ctx := context.Background()

	t.Run("a recent session is returned without a database write", func(t *testing.T) {
		svc, sessions, _, now := newTestAuth()
		grant, err := svc.StartSession(ctx, "idp|alice")
		require.NoError(t, err)

		*now = t0.Add(30 * time.Minute)
		_, err = svc.Authenticate(ctx, grant.Token)
		require.NoError(t, err)
		require.Zero(t, sessions.touches)
	})

	t.Run("use after the touch interval extends the expiry", func(t *testing.T) {
		svc, sessions, _, now := newTestAuth()
		grant, err := svc.StartSession(ctx, "idp|alice")
		require.NoError(t, err)

		*now = t0.Add(10 * day)
		session, err := svc.Authenticate(ctx, grant.Token)
		require.NoError(t, err)

		require.Equal(t, 1, sessions.touches)
		require.Equal(t, t0.Add(40*day), session.ExpiresAt)
		require.Equal(t, t0.Add(40*day), sessions.sessions[session.ID].ExpiresAt)

		// The extension is real: the session now outlives its original 30 days.
		*now = t0.Add(35 * day)
		_, err = svc.Authenticate(ctx, grant.Token)
		require.NoError(t, err)
	})

	t.Run("never extends past the absolute limit", func(t *testing.T) {
		svc, _, _, now := newTestAuth()
		grant, err := svc.StartSession(ctx, "idp|alice")
		require.NoError(t, err)

		var last domain.Session
		for _, elapsed := range []time.Duration{25 * day, 50 * day, 75 * day} {
			*now = t0.Add(elapsed)
			last, err = svc.Authenticate(ctx, grant.Token)
			require.NoError(t, err)
		}
		require.Equal(t, t0.Add(90*day), last.ExpiresAt)

		*now = t0.Add(91 * day)
		_, err = svc.Authenticate(ctx, grant.Token)
		require.ErrorIs(t, err, domain.ErrUnauthenticated)
	})
}

func TestAuthService_EndSession(t *testing.T) {
	ctx := context.Background()
	svc, sessions, _, _ := newTestAuth()
	_, err := svc.StartSession(ctx, "idp|alice")
	require.NoError(t, err)
	_, err = svc.StartSession(ctx, "idp|alice")
	require.NoError(t, err)
	require.Len(t, sessions.sessions, 2)
	var id uuid.UUID
	for sid := range sessions.sessions {
		id = sid
	}

	require.NoError(t, svc.EndSession(ctx, id))
	require.Len(t, sessions.sessions, 1, "only that session is deleted")
	require.NotContains(t, sessions.sessions, id)

	require.NoError(t, svc.EndSession(ctx, id), "a session already gone is not an error")
}
