package middleware

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"

	"marker/internal/domain"
)

// stubAuthenticator accepts exactly one token.
type stubAuthenticator struct {
	token   string
	session domain.Session
	err     error
}

func (s stubAuthenticator) Authenticate(_ context.Context, token string) (domain.Session, error) {
	if s.err != nil {
		return domain.Session{}, s.err
	}
	if token != s.token {
		return domain.Session{}, domain.ErrUnauthenticated
	}
	return s.session, nil
}

func sessionRequest(token string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/bookmarks", nil)
	if token != "" {
		req.AddCookie(&http.Cookie{Name: SessionCookie, Value: token})
	}
	return req
}

func TestSession_NoCookieIsUnauthenticated(t *testing.T) {
	mw := Session(stubAuthenticator{token: "good"})
	err := runMiddleware(mw, sessionRequest(""))
	require.ErrorIs(t, err, domain.ErrUnauthenticated)
}

func TestSession_UnknownTokenIsUnauthenticated(t *testing.T) {
	mw := Session(stubAuthenticator{token: "good"})
	err := runMiddleware(mw, sessionRequest("bad"))
	require.ErrorIs(t, err, domain.ErrUnauthenticated)
}

func TestSession_AuthenticatorFailureIsPassedThrough(t *testing.T) {
	boom := errors.New("database down")
	mw := Session(stubAuthenticator{err: boom})
	err := runMiddleware(mw, sessionRequest("anything"))
	require.ErrorIs(t, err, boom)
}

func TestSession_ValidTokenPutsCallerInContext(t *testing.T) {
	session := domain.Session{ID: uuid.New(), UserID: uuid.New()}
	mw := Session(stubAuthenticator{token: "good", session: session})

	c := echo.New().NewContext(sessionRequest("good"), httptest.NewRecorder())
	var got Auth
	var found bool
	err := mw(func(c echo.Context) error {
		got, found = AuthFrom(c.Request().Context())
		return nil
	})(c)

	require.NoError(t, err)
	require.True(t, found)
	require.Equal(t, Auth{UserID: session.UserID, SessionID: session.ID}, got)
}
