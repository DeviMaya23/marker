package usecase

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"

	"marker/internal/domain"
)

// UserStore finds or creates the user for an identity provider subject.
type UserStore interface {
	FindOrCreateUserByIdpID(ctx context.Context, idpID string) (domain.User, error)
}

// Grant is what a new session hands back to the HTTP layer: the secret values for
// the two cookies, and when they should expire.
type Grant struct {
	Token     string    // value of the HttpOnly session cookie
	CSRFToken string    // value of the readable csrf_token cookie
	ExpiresAt time.Time // the session's absolute limit, used as the cookie lifetime
}

// AuthService starts and checks login sessions.
type AuthService struct {
	users    UserStore
	sessions SessionStore
	now      func() time.Time
}

func NewAuthService(users UserStore, sessions SessionStore) *AuthService {
	return &AuthService{users: users, sessions: sessions, now: time.Now}
}

// StartSession creates a session for the identity provider subject idpID, creating
// the user on first login. Only a hash of the session token is stored.
func (s *AuthService) StartSession(ctx context.Context, idpID string) (Grant, error) {
	user, err := s.users.FindOrCreateUserByIdpID(ctx, idpID)
	if err != nil {
		return Grant{}, fmt.Errorf("find or create user: %w", err)
	}

	token, err := randomToken()
	if err != nil {
		return Grant{}, err
	}
	csrf, err := randomToken()
	if err != nil {
		return Grant{}, err
	}

	now := s.now()
	session := domain.Session{
		ID:                domain.NewID(),
		UserID:            user.ID,
		TokenHash:         hashToken(token),
		CreatedAt:         now,
		LastSeenAt:        now,
		ExpiresAt:         now.Add(domain.SessionIdleTimeout),
		AbsoluteExpiresAt: now.Add(domain.SessionMaxLifetime),
	}
	if err := s.sessions.CreateSession(ctx, session); err != nil {
		return Grant{}, fmt.Errorf("create session: %w", err)
	}

	// Housekeeping while we are here. A failure must not block the login.
	_ = s.sessions.DeleteExpiredSessions(ctx, now)

	return Grant{Token: token, CSRFToken: csrf, ExpiresAt: session.AbsoluteExpiresAt}, nil
}

// Authenticate returns the session for a cookie token, or domain.ErrUnauthenticated if
// there is none or it has expired. A valid session's sliding expiry is extended, but at
// most once per domain.SessionTouchInterval.
func (s *AuthService) Authenticate(ctx context.Context, token string) (domain.Session, error) {
	if token == "" {
		return domain.Session{}, domain.ErrUnauthenticated
	}

	session, err := s.sessions.FindSessionByTokenHash(ctx, hashToken(token))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return domain.Session{}, domain.ErrUnauthenticated
	}
	if err != nil {
		return domain.Session{}, fmt.Errorf("find session: %w", err)
	}

	now := s.now()
	if session.Expired(now) {
		return domain.Session{}, domain.ErrUnauthenticated
	}

	if now.Sub(session.LastSeenAt) >= domain.SessionTouchInterval {
		expiresAt := session.NextExpiry(now)
		if err := s.sessions.TouchSession(ctx, session.ID, now, expiresAt); err != nil {
			return domain.Session{}, fmt.Errorf("touch session: %w", err)
		}
		session.LastSeenAt = now
		session.ExpiresAt = expiresAt
	}
	return session, nil
}

// randomToken returns 32 random bytes, URL-safe base64 encoded.
func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}
