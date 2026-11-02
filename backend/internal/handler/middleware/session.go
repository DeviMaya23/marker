package middleware

import (
	"context"

	"github.com/labstack/echo/v4"

	"marker/internal/domain"
)

// Authenticator turns a session cookie value into a session. It returns
// domain.ErrUnauthenticated for a missing, unknown or expired session.
type Authenticator interface {
	Authenticate(ctx context.Context, token string) (domain.Session, error)
}

// Session requires a valid session cookie and puts the caller's identity in the
// request context (see AuthFrom). Without one it returns domain.ErrUnauthenticated,
// which the error handler renders as 401 unauthenticated.
func Session(auth Authenticator) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			cookie, err := c.Cookie(SessionCookie)
			if err != nil {
				return domain.ErrUnauthenticated
			}

			session, err := auth.Authenticate(c.Request().Context(), cookie.Value)
			if err != nil {
				return err
			}

			ctx := WithAuth(c.Request().Context(), Auth{UserID: session.UserID, SessionID: session.ID})
			c.SetRequest(c.Request().WithContext(ctx))
			return next(c)
		}
	}
}
