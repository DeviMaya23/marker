package handler

import (
	"context"

	"github.com/labstack/echo/v4"

	"marker/internal/handler/middleware"
)

// The callback needs the login_binding cookie, but the contract does not declare it as a
// parameter, so the generated code does not hand it over. recordLoginBinding is an
// operation middleware (authCallback only) that reads the cookie and puts its value in the
// request context; the handler reads it from there.
//
// An absent cookie is not an error here: the handler decides, and every failure looks the
// same to the caller. Request.Cookie is used, so a cookie Go's parser drops counts as
// absent, the first parseable cookie of that name wins, and quotes around a value are
// stripped.

type loginBindingKey struct{}

func recordLoginBinding(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		req := c.Request()
		if ck, err := req.Cookie(middleware.LoginBindingCookie); err == nil {
			c.SetRequest(req.WithContext(context.WithValue(req.Context(), loginBindingKey{}, ck.Value)))
		}
		return next(c)
	}
}

// loginBindingFrom returns the recorded cookie value, or "" when there was none.
func loginBindingFrom(ctx context.Context) string {
	v, _ := ctx.Value(loginBindingKey{}).(string)
	return v
}
