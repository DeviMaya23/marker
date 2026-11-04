package handler

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/api"
	"marker/internal/domain"
)

// faviconSpy is a value-return spy for FaviconService.
type faviconSpy struct {
	favicon domain.Favicon
	err     error
	gotUser uuid.UUID
	gotID   uuid.UUID
	calls   int
}

func (s *faviconSpy) Get(_ context.Context, userID, id uuid.UUID) (domain.Favicon, error) {
	s.gotUser, s.gotID = userID, id
	s.calls++
	return s.favicon, s.err
}

func faviconRouter(spy *faviconSpy) *echo.Echo {
	return NewRouter(Deps{Server: NewServer(nil, nil, nil, spy), Auth: authFor{}, AppOrigin: testOrigin})
}

func faviconPath(id uuid.UUID) string { return "/api/v1/favicons/" + id.String() }

// wantETag computes the validator from the contract rule, independently of the handler.
func wantETag(contentType string, data []byte) string {
	sum := sha256.Sum256(append([]byte(contentType+"\n"), data...))
	return fmt.Sprintf(`"%x"`, sum)
}

var etagForm = regexp.MustCompile(`^"[0-9a-f]{64}"$`)

var faviconTypes = []string{"image/png", "image/jpeg", "image/gif", "image/webp", "image/x-icon"}

func TestGetFavicon_OK(t *testing.T) {
	data := []byte{0x00, 0xFF, 0x89, 0x01}
	for _, ct := range faviconTypes {
		t.Run(ct, func(t *testing.T) {
			spy := &faviconSpy{favicon: domain.Favicon{ContentType: ct, Data: data}}

			rec := do(faviconRouter(spy), http.MethodGet, faviconPath(uuid.New()), withSession(goodSession))

			require.Equal(t, http.StatusOK, rec.Code)
			require.Equal(t, ct, rec.Header().Get("Content-Type"))
			require.Equal(t, data, rec.Body.Bytes())
			require.Equal(t, fmt.Sprint(len(data)), rec.Header().Get("Content-Length"))
			require.Equal(t, "private, max-age=31536000", rec.Header().Get("Cache-Control"))
			require.NotEmpty(t, rec.Header().Get("ETag"))
		})
	}
}

func TestGetFavicon_ETag(t *testing.T) {
	etagOf := func(t *testing.T, ct string, data []byte) string {
		t.Helper()
		spy := &faviconSpy{favicon: domain.Favicon{ContentType: ct, Data: data}}
		rec := do(faviconRouter(spy), http.MethodGet, faviconPath(uuid.New()), withSession(goodSession))
		require.Equal(t, http.StatusOK, rec.Code)
		return rec.Header().Get("ETag")
	}
	data := []byte("icon-bytes")

	t.Run("form and rule", func(t *testing.T) {
		for _, ct := range faviconTypes {
			got := etagOf(t, ct, data)
			require.Regexp(t, etagForm, got)
			require.Equal(t, wantETag(ct, data), got)
		}
	})
	t.Run("same input, same etag", func(t *testing.T) {
		require.Equal(t, etagOf(t, "image/png", data), etagOf(t, "image/png", data))
	})
	t.Run("one byte changed", func(t *testing.T) {
		other := append([]byte{}, data...)
		other[0] ^= 1
		require.NotEqual(t, etagOf(t, "image/png", data), etagOf(t, "image/png", other))
	})
	t.Run("type changed, same bytes", func(t *testing.T) {
		require.NotEqual(t, etagOf(t, "image/png", data), etagOf(t, "image/gif", data))
	})
}

func TestGetFavicon_PassesSessionUserAndPathID(t *testing.T) {
	spy := &faviconSpy{favicon: domain.Favicon{ContentType: "image/png", Data: []byte("x")}}
	id := uuid.New()

	rec := do(faviconRouter(spy), http.MethodGet, faviconPath(id), withSession(goodSession))

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, callerID, spy.gotUser)
	require.Equal(t, id, spy.gotID)
}

func TestGetFavicon_IgnoresConditionalAndRangeHeaders(t *testing.T) {
	data := []byte("0123456789")
	etag := wantETag("image/png", data)
	for name, header := range map[string][2]string{
		"If-None-Match own etag": {"If-None-Match", etag},
		"If-None-Match star":     {"If-None-Match", "*"},
		"Range":                  {"Range", "bytes=0-0"},
	} {
		t.Run(name, func(t *testing.T) {
			spy := &faviconSpy{favicon: domain.Favicon{ContentType: "image/png", Data: data}}

			rec := do(faviconRouter(spy), http.MethodGet, faviconPath(uuid.New()), withSession(goodSession),
				func(r *http.Request) { r.Header.Set(header[0], header[1]) })

			require.Equal(t, http.StatusOK, rec.Code)
			require.Equal(t, data, rec.Body.Bytes())
		})
	}
}

func TestGetFavicon_Errors(t *testing.T) {
	t.Run("not found is 404", func(t *testing.T) {
		spy := &faviconSpy{err: gorm.ErrRecordNotFound}
		rec := do(faviconRouter(spy), http.MethodGet, faviconPath(uuid.New()), withSession(goodSession))
		requireProblem(t, rec, http.StatusNotFound, api.ErrorCodeNotFound)
	})

	t.Run("unclassified error is 500", func(t *testing.T) {
		spy := &faviconSpy{err: errors.New("db exploded")}
		rec := do(faviconRouter(spy), http.MethodGet, faviconPath(uuid.New()), withSession(goodSession))
		requireProblem(t, rec, http.StatusInternalServerError, api.ErrorCodeInternalError)
	})

	t.Run("a type with no response is 500 and not the image", func(t *testing.T) {
		spy := &faviconSpy{favicon: domain.Favicon{ContentType: "image/svg+xml", Data: []byte("<svg/>")}}
		rec := do(faviconRouter(spy), http.MethodGet, faviconPath(uuid.New()), withSession(goodSession))
		requireProblem(t, rec, http.StatusInternalServerError, api.ErrorCodeInternalError)
		require.NotContains(t, rec.Body.String(), "<svg/>")
	})
}

func TestGetFavicon_NoCookie(t *testing.T) {
	spy := &faviconSpy{}

	rec := do(faviconRouter(spy), http.MethodGet, faviconPath(uuid.New()))

	requireProblem(t, rec, http.StatusUnauthorized, api.ErrorCodeUnauthenticated)
	require.Zero(t, spy.calls)
}

func TestGetFavicon_MalformedID(t *testing.T) {
	spy := &faviconSpy{}

	rec := do(faviconRouter(spy), http.MethodGet, "/api/v1/favicons/not-a-uuid", withSession(goodSession))

	requireProblem(t, rec, http.StatusBadRequest, api.ErrorCodeValidationError)
	require.Zero(t, spy.calls)
}
