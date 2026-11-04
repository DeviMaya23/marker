package usecase

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/domain"
)

func TestFaviconService_Get_ServedTypes(t *testing.T) {
	data := []byte{0x00, 0xFF, 0x89}
	for _, tc := range []struct{ stored, served string }{
		{"image/png", "image/png"},
		{"image/jpeg", "image/jpeg"},
		{"image/gif", "image/gif"},
		{"image/webp", "image/webp"},
		{"image/x-icon", "image/x-icon"},
		{"image/vnd.microsoft.icon", "image/x-icon"},
	} {
		t.Run(tc.stored, func(t *testing.T) {
			store := &fakeFaviconStore{favicon: domain.Favicon{ContentType: tc.stored, Data: data}}

			got, err := NewFaviconService(store).Get(context.Background(), uuid.New(), uuid.New())

			require.NoError(t, err)
			require.Equal(t, tc.served, got.ContentType)
			require.Equal(t, data, got.Data)
		})
	}
}

func TestFaviconService_Get_NotServableIsNotFound(t *testing.T) {
	for _, stored := range []string{"image/svg+xml", "text/html", "IMAGE/PNG", ""} {
		t.Run("stored "+stored, func(t *testing.T) {
			store := &fakeFaviconStore{favicon: domain.Favicon{ContentType: stored, Data: []byte("x")}}

			got, err := NewFaviconService(store).Get(context.Background(), uuid.New(), uuid.New())

			require.ErrorIs(t, err, gorm.ErrRecordNotFound)
			require.Equal(t, domain.Favicon{}, got)
		})
	}
}

func TestFaviconService_Get_PassesTheCallersIDs(t *testing.T) {
	store := &fakeFaviconStore{favicon: domain.Favicon{ContentType: "image/png", Data: []byte("x")}}
	userID, id := uuid.New(), uuid.New()

	_, err := NewFaviconService(store).Get(context.Background(), userID, id)

	require.NoError(t, err)
	require.Equal(t, userID, store.gotUser)
	require.Equal(t, id, store.gotFavicon)
}

func TestFaviconService_Get_OnlyNotServableBecomesNotFound(t *testing.T) {
	boom := errors.New("db exploded")
	store := &fakeFaviconStore{err: boom}

	_, err := NewFaviconService(store).Get(context.Background(), uuid.New(), uuid.New())

	require.ErrorIs(t, err, boom)
	require.NotErrorIs(t, err, gorm.ErrRecordNotFound)
}
