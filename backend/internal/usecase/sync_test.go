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

// versionSpy is a value-return spy for versionStore.
type versionSpy struct {
	version int64
	err     error
}

func (s versionSpy) Version(context.Context, uuid.UUID) (int64, error) { return s.version, s.err }

func TestSyncService_Version(t *testing.T) {
	t.Run("user row gone is unauthenticated, not the gorm error", func(t *testing.T) {
		_, err := NewSyncService(versionSpy{err: gorm.ErrRecordNotFound}).Version(context.Background(), uuid.New())

		require.ErrorIs(t, err, domain.ErrUnauthenticated)
		require.NotErrorIs(t, err, gorm.ErrRecordNotFound)
	})

	t.Run("any other store error is returned unchanged", func(t *testing.T) {
		boom := errors.New("connection refused")

		_, err := NewSyncService(versionSpy{err: boom}).Version(context.Background(), uuid.New())

		require.ErrorIs(t, err, boom)
		require.NotErrorIs(t, err, domain.ErrUnauthenticated)
	})
}
