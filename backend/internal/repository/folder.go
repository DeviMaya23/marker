package repository

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"marker/internal/domain"
)

// FolderRepository is the database access for folders. Methods are added as features
// need them.
type FolderRepository struct {
	db *gorm.DB
}

func NewFolderRepository(db *gorm.DB) *FolderRepository {
	return &FolderRepository{db: db}
}

// GetFolder returns the user's folder. Another user's folder is gorm.ErrRecordNotFound.
func (r *FolderRepository) GetFolder(ctx context.Context, userID, id uuid.UUID) (domain.Folder, error) {
	var f domain.Folder
	err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&f).Error
	return f, err
}
