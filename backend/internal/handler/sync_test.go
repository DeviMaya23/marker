package handler

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"

	"marker/internal/api"
	"marker/internal/domain"
)

// syncSpy is a value-return spy for SyncService.
type syncSpy struct {
	version int64
	err     error
	gotUser uuid.UUID
	calls   int
}

func (s *syncSpy) Version(_ context.Context, userID uuid.UUID) (int64, error) {
	s.gotUser = userID
	s.calls++
	return s.version, s.err
}

func syncRouter(spy *syncSpy) *echo.Echo {
	return NewRouter(Deps{Server: NewServer(nil, nil, spy, nil, nil), Auth: authFor{}, AppOrigin: testOrigin})
}

const syncPath = "/api/v1/sync/version"

func TestGetSyncVersion_OK(t *testing.T) {
	for _, tc := range []struct {
		name    string
		version int64
		body    string
	}{
		{"a number", 7, `{"version":7}`},
		{"zero keeps the key", 0, `{"version":0}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			spy := &syncSpy{version: tc.version}

			rec := do(syncRouter(spy), http.MethodGet, syncPath, withSession(goodSession))

			require.Equal(t, http.StatusOK, rec.Code)
			require.Equal(t, "application/json", rec.Header().Get("Content-Type"))
			require.JSONEq(t, tc.body, rec.Body.String())
			require.Equal(t, callerID, spy.gotUser, "the session's user")
		})
	}
}

func TestGetSyncVersion_Errors(t *testing.T) {
	t.Run("user gone is 401", func(t *testing.T) {
		spy := &syncSpy{err: domain.ErrUnauthenticated}
		rec := do(syncRouter(spy), http.MethodGet, syncPath, withSession(goodSession))
		requireProblem(t, rec, http.StatusUnauthorized, api.ErrorCodeUnauthenticated)
	})

	t.Run("unclassified error is 500", func(t *testing.T) {
		spy := &syncSpy{err: errors.New("db exploded")}
		rec := do(syncRouter(spy), http.MethodGet, syncPath, withSession(goodSession))
		requireProblem(t, rec, http.StatusInternalServerError, api.ErrorCodeInternalError)
	})
}

func TestGetSyncVersion_NoCookie(t *testing.T) {
	spy := &syncSpy{version: 3}

	rec := do(syncRouter(spy), http.MethodGet, syncPath)

	requireProblem(t, rec, http.StatusUnauthorized, api.ErrorCodeUnauthenticated)
	require.Zero(t, spy.calls)
}

func TestGetSyncVersion_IgnoresQueryAndHeaders(t *testing.T) {
	spy := &syncSpy{version: 7}

	rec := do(syncRouter(spy), http.MethodGet, syncPath+"?version=5", withSession(goodSession),
		func(r *http.Request) { r.Header.Set("X-Unrelated", "1") })

	require.Equal(t, http.StatusOK, rec.Code)
	require.JSONEq(t, `{"version":7}`, rec.Body.String())
	require.Equal(t, callerID, spy.gotUser)
	require.Equal(t, 1, spy.calls)
}
