package repository

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"marker/internal/domain"
)

// FaviconRepository is the database access for stored site icons.
type FaviconRepository struct {
	db *gorm.DB
}

func NewFaviconRepository(db *gorm.DB) *FaviconRepository {
	return &FaviconRepository{db: db}
}

// Find reads one icon by id, scoped to its owner. Another user's id and an unknown id are
// the same gorm.ErrRecordNotFound (NFR-7). A single primary-key read: no write, no lock.
func (r *FaviconRepository) Find(ctx context.Context, userID, id uuid.UUID) (domain.Favicon, error) {
	var f domain.Favicon
	err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&f).Error
	return f, err
}
