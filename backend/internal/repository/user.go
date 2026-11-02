package repository

import (
	"context"

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
