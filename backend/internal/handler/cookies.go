package handler

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"marker/internal/handler/middleware"
	"marker/internal/usecase"
)

// authCookies builds the two cookies that make up a login (NFR-13, NFR-15): the
// HttpOnly session cookie, and the csrf_token cookie the frontend reads and echoes
// back in the X-CSRF-Token header. Both live as long as the session's absolute limit;
// the server decides when the session actually expires.
//
// secure should be true whenever the app is served over https.
func authCookies(grant usecase.Grant, secure bool) (session, csrf *http.Cookie) {
	maxAge := int(time.Until(grant.ExpiresAt).Seconds())

	session = &http.Cookie{
		Name:     middleware.SessionCookie,
		Value:    grant.Token,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	}
	csrf = &http.Cookie{
		Name:     middleware.CSRFCookie,
		Value:    grant.CSRFToken,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: false, // the frontend must be able to read it
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	}
	return session, csrf
}

// setAuthCookies sets the login cookies on an Echo response (dev login).
func setAuthCookies(c echo.Context, grant usecase.Grant, secure bool) {
	session, csrf := authCookies(grant, secure)
	c.SetCookie(session)
	c.SetCookie(csrf)
}

// loginBindingPath is where the binding cookie is sent: only the callback needs it.
const loginBindingPath = "/auth/callback"

// loginBindingCookie builds the cookie /auth/login sets so that only this browser can
// finish the attempt. maxAge is in seconds and must be positive: a zero would omit
// Max-Age and make a session cookie.
func loginBindingCookie(value string, maxAge int, secure bool) *http.Cookie {
	return &http.Cookie{
		Name:     middleware.LoginBindingCookie,
		Value:    value,
		Path:     loginBindingPath,
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	}
}

// clearLoginBindingCookie clears the binding cookie. It differs from loginBindingCookie
// only in value and MaxAge.
func clearLoginBindingCookie(secure bool) *http.Cookie {
	return loginBindingCookie("", -1, secure)
}
