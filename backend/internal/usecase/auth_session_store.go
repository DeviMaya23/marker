package usecase

import (
	"context"
	"time"

	"github.com/google/uuid"

	"marker/internal/domain"
)

// SessionStore is the persistence AuthService needs for sessions. FindSessionByTokenHash
// returns gorm.ErrRecordNotFound when no session matches.
type SessionStore interface {
	CreateSession(ctx context.Context, s domain.Session) error
	FindSessionByTokenHash(ctx context.Context, hash []byte) (domain.Session, error)
	TouchSession(ctx context.Context, id uuid.UUID, lastSeenAt, expiresAt time.Time) error
	DeleteSession(ctx context.Context, id uuid.UUID) error
	DeleteExpiredSessions(ctx context.Context, now time.Time) error
}
