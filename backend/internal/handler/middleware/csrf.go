package middleware

import (
	"crypto/subtle"
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"
)

// ErrCSRFFailed is returned when a state-changing request fails the CSRF check.
// The error handler renders it as 403 csrf_failed.
var ErrCSRFFailed = errors.New("csrf check failed")

// CSRF protects state-changing requests (NFR-13). Anything other than GET, HEAD and
// OPTIONS must:
//   - carry an Origin header equal to allowedOrigin, and
//   - send the csrf_token cookie's value back in the X-CSRF-Token header.
//
// A missing Origin fails, because browsers send it on every cross-origin write.
func CSRF(allowedOrigin string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			switch c.Request().Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				return next(c)
			}

			origin := c.Request().Header.Get("Origin")
			if origin == "" || origin != allowedOrigin {
				return ErrCSRFFailed
			}

			cookie, err := c.Cookie(CSRFCookie)
			header := c.Request().Header.Get(CSRFHeader)
			if err != nil || cookie.Value == "" ||
				subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(header)) != 1 {
				return ErrCSRFFailed
			}
			return next(c)
		}
	}
}
