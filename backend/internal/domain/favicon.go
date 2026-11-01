package domain

import "github.com/google/uuid"

// Favicon is a site icon stored per user, so account deletion leaves no rows behind.
type Favicon struct {
	ID          uuid.UUID `gorm:"column:id;primaryKey"`
	UserID      uuid.UUID `gorm:"column:user_id"`
	Host        string    `gorm:"column:host"`
	ContentType string    `gorm:"column:content_type"`
	Data        []byte    `gorm:"column:data"`
}

func (Favicon) TableName() string { return "favicons" }
