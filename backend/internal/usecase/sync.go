package usecase

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"marker/internal/domain"
)

// versionStore reads a user's change counter. gorm.ErrRecordNotFound means no such user.
type versionStore interface {
	Version(ctx context.Context, userID uuid.UUID) (int64, error)
}

// SyncService answers the sync poll.
type SyncService struct {
	store versionStore
}

func NewSyncService(store versionStore) *SyncService {
	return &SyncService{store: store}
}

// Version returns the user's change counter. A user whose row is gone is unauthenticated,
// not "not found": the contract lists no 404 for this operation.
func (s *SyncService) Version(ctx context.Context, userID uuid.UUID) (int64, error) {
	v, err := s.store.Version(ctx, userID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, domain.ErrUnauthenticated
	}
	return v, err
}
