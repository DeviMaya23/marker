package handler

import (
	"context"

	"github.com/google/uuid"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/handler/middleware"
)

// AccountService is what the account operation calls. It is satisfied by usecase.AccountService.
type AccountService interface {
	Delete(ctx context.Context, userID uuid.UUID) error
}

// DeleteAccount implements DELETE /api/v1/account; it shadows the 501 stub. The CSRF
// parameter is already checked by the router.
func (s *Server) DeleteAccount(ctx context.Context, _ api.DeleteAccountRequestObject) (api.DeleteAccountResponseObject, error) {
	auth, ok := middleware.AuthFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	if err := s.account.Delete(ctx, auth.UserID); err != nil {
		return nil, err
	}
	return api.DeleteAccount204Response{}, nil
}
