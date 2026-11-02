package middleware

import (
	"context"

	"github.com/google/uuid"
)

// Cookie and header names shared by the middleware and the handlers that set the cookies.
const (
	SessionCookie = "session"
	CSRFCookie    = "csrf_token"
	CSRFHeader    = "X-CSRF-Token"
)

// Auth identifies the caller of an authenticated request.
type Auth struct {
	UserID    uuid.UUID
	SessionID uuid.UUID
}

type authKey struct{}

// WithAuth returns a context carrying the caller's identity.
func WithAuth(ctx context.Context, a Auth) context.Context {
	return context.WithValue(ctx, authKey{}, a)
}

// AuthFrom returns the caller's identity. It is present on every route behind the
// Session middleware, which is every route except the public auth routes.
func AuthFrom(ctx context.Context) (Auth, bool) {
	a, ok := ctx.Value(authKey{}).(Auth)
	return a, ok
}
