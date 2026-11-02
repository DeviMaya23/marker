package domain

import (
	"time"

	"github.com/google/uuid"
)

const (
	// SessionIdleTimeout is how long a session stays valid after its last use (NFR-15).
	SessionIdleTimeout = 30 * 24 * time.Hour
	// SessionMaxLifetime is the absolute limit, however often the session is used (NFR-15).
	SessionMaxLifetime = 90 * 24 * time.Hour
	// SessionTouchInterval is the least time between sliding-expiry updates, so that
	// frequent requests (the sync poll) do not each write to the database.
	SessionTouchInterval = time.Hour
)

// Session is a server-side login session. TokenHash is the SHA-256 of the token held
// in the user's cookie; the token itself is never stored.
type Session struct {
	ID                uuid.UUID `gorm:"column:id;primaryKey"`
	UserID            uuid.UUID `gorm:"column:user_id"`
	TokenHash         []byte    `gorm:"column:token_hash"`
	CreatedAt         time.Time `gorm:"column:created_at"`
	LastSeenAt        time.Time `gorm:"column:last_seen_at"`
	ExpiresAt         time.Time `gorm:"column:expires_at"`
	AbsoluteExpiresAt time.Time `gorm:"column:absolute_expires_at"`
}

func (Session) TableName() string { return "sessions" }

// Expired reports whether the session is no longer valid at now.
func (s Session) Expired(now time.Time) bool {
	return !now.Before(s.ExpiresAt) || !now.Before(s.AbsoluteExpiresAt)
}

// NextExpiry is the sliding expiry for a session used at now: the idle timeout from
// now, but never later than the absolute limit.
func (s Session) NextExpiry(now time.Time) time.Time {
	next := now.Add(SessionIdleTimeout)
	if next.After(s.AbsoluteExpiresAt) {
		return s.AbsoluteExpiresAt
	}
	return next
}
