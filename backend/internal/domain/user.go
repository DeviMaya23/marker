package domain

import (
	"time"

	"github.com/google/uuid"
)

// User is an account. IdpID is the identity provider's stable subject ID (the OIDC "sub").
// Version is incremented in every write transaction and drives sync polling.
type User struct {
	ID        uuid.UUID `gorm:"column:id;primaryKey"`
	IdpID     string    `gorm:"column:idp_id"`
	Version   int64     `gorm:"column:version"`
	CreatedAt time.Time `gorm:"column:created_at"`
}

func (User) TableName() string { return "users" }
