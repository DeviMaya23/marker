package repository

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"marker/internal/domain"
)

// UserRepository is the database access for users.
type UserRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) *UserRepository {
	return &UserRepository{db: db}
}

// FindOrCreateUserByIdpID returns the user for an identity provider subject, creating
// it on first sight. It is safe when two logins for a new user race: the insert does
// nothing if the row exists, and the read returns whichever row won.
func (r *UserRepository) FindOrCreateUserByIdpID(ctx context.Context, idpID string) (domain.User, error) {
	db := r.db.WithContext(ctx)

	candidate := domain.User{ID: domain.NewID(), IdpID: idpID}
	err := db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "idp_id"}},
		DoNothing: true,
	}).Create(&candidate).Error
	if err != nil {
		return domain.User{}, err
	}

	var user domain.User
	err = db.Where("idp_id = ?", idpID).First(&user).Error
	return user, err
}

// Version returns the user's change counter (users.version). It is one primary-key read
// of that column and takes no lock. A missing user is gorm.ErrRecordNotFound.
func (r *UserRepository) Version(ctx context.Context, userID uuid.UUID) (int64, error) {
	var versions []int64
	err := r.db.WithContext(ctx).Model(&domain.User{}).
		Select("version").Where("id = ?", userID).Limit(1).Scan(&versions).Error
	if err != nil {
		return 0, err
	}
	if len(versions) == 0 {
		return 0, gorm.ErrRecordNotFound
	}
	return versions[0], nil
}
