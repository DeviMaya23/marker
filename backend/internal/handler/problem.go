package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/handler/middleware"
)

const problemContentType = "application/problem+json"

// ErrNotImplemented is returned by operations that have no implementation yet. It is a
// placeholder and disappears once every operation is implemented.
var ErrNotImplemented = errors.New("not implemented")

// domainProblems maps domain errors to the error codes in openapi.yaml. Add an entry
// whenever a usecase gains a new sentinel error; the code must exist in the spec.
var domainProblems = []struct {
	err    error
	status int
	code   api.ErrorCode
	title  string
}{
	{domain.ErrUnauthenticated, http.StatusUnauthorized, api.ErrorCodeUnauthenticated, "Authentication required"},
	{middleware.ErrCSRFFailed, http.StatusForbidden, api.ErrorCodeCsrfFailed, "CSRF check failed"},
	{domain.ErrInvalidLogin, http.StatusBadRequest, api.ErrorCodeValidationError, "Invalid login attempt"},
	{domain.ErrInvalidURL, http.StatusUnprocessableEntity, api.ErrorCodeInvalidUrl, "Invalid URL"},
	{domain.ErrBookmarkLimitReached, http.StatusConflict, api.ErrorCodeBookmarkLimitReached, "Bookmark limit reached"},
	{domain.ErrBookmarkInTrash, http.StatusConflict, api.ErrorCodeBookmarkInTrash, "Bookmark is in the trash"},
	{domain.ErrBookmarkNotInTrash, http.StatusConflict, api.ErrorCodeBookmarkNotInTrash, "Bookmark is not in the trash"},
	{domain.ErrFolderNameConflict, http.StatusConflict, api.ErrorCodeFolderNameConflict, "Folder name already used"},
	{domain.ErrFolderDepthExceeded, http.StatusUnprocessableEntity, api.ErrorCodeFolderDepthExceeded, "Folder depth exceeded"},
	{domain.ErrFolderCycle, http.StatusUnprocessableEntity, api.ErrorCodeFolderCycle, "Folder cannot move into itself"},
	{gorm.ErrRecordNotFound, http.StatusNotFound, api.ErrorCodeNotFound, "Not found"},
}

// ErrorHandler is Echo's error handler. Every error response is RFC 9457
// application/problem+json with a stable `code`; internal error text never reaches
// the client.
func ErrorHandler(err error, c echo.Context) {
	if c.Response().Committed {
		return
	}

	problem := problemFor(err)
	if problem.Status >= http.StatusInternalServerError && !errors.Is(err, ErrNotImplemented) {
		c.Logger().Error(err)
	}

	body, marshalErr := json.Marshal(problem)
	if marshalErr != nil {
		c.Logger().Error(marshalErr)
		_ = c.NoContent(http.StatusInternalServerError)
		return
	}
	_ = c.Blob(problem.Status, problemContentType, body)
}

func problemFor(err error) api.Problem {
	for _, m := range domainProblems {
		if errors.Is(err, m.err) {
			return newProblem(m.status, m.code, m.title)
		}
	}
	if errors.Is(err, ErrNotImplemented) {
		return newProblem(http.StatusNotImplemented, "not_implemented", "Not implemented")
	}

	// Errors Echo and the generated code raise themselves: bad parameters, bad JSON,
	// unknown routes, oversized bodies.
	var httpErr *echo.HTTPError
	if errors.As(err, &httpErr) {
		switch httpErr.Code {
		case http.StatusBadRequest:
			return newProblem(http.StatusBadRequest, api.ErrorCodeValidationError, "Invalid request")
		case http.StatusNotFound, http.StatusMethodNotAllowed:
			return newProblem(http.StatusNotFound, api.ErrorCodeNotFound, "Not found")
		case http.StatusUnsupportedMediaType:
			return newProblem(http.StatusUnsupportedMediaType, api.ErrorCodeUnsupportedMediaType, "Unsupported media type")
		case http.StatusRequestEntityTooLarge:
			return newProblem(http.StatusRequestEntityTooLarge, api.ErrorCodePayloadTooLarge, "Request body too large")
		}
	}

	return newProblem(http.StatusInternalServerError, api.ErrorCodeInternalError, "Internal server error")
}

func newProblem(status int, code api.ErrorCode, title string) api.Problem {
	return api.Problem{
		Type:   "/errors/" + strings.ReplaceAll(string(code), "_", "-"),
		Title:  title,
		Status: status,
		Code:   code,
	}
}
