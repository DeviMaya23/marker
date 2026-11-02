package handler

import (
	"context"
	"net/http"
	"regexp"

	"github.com/labstack/echo/v4"

	"marker/internal/usecase"
)

// SessionStarter creates a session for an identity provider subject.
type SessionStarter interface {
	StartSession(ctx context.Context, idpID string) (usecase.Grant, error)
}

var devNamePattern = regexp.MustCompile(`^[a-z0-9_-]{1,32}$`)

// DevLogin is a login that skips the identity provider, for local development only.
// GET /auth/dev-login?name=alice signs in as the user "dev|alice", creating it if
// needed, then redirects to return_to. It is not part of openapi.yaml.
//
// It is registered only when APP_ENV=development and AUTH_DEV_LOGIN=true (see
// config.Validate and main). Never register it any other way.
type DevLogin struct {
	sessions SessionStarter
	secure   bool
}

func NewDevLogin(sessions SessionStarter, secureCookies bool) *DevLogin {
	return &DevLogin{sessions: sessions, secure: secureCookies}
}

func (d *DevLogin) Handle(c echo.Context) error {
	name := c.QueryParam("name")
	if !devNamePattern.MatchString(name) {
		return echo.NewHTTPError(http.StatusBadRequest)
	}

	grant, err := d.sessions.StartSession(c.Request().Context(), "dev|"+name)
	if err != nil {
		return err
	}
	setAuthCookies(c, grant, d.secure)
	return c.Redirect(http.StatusFound, safeReturnTo(c.QueryParam("return_to")))
}
