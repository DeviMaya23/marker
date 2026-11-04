package handler

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"

	"marker/internal/api"
	"marker/internal/domain"
)

func TestProblemFor(t *testing.T) {
	t.Run("an Echo 415 is the 415 problem", func(t *testing.T) {
		p := problemFor(echo.NewHTTPError(http.StatusUnsupportedMediaType))
		require.Equal(t, http.StatusUnsupportedMediaType, p.Status)
		require.Equal(t, api.ErrorCodeUnsupportedMediaType, p.Code)
		require.Equal(t, "Unsupported media type", p.Title)
	})

	t.Run("an unknown error is a generic 500", func(t *testing.T) {
		p := problemFor(errors.New("connection to db-7 refused"))
		require.Equal(t, http.StatusInternalServerError, p.Status)
		require.Equal(t, api.ErrorCodeInternalError, p.Code)
		require.Equal(t, "Internal server error", p.Title)
		require.NotContains(t, fmt.Sprintf("%+v", p), "db-7")
	})

	t.Run("the 500 body has no internal text", func(t *testing.T) {
		rec := httptest.NewRecorder()
		e := echo.New()
		ErrorHandler(domain.ErrInvalidURL, e.NewContext(httptest.NewRequest(http.MethodGet, "/", nil), rec)) // sanity: mapped errors still map
		require.Equal(t, http.StatusUnprocessableEntity, rec.Code)

		rec = httptest.NewRecorder()
		ErrorHandler(errors.New("secret detail"), e.NewContext(httptest.NewRequest(http.MethodGet, "/", nil), rec))
		requireProblem(t, rec, http.StatusInternalServerError, api.ErrorCodeInternalError)
		require.NotContains(t, rec.Body.String(), "secret")
	})
}
