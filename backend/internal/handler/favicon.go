package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"

	"github.com/google/uuid"

	"marker/internal/api"
	"marker/internal/domain"
	"marker/internal/handler/middleware"
)

// FaviconService is what the favicon operation calls. It is satisfied by usecase.FaviconService.
type FaviconService interface {
	Get(ctx context.Context, userID, id uuid.UUID) (domain.Favicon, error)
}

const faviconCacheControl = "private, max-age=31536000"

// faviconETag is a strong validator over the served type and the bytes.
func faviconETag(contentType string, data []byte) string {
	h := sha256.New()
	h.Write([]byte(contentType))
	h.Write([]byte("\n"))
	h.Write(data)
	return `"` + hex.EncodeToString(h.Sum(nil)) + `"`
}

// GetFavicon implements GET /api/v1/favicons/{id}; it shadows the 501 stub. The usecase has
// already normalized the type, so this only picks the generated response for it.
func (s *Server) GetFavicon(ctx context.Context, req api.GetFaviconRequestObject) (api.GetFaviconResponseObject, error) {
	auth, ok := middleware.AuthFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	f, err := s.favicons.Get(ctx, auth.UserID, req.Id)
	if err != nil {
		return nil, err
	}

	cacheControl, etag := faviconCacheControl, faviconETag(f.ContentType, f.Data)
	headers := api.GetFavicon200ResponseHeaders{CacheControl: &cacheControl, ETag: &etag}
	body, n := bytes.NewReader(f.Data), int64(len(f.Data))

	switch f.ContentType {
	case "image/png":
		return api.GetFavicon200ImagepngResponse{Body: body, ContentLength: n, Headers: headers}, nil
	case "image/jpeg":
		return api.GetFavicon200ImagejpegResponse{Body: body, ContentLength: n, Headers: headers}, nil
	case "image/gif":
		return api.GetFavicon200ImagegifResponse{Body: body, ContentLength: n, Headers: headers}, nil
	case "image/webp":
		return api.GetFavicon200ImagewebpResponse{Body: body, ContentLength: n, Headers: headers}, nil
	case "image/x-icon":
		return api.GetFavicon200ImagexIconResponse{Body: body, ContentLength: n, Headers: headers}, nil
	}
	// Not a domain error, so the client gets 500 internal_error (ErrorHandler logs it).
	return nil, fmt.Errorf("no favicon response for content type %q", f.ContentType)
}
