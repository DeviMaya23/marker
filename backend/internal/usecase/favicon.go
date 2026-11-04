package usecase

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"marker/internal/domain"
)

// servedFaviconTypes are the media types the contract lists for getFavicon.
var servedFaviconTypes = map[string]bool{
	"image/png":    true,
	"image/jpeg":   true,
	"image/gif":    true,
	"image/webp":   true,
	"image/x-icon": true,
}

// Same format as image/x-icon; the contract lists only the latter.
const (
	faviconAliasType  = "image/vnd.microsoft.icon"
	faviconAliasServe = "image/x-icon"
)

// FaviconService reads stored icons for the favicon route.
type FaviconService struct {
	store interface {
		Find(ctx context.Context, userID, id uuid.UUID) (domain.Favicon, error)
	}
}

func NewFaviconService(store interface {
	Find(ctx context.Context, userID, id uuid.UUID) (domain.Favicon, error)
}) *FaviconService {
	return &FaviconService{store: store}
}

// Get returns the caller's icon with ContentType set to the type to serve. A stored type
// that cannot be served is logged and reported as gorm.ErrRecordNotFound. Store errors
// pass through unchanged.
func (s *FaviconService) Get(ctx context.Context, userID, id uuid.UUID) (domain.Favicon, error) {
	f, err := s.store.Find(ctx, userID, id)
	if err != nil {
		return domain.Favicon{}, err
	}
	if f.ContentType == faviconAliasType {
		f.ContentType = faviconAliasServe
	}
	if !servedFaviconTypes[f.ContentType] {
		slog.Warn("favicon has a type that cannot be served", "favicon_id", f.ID, "content_type", f.ContentType)
		return domain.Favicon{}, gorm.ErrRecordNotFound
	}
	return f, nil
}
