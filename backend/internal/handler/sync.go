package handler

import (
	"context"

	"github.com/google/uuid"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/handler/middleware"
)

// SyncService is what the sync operation calls. It is satisfied by usecase.SyncService.
type SyncService interface {
	Version(ctx context.Context, userID uuid.UUID) (int64, error)
}

// GetSyncVersion implements GET /api/v1/sync/version; it shadows the 501 stub.
func (s *Server) GetSyncVersion(ctx context.Context, _ api.GetSyncVersionRequestObject) (api.GetSyncVersionResponseObject, error) {
	auth, ok := middleware.AuthFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	v, err := s.sync.Version(ctx, auth.UserID)
	if err != nil {
		return nil, err
	}
	return api.GetSyncVersion200JSONResponse{Version: int(v)}, nil
}
