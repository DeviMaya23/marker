package usecase

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"marker/internal/domain"
)

// AccountService erases a user's app data.
type AccountService struct {
	store interface {
		// DeleteUser removes the user and, by cascade, everything they own.
		// gorm.ErrRecordNotFound means no such user.
		DeleteUser(ctx context.Context, userID uuid.UUID) error
	}
}

func NewAccountService(store interface {
	DeleteUser(ctx context.Context, userID uuid.UUID) error
}) *AccountService {
	return &AccountService{store: store}
}

// Delete erases the user's data (FR-25). A user whose row is already gone is
// unauthenticated, not "not found": the contract lists no 404 for this operation.
func (s *AccountService) Delete(ctx context.Context, userID uuid.UUID) error {
	err := s.store.DeleteUser(ctx, userID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return domain.ErrUnauthenticated
	}
	return err
}
