package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"marker/internal/domain"
)

// SessionRepository is the database access for login sessions. Sessions are looked
// up by token hash, not by user, so these methods do not filter by user_id.
type SessionRepository struct {
	db *gorm.DB
}

func NewSessionRepository(db *gorm.DB) *SessionRepository {
	return &SessionRepository{db: db}
}

func (r *SessionRepository) CreateSession(ctx context.Context, s domain.Session) error {
	return r.db.WithContext(ctx).Create(&s).Error
}

// FindSessionByTokenHash returns gorm.ErrRecordNotFound when no session matches.
func (r *SessionRepository) FindSessionByTokenHash(ctx context.Context, hash []byte) (domain.Session, error) {
	var s domain.Session
	err := r.db.WithContext(ctx).Where("token_hash = ?", hash).First(&s).Error
	return s, err
}

func (r *SessionRepository) TouchSession(ctx context.Context, id uuid.UUID, lastSeenAt, expiresAt time.Time) error {
	return r.db.WithContext(ctx).
		Model(&domain.Session{}).
		Where("id = ?", id).
		Updates(map[string]any{"last_seen_at": lastSeenAt, "expires_at": expiresAt}).Error
}

func (r *SessionRepository) DeleteSession(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&domain.Session{}).Error
}

func (r *SessionRepository) DeleteExpiredSessions(ctx context.Context, now time.Time) error {
	return r.db.WithContext(ctx).
		Where("expires_at <= ? OR absolute_expires_at <= ?", now, now).
		Delete(&domain.Session{}).Error
}
