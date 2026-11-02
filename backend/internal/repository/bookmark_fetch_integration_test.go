//go:build integration

package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/domain"
	"marker/internal/repository"
	"marker/internal/testutil"
)

func TestRecordFetchSuccess_StoresResultAndTouchesNothingElse(t *testing.T) {
	for _, trashed := range []bool{false, true} {
		db := testutil.NewDB(t)
		repo := repository.NewBookmarkRepository(db)
		user := newUser(t, db)
		folder := newFolder(user.ID, nil, "F-"+domain.NewID().String(), 1)
		require.NoError(t, db.Create(&folder).Error)

		b := newBookmark(user.ID, "https://fetch.example.com/"+domain.NewID().String())
		b.Note, b.FolderID = "my note", &folder.ID
		require.NoError(t, db.Create(&b).Error)
		if trashed {
			require.NoError(t, db.Model(&b).Update("deleted_at", time.Now()).Error)
		}
		before := userVersion(t, db, user.ID)

		err := repo.RecordFetchSuccess(context.Background(), b, domain.FetchResult{
			Title: "Fetched title", Text: "pangolin habitat",
			Favicon: &domain.FaviconData{Host: "fetch.example.com", ContentType: "image/png", Data: []byte{1, 2, 3}},
		})
		require.NoError(t, err)

		var got domain.Bookmark
		require.NoError(t, db.First(&got, "id = ?", b.ID).Error)
		require.Equal(t, domain.FetchOK, got.FetchStatus)
		require.Equal(t, "Fetched title", got.Title, "an empty title is filled")
		require.Equal(t, "my note", got.Note)
		require.Equal(t, &folder.ID, got.FolderID)
		require.Equal(t, trashed, got.DeletedAt != nil, "trash state is unchanged; a trashed bookmark is still updated")
		require.NotNil(t, got.FaviconID)

		var fav domain.Favicon
		require.NoError(t, db.First(&fav, "id = ?", *got.FaviconID).Error)
		require.Equal(t, user.ID, fav.UserID)
		require.Equal(t, []byte{1, 2, 3}, fav.Data)

		var content domain.BookmarkContent
		require.NoError(t, db.First(&content, "bookmark_id = ?", b.ID).Error)
		require.Equal(t, "pangolin habitat", content.Text)

		var hits int64
		require.NoError(t, db.Raw(`SELECT count(*) FROM bookmarks WHERE id = ? AND search_vector @@ plainto_tsquery('english', 'pangolin')`, b.ID).Scan(&hits).Error)
		require.EqualValues(t, 1, hits, "content is searchable once the fetch completes")

		require.Equal(t, before+1, userVersion(t, db, user.ID))
	}
}

func TestRecordFetchSuccess_NeverOverwritesATitle(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	b := newBookmark(user.ID, "https://title.example.com/"+domain.NewID().String())
	b.Title = "Mine"
	require.NoError(t, db.Create(&b).Error)

	require.NoError(t, repo.RecordFetchSuccess(context.Background(), b, domain.FetchResult{Title: "From page", Text: "x"}))

	var got domain.Bookmark
	require.NoError(t, db.First(&got, "id = ?", b.ID).Error)
	require.Equal(t, "Mine", got.Title)
}

func TestRecordFetchSuccess_FaviconIsOnePerUserAndHost(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	host := domain.NewID().String() + ".example.com"

	var ids []string
	for _, path := range []string{"a", "b"} {
		b := newBookmark(user.ID, "https://"+host+"/"+path)
		require.NoError(t, db.Create(&b).Error)
		require.NoError(t, repo.RecordFetchSuccess(context.Background(), b, domain.FetchResult{
			Text: "x", Favicon: &domain.FaviconData{Host: host, ContentType: "image/png", Data: []byte(path)},
		}))
		var got domain.Bookmark
		require.NoError(t, db.First(&got, "id = ?", b.ID).Error)
		ids = append(ids, got.FaviconID.String())
	}
	require.Equal(t, ids[0], ids[1], "the upsert on (user_id, host) reuses the row")
}

func TestRecordFetchSuccess_DeletedBookmarkIsDiscarded(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	b := newBookmark(user.ID, "https://gone.example.com/"+domain.NewID().String())
	require.NoError(t, db.Create(&b).Error)
	require.NoError(t, db.Delete(&domain.Bookmark{}, "id = ?", b.ID).Error)
	before := userVersion(t, db, user.ID)

	err := repo.RecordFetchSuccess(context.Background(), b, domain.FetchResult{Text: "x",
		Favicon: &domain.FaviconData{Host: "gone.example.com", ContentType: "image/png", Data: []byte{1}}})
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)

	var favicons int64
	require.NoError(t, db.Model(&domain.Favicon{}).Where("user_id = ?", user.ID).Count(&favicons).Error)
	require.Zero(t, favicons, "the whole transaction rolled back")
	require.Equal(t, before, userVersion(t, db, user.ID))
}

func TestRecordFetch_DeletedUserIsDiscarded(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	b := newBookmark(user.ID, "https://nouser.example.com/"+domain.NewID().String())
	require.NoError(t, db.Create(&b).Error)
	require.NoError(t, db.Delete(&domain.User{}, "id = ?", user.ID).Error)

	// Favicon insert hits the user foreign key; the content insert hits the bookmark's.
	err := repo.RecordFetchSuccess(context.Background(), b, domain.FetchResult{Text: "x",
		Favicon: &domain.FaviconData{Host: "nouser.example.com", ContentType: "image/png", Data: []byte{1}}})
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	require.ErrorIs(t, repo.RecordFetchFailure(context.Background(), b), gorm.ErrRecordNotFound)
}

func TestRecordFetchFailure_SetsFailedAndBumpsVersion(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewBookmarkRepository(db)
	user := newUser(t, db)
	b := newBookmark(user.ID, "https://fail.example.com/"+domain.NewID().String())
	b.Title, b.Note = "Mine", "note"
	require.NoError(t, db.Create(&b).Error)
	before := userVersion(t, db, user.ID)

	require.NoError(t, repo.RecordFetchFailure(context.Background(), b))

	var got domain.Bookmark
	require.NoError(t, db.First(&got, "id = ?", b.ID).Error)
	require.Equal(t, domain.FetchFailed, got.FetchStatus)
	require.Equal(t, "Mine", got.Title)
	require.Equal(t, "note", got.Note)
	require.Equal(t, before+1, userVersion(t, db, user.ID))

	// Not pending any more: a second result is discarded.
	require.ErrorIs(t, repo.RecordFetchFailure(context.Background(), b), gorm.ErrRecordNotFound)
}
