//go:build integration

package repository_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/repository"
	"marker/internal/testutil"
)

func TestFolderRepository_GetFolder_OnlyForTheOwner(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewFolderRepository(db)
	alice, bob := newUser(t, db), newUser(t, db)
	folder := newFolder(alice.ID, nil, "Alice's", 1)
	require.NoError(t, db.Create(&folder).Error)

	got, err := repo.GetFolder(context.Background(), alice.ID, folder.ID)
	require.NoError(t, err)
	require.Equal(t, folder.ID, got.ID)

	// NFR-7: another user's folder and an unknown id look the same.
	_, err = repo.GetFolder(context.Background(), bob.ID, folder.ID)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	_, err = repo.GetFolder(context.Background(), alice.ID, uuid.New())
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
}
