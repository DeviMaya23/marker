//go:build integration

package repository_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/domain"
	"marker/internal/testutil"
)

// These tests check the schema's own promises (constraints and cascades) through the
// domain models. They also prove the GORM struct tags match the migration's columns.

const (
	pgUniqueViolation = "23505"
	pgCheckViolation  = "23514"
)

func newUser(t *testing.T, db *gorm.DB) domain.User {
	t.Helper()
	u := domain.User{ID: domain.NewID(), IdpID: "idp|" + domain.NewID().String()}
	require.NoError(t, db.Create(&u).Error)
	return u
}

func newFolder(userID uuid.UUID, parentID *uuid.UUID, name string, depth int) domain.Folder {
	return domain.Folder{ID: domain.NewID(), UserID: userID, ParentID: parentID, Name: name, Depth: depth}
}

func newBookmark(userID uuid.UUID, normalizedURL string) domain.Bookmark {
	return domain.Bookmark{
		ID:            domain.NewID(),
		UserID:        userID,
		URL:           normalizedURL,
		NormalizedURL: normalizedURL,
		FetchStatus:   domain.FetchPending,
	}
}

func requirePgCode(t *testing.T, err error, code string) {
	t.Helper()
	var pgErr *pgconn.PgError
	require.ErrorAs(t, err, &pgErr)
	require.Equal(t, code, pgErr.Code)
}

func TestSchema_TrashedBookmarkStillBlocksDuplicateURL(t *testing.T) {
	db := testutil.NewDB(t)
	user := newUser(t, db)

	first := newBookmark(user.ID, "https://example.com/a")
	require.NoError(t, db.Create(&first).Error)
	require.NoError(t, db.Model(&first).Update("deleted_at", time.Now()).Error)

	again := newBookmark(user.ID, "https://example.com/a")
	requirePgCode(t, db.Create(&again).Error, pgUniqueViolation)
}

func TestSchema_SameURLAllowedForDifferentUsers(t *testing.T) {
	db := testutil.NewDB(t)
	alice, bob := newUser(t, db), newUser(t, db)

	a := newBookmark(alice.ID, "https://example.com/shared")
	b := newBookmark(bob.ID, "https://example.com/shared")
	require.NoError(t, db.Create(&a).Error)
	require.NoError(t, db.Create(&b).Error)
}

func TestSchema_SiblingFolderNamesCollideCaseInsensitively(t *testing.T) {
	db := testutil.NewDB(t)
	user := newUser(t, db)

	root := newFolder(user.ID, nil, "Reading", 1)
	require.NoError(t, db.Create(&root).Error)

	t.Run("at the root", func(t *testing.T) {
		dup := newFolder(user.ID, nil, "reading", 1)
		requirePgCode(t, db.Create(&dup).Error, pgUniqueViolation)
	})

	t.Run("under the same parent", func(t *testing.T) {
		child := newFolder(user.ID, &root.ID, "Papers", 2)
		require.NoError(t, db.Create(&child).Error)
		dup := newFolder(user.ID, &root.ID, "PAPERS", 2)
		requirePgCode(t, db.Create(&dup).Error, pgUniqueViolation)
	})

	t.Run("same name under a different parent is allowed", func(t *testing.T) {
		other := newFolder(user.ID, nil, "Work", 1)
		require.NoError(t, db.Create(&other).Error)
		child := newFolder(user.ID, &other.ID, "Papers", 2)
		require.NoError(t, db.Create(&child).Error)
	})

	t.Run("same name for a different user is allowed", func(t *testing.T) {
		other := newUser(t, db)
		same := newFolder(other.ID, nil, "Reading", 1)
		require.NoError(t, db.Create(&same).Error)
	})
}

func TestSchema_FolderDepthLimit(t *testing.T) {
	db := testutil.NewDB(t)
	user := newUser(t, db)

	ok := newFolder(user.ID, nil, "deepest allowed", domain.MaxFolderDepth)
	require.NoError(t, db.Create(&ok).Error)

	tooDeep := newFolder(user.ID, nil, "too deep", domain.MaxFolderDepth+1)
	requirePgCode(t, db.Create(&tooDeep).Error, pgCheckViolation)
}

func TestSchema_FetchStatusIsRestricted(t *testing.T) {
	db := testutil.NewDB(t)
	user := newUser(t, db)

	b := newBookmark(user.ID, "https://example.com/status")
	b.FetchStatus = "weird"
	requirePgCode(t, db.Create(&b).Error, pgCheckViolation)
}

func TestSchema_DeletingUserRemovesEverythingTheyOwn(t *testing.T) {
	db := testutil.NewDB(t)
	user := newUser(t, db)

	folder := newFolder(user.ID, nil, "Reading", 1)
	require.NoError(t, db.Create(&folder).Error)

	favicon := domain.Favicon{
		ID: domain.NewID(), UserID: user.ID, Host: "example.com",
		ContentType: "image/png", Data: []byte{0x89, 0x50, 0x4e, 0x47},
	}
	require.NoError(t, db.Create(&favicon).Error)

	bookmark := newBookmark(user.ID, "https://example.com/owned")
	bookmark.FolderID = &folder.ID
	bookmark.FaviconID = &favicon.ID
	require.NoError(t, db.Create(&bookmark).Error)

	content := domain.BookmarkContent{BookmarkID: bookmark.ID, Text: "page text"}
	require.NoError(t, db.Create(&content).Error)

	require.NoError(t, db.Delete(&domain.User{}, "id = ?", user.ID).Error)

	requireCount := func(model any, query string, arg any) {
		t.Helper()
		var n int64
		require.NoError(t, db.Model(model).Where(query, arg).Count(&n).Error)
		require.Zero(t, n)
	}
	requireCount(&domain.Folder{}, "user_id = ?", user.ID)
	requireCount(&domain.Favicon{}, "user_id = ?", user.ID)
	requireCount(&domain.Bookmark{}, "user_id = ?", user.ID)
	requireCount(&domain.BookmarkContent{}, "bookmark_id = ?", bookmark.ID)
}
