package handler

import (
	"bytes"
	"io"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
)

// requireJSON is an operation middleware for the operations that take a body
// (createBookmark, updateBookmark, createFolder, updateFolder). A request that has a body
// and whose Content-Type is not application/json is refused with 415, before the body is
// read by recordBodyKeys or decoded by the generated code (NFR-14).
//
// Only the media type is compared, case-insensitively; parameters such as
// `; charset=utf-8` are allowed. A request with an empty body is not checked and goes on
// as before. It runs after authentication, CSRF and the body size limit.
func requireJSON(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		req := c.Request()
		withBody, err := hasBody(req)
		if err != nil {
			return err // for example the 64 KiB cap, which Echo answers as 413
		}
		if withBody && !isJSON(req.Header.Get(echo.HeaderContentType)) {
			return echo.NewHTTPError(http.StatusUnsupportedMediaType)
		}
		if withBody {
			// Echo's binder compares the type case-sensitively; we accepted it, so
			// hand it the lower-case spelling.
			ct := "application/json"
			if _, params, found := strings.Cut(req.Header.Get(echo.HeaderContentType), ";"); found {
				ct += ";" + params
			}
			req.Header.Set(echo.HeaderContentType, ct)
		}
		return next(c)
	}
}

// hasBody reports whether the request carries any body bytes. A declared length decides.
// For an undeclared one (chunked) it reads the body, which also applies the size limit
// before the media type is judged, and puts the bytes back.
func hasBody(req *http.Request) (bool, error) {
	switch {
	case req.Body == nil || req.Body == http.NoBody || req.ContentLength == 0:
		return false, nil
	case req.ContentLength > 0:
		return true, nil
	}
	raw, err := io.ReadAll(req.Body)
	if err != nil {
		return false, err
	}
	req.Body = io.NopCloser(bytes.NewReader(raw))
	return len(raw) > 0, nil
}

func isJSON(contentType string) bool {
	mediaType, _, _ := strings.Cut(contentType, ";")
	return strings.EqualFold(strings.TrimSpace(mediaType), "application/json")
}
