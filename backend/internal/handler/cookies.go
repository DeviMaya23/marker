package handler

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"marker/internal/handler/middleware"
	"marker/internal/usecase"
)

// setAuthCookies sets the two cookies that make up a login (NFR-13, NFR-15): the
// HttpOnly session cookie, and the csrf_token cookie the frontend reads and echoes
// back in the X-CSRF-Token header. Both live as long as the session's absolute limit;
// the server decides when the session actually expires.
//
// secure should be true whenever the app is served over https.
func setAuthCookies(c echo.Context, grant usecase.Grant, secure bool) {
	maxAge := int(time.Until(grant.ExpiresAt).Seconds())

	c.SetCookie(&http.Cookie{
		Name:     middleware.SessionCookie,
		Value:    grant.Token,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
	c.SetCookie(&http.Cookie{
		Name:     middleware.CSRFCookie,
		Value:    grant.CSRFToken,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: false, // the frontend must be able to read it
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}
