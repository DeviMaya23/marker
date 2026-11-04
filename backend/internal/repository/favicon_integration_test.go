//go:build integration

package repository_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/domain"
	"marker/internal/repository"
	"marker/internal/testutil"
)

// storeIcon stores an icon for the user through a real page-fetch write and returns the
// favicon id the bookmark now points to.
func storeIcon(t *testing.T, db *gorm.DB, userID uuid.UUID, host, contentType string, data []byte) uuid.UUID {
	t.Helper()
	b := newBookmark(userID, "https://"+host+"/"+domain.NewID().String())
	require.NoError(t, db.Create(&b).Error)
	require.NoError(t, repository.NewBookmarkRepository(db).RecordFetchSuccess(context.Background(), b, domain.FetchResult{
		Text: "x", Favicon: &domain.FaviconData{Host: host, ContentType: contentType, Data: data},
	}))
	var got domain.Bookmark
	require.NoError(t, db.First(&got, "id = ?", b.ID).Error)
	require.NotNil(t, got.FaviconID)
	return *got.FaviconID
}

func TestFaviconRepository_Find_ReturnsStoredBytes(t *testing.T) {
	db := testutil.NewDB(t)
	user := newUser(t, db)
	data := []byte{0x00, 0xFF, 0x89}
	id := storeIcon(t, db, user.ID, domain.NewID().String()+".example.com", "image/png", data)

	got, err := repository.NewFaviconRepository(db).Find(context.Background(), user.ID, id)

	require.NoError(t, err)
	require.Equal(t, "image/png", got.ContentType)
	require.Equal(t, data, got.Data)
}

func TestFaviconRepository_Find_IsolatedPerUser(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewFaviconRepository(db)
	owner, other := newUser(t, db), newUser(t, db)
	id := storeIcon(t, db, owner.ID, domain.NewID().String()+".example.com", "image/png", []byte("mine"))

	_, err := repo.Find(context.Background(), other.ID, id)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)

	_, err = repo.Find(context.Background(), owner.ID, domain.NewID())
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)

	got, err := repo.Find(context.Background(), owner.ID, id)
	require.NoError(t, err)
	require.Equal(t, []byte("mine"), got.Data)
}

func TestFaviconRepository_Find_SeesOverwrittenBytes(t *testing.T) {
	db := testutil.NewDB(t)
	user := newUser(t, db)
	host := domain.NewID().String() + ".example.com"
	id := storeIcon(t, db, user.ID, host, "image/png", []byte("old"))
	require.Equal(t, id, storeIcon(t, db, user.ID, host, "image/gif", []byte("new")), "same row")

	got, err := repository.NewFaviconRepository(db).Find(context.Background(), user.ID, id)

	require.NoError(t, err)
	require.Equal(t, []byte("new"), got.Data)
	require.Equal(t, "image/gif", got.ContentType)
}

func TestFaviconRepository_Find_DoesNotChangeUserVersion(t *testing.T) {
	db := testutil.NewDB(t)
	user := newUser(t, db)
	id := storeIcon(t, db, user.ID, domain.NewID().String()+".example.com", "image/png", []byte("x"))
	before := userVersion(t, db, user.ID)

	_, err := repository.NewFaviconRepository(db).Find(context.Background(), user.ID, id)

	require.NoError(t, err)
	require.Equal(t, before, userVersion(t, db, user.ID))
}
