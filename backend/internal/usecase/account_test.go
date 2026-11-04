package usecase

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/domain"
)

// deleteSpy is a value-return spy for the account store.
type deleteSpy struct {
	err   error
	got   uuid.UUID
	calls int
}

func (s *deleteSpy) DeleteUser(_ context.Context, userID uuid.UUID) error {
	s.got = userID
	s.calls++
	return s.err
}

func TestAccountService_Delete(t *testing.T) {
	t.Run("user row gone is unauthenticated, not the gorm error", func(t *testing.T) {
		err := NewAccountService(&deleteSpy{err: gorm.ErrRecordNotFound}).Delete(context.Background(), uuid.New())

		require.ErrorIs(t, err, domain.ErrUnauthenticated)
		require.NotErrorIs(t, err, gorm.ErrRecordNotFound)
	})

	// Deliberate exception to the pass-through rule in TESTING.md: pins the boundary
	// of the mapping above (task file).
	t.Run("any other store error is returned unchanged", func(t *testing.T) {
		boom := errors.New("connection refused")

		err := NewAccountService(&deleteSpy{err: boom}).Delete(context.Background(), uuid.New())

		require.ErrorIs(t, err, boom)
		require.NotErrorIs(t, err, domain.ErrUnauthenticated)
	})

	t.Run("the store gets the given user id, once", func(t *testing.T) {
		spy := &deleteSpy{}
		id := uuid.New()

		require.NoError(t, NewAccountService(spy).Delete(context.Background(), id))

		require.Equal(t, id, spy.got)
		require.Equal(t, 1, spy.calls)
	})
}
