//go:build integration

package repository_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/domain"
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

// mkFolder creates a folder through the repository and returns it.
func mkFolder(t *testing.T, repo *repository.FolderRepository, userID uuid.UUID, parent *domain.Folder, name string) domain.Folder {
	t.Helper()
	f := domain.Folder{ID: domain.NewID(), UserID: userID, Name: name}
	if parent != nil {
		f.ParentID = &parent.ID
	}
	got, err := repo.Create(context.Background(), f)
	require.NoError(t, err)
	return got.Folder
}

func parentIs(p *domain.Folder) domain.Field[uuid.UUID] {
	if p == nil {
		return domain.Null[uuid.UUID]()
	}
	return domain.Value(p.ID)
}

func folderDepth(t *testing.T, db *gorm.DB, id uuid.UUID) int {
	t.Helper()
	var f domain.Folder
	require.NoError(t, db.First(&f, "id = ?", id).Error)
	return f.Depth
}

func folderCount(t *testing.T, db *gorm.DB, userID uuid.UUID) int64 {
	t.Helper()
	var n int64
	require.NoError(t, db.Model(&domain.Folder{}).Where("user_id = ?", userID).Count(&n).Error)
	return n
}

func TestFolderRepository_List(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewFolderRepository(db)
	alice, bob := newUser(t, db), newUser(t, db)
	ctx := context.Background()

	none, err := repo.List(ctx, alice.ID)
	require.NoError(t, err)
	require.NotNil(t, none)
	require.Empty(t, none)

	zeta := mkFolder(t, repo, alice.ID, nil, "zeta")
	alpha := mkFolder(t, repo, alice.ID, nil, "Alpha")
	beta := mkFolder(t, repo, alice.ID, &alpha, "beta")
	mkFolder(t, repo, bob.ID, nil, "Bob's")

	// Alpha has 2 live bookmarks and 1 trashed; its subfolder beta has 1 live one.
	del := time.Now()
	for i, deleted := range []*time.Time{nil, nil, &del} {
		b := newBookmark(alice.ID, "https://a.example/"+string(rune('a'+i)))
		b.FolderID, b.DeletedAt = &alpha.ID, deleted
		require.NoError(t, db.Create(&b).Error)
	}
	nested := newBookmark(alice.ID, "https://b.example/nested")
	nested.FolderID = &beta.ID
	require.NoError(t, db.Create(&nested).Error)

	got, err := repo.List(ctx, alice.ID)
	require.NoError(t, err)
	require.Len(t, got, 3, "only the caller's folders")
	require.Equal(t, []string{"Alpha", "beta", "zeta"}, []string{got[0].Name, got[1].Name, got[2].Name}, "ordered by lower-cased name")
	require.Equal(t, alpha.ID, got[0].ID)
	require.Equal(t, 2, got[0].BookmarkCount, "live and direct only")
	require.Equal(t, 1, got[1].BookmarkCount)
	require.Equal(t, 0, got[2].BookmarkCount)
	require.Equal(t, zeta.ID, got[2].ID)
	require.Nil(t, got[0].ParentID)
	require.Equal(t, &alpha.ID, got[1].ParentID)
	require.Equal(t, 2, got[1].Depth)
	require.False(t, got[0].CreatedAt.IsZero())

	one, err := repo.Get(ctx, alice.ID, alpha.ID)
	require.NoError(t, err)
	require.Equal(t, 2, one.BookmarkCount)
	_, err = repo.Get(ctx, bob.ID, alpha.ID)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
}

func TestFolderRepository_Create(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewFolderRepository(db)
	user := newUser(t, db)
	ctx := context.Background()

	t.Run("depth follows the parent and the version goes up", func(t *testing.T) {
		before := userVersion(t, db, user.ID)
		root := mkFolder(t, repo, user.ID, nil, "root")
		child := mkFolder(t, repo, user.ID, &root, "child")
		grand := mkFolder(t, repo, user.ID, &child, "grand")
		require.Equal(t, []int{1, 2, 3}, []int{root.Depth, child.Depth, grand.Depth})
		require.Equal(t, before+3, userVersion(t, db, user.ID))

		// The depth the caller proposed is not trusted.
		got, err := repo.Create(ctx, domain.Folder{ID: domain.NewID(), UserID: user.ID, Name: "liar", ParentID: &root.ID, Depth: 1})
		require.NoError(t, err)
		require.Equal(t, 2, got.Depth)
		require.Equal(t, 0, got.BookmarkCount)
	})

	t.Run("a depth-3 parent is refused and writes nothing", func(t *testing.T) {
		a := mkFolder(t, repo, user.ID, nil, "da")
		b := mkFolder(t, repo, user.ID, &a, "db")
		c := mkFolder(t, repo, user.ID, &b, "dc")
		before, n := userVersion(t, db, user.ID), folderCount(t, db, user.ID)
		_, err := repo.Create(ctx, domain.Folder{ID: domain.NewID(), UserID: user.ID, Name: "dd", ParentID: &c.ID})
		require.ErrorIs(t, err, domain.ErrFolderDepthExceeded)
		require.Equal(t, before, userVersion(t, db, user.ID))
		require.Equal(t, n, folderCount(t, db, user.ID))
	})

	t.Run("sibling names collide ignoring case, at the top and under a parent", func(t *testing.T) {
		top := mkFolder(t, repo, user.ID, nil, "Docs")
		_, err := repo.Create(ctx, domain.Folder{ID: domain.NewID(), UserID: user.ID, Name: "docs"})
		require.ErrorIs(t, err, domain.ErrFolderNameConflict)

		mkFolder(t, repo, user.ID, &top, "Notes")
		before := userVersion(t, db, user.ID)
		_, err = repo.Create(ctx, domain.Folder{ID: domain.NewID(), UserID: user.ID, Name: "NOTES", ParentID: &top.ID})
		require.ErrorIs(t, err, domain.ErrFolderNameConflict)
		require.Equal(t, before, userVersion(t, db, user.ID), "a failed write does not bump the version")

		// The same name under a different parent, at the top, or for another user is fine.
		other := mkFolder(t, repo, user.ID, nil, "Other")
		mkFolder(t, repo, user.ID, &other, "Notes")
		mkFolder(t, repo, user.ID, nil, "Notes")
		mkFolder(t, repo, newUser(t, db).ID, nil, "Docs")
	})

	t.Run("a parent that is gone, or another user's, is not found", func(t *testing.T) {
		_, err := repo.Create(ctx, domain.Folder{ID: domain.NewID(), UserID: user.ID, Name: "orphan", ParentID: ptrID(uuid.New())})
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)

		theirs := mkFolder(t, repo, newUser(t, db).ID, nil, "theirs")
		_, err = repo.Create(ctx, domain.Folder{ID: domain.NewID(), UserID: user.ID, Name: "x", ParentID: &theirs.ID})
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	})

	t.Run("a create racing with the delete of its parent is not a server error", func(t *testing.T) {
		for i := 0; i < 10; i++ {
			parent := mkFolder(t, repo, user.ID, nil, "race-"+uuid.NewString())
			var wg sync.WaitGroup
			var createErr error
			wg.Add(2)
			go func() {
				defer wg.Done()
				_, createErr = repo.Create(ctx, domain.Folder{ID: domain.NewID(), UserID: user.ID, Name: "kid", ParentID: &parent.ID})
			}()
			go func() {
				defer wg.Done()
				_, _ = repo.Delete(ctx, user.ID, parent.ID)
			}()
			wg.Wait()
			if createErr != nil {
				require.ErrorIs(t, createErr, gorm.ErrRecordNotFound)
			}
		}
	})
}

func ptrID(id uuid.UUID) *uuid.UUID { return &id }

func TestFolderRepository_Update(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewFolderRepository(db)
	user := newUser(t, db)
	ctx := context.Background()

	t.Run("rename, and a different case of its own name", func(t *testing.T) {
		f := mkFolder(t, repo, user.ID, nil, "Work")
		before := userVersion(t, db, user.ID)
		got, err := repo.Update(ctx, user.ID, f.ID, domain.FolderUpdate{Name: domain.Value("Play")})
		require.NoError(t, err)
		require.Equal(t, "Play", got.Name)
		require.Equal(t, before+1, userVersion(t, db, user.ID))

		got, err = repo.Update(ctx, user.ID, f.ID, domain.FolderUpdate{Name: domain.Value("PLAY")})
		require.NoError(t, err)
		require.Equal(t, "PLAY", got.Name)
		_, err = repo.Update(ctx, user.ID, f.ID, domain.FolderUpdate{Name: domain.Value("PLAY")})
		require.NoError(t, err, "the same name is not a conflict with itself")
		require.True(t, got.UpdatedAt.After(f.UpdatedAt) || got.UpdatedAt.Equal(f.UpdatedAt))
	})

	t.Run("a move updates the depth of the folder and every descendant", func(t *testing.T) {
		src := mkFolder(t, repo, user.ID, nil, "src")
		srcKid := mkFolder(t, repo, user.ID, &src, "kid")
		dst := mkFolder(t, repo, user.ID, nil, "dst")

		got, err := repo.Update(ctx, user.ID, src.ID, domain.FolderUpdate{ParentID: domain.Value(dst.ID)})
		require.NoError(t, err)
		require.Equal(t, 2, got.Depth)
		require.Equal(t, &dst.ID, got.ParentID)
		require.Equal(t, 2, folderDepth(t, db, src.ID))
		require.Equal(t, 3, folderDepth(t, db, srcKid.ID))

		// And back to the top.
		got, err = repo.Update(ctx, user.ID, src.ID, domain.FolderUpdate{ParentID: domain.Null[uuid.UUID]()})
		require.NoError(t, err)
		require.Equal(t, 1, got.Depth)
		require.Nil(t, got.ParentID)
		require.Equal(t, 2, folderDepth(t, db, srcKid.ID))
	})

	t.Run("moving a root folder to the top again, and under its own parent, is valid", func(t *testing.T) {
		r := mkFolder(t, repo, user.ID, nil, "stay")
		_, err := repo.Update(ctx, user.ID, r.ID, domain.FolderUpdate{ParentID: domain.Null[uuid.UUID]()})
		require.NoError(t, err)
		kid := mkFolder(t, repo, user.ID, &r, "kid")
		got, err := repo.Update(ctx, user.ID, kid.ID, domain.FolderUpdate{ParentID: domain.Value(r.ID)})
		require.NoError(t, err)
		require.Equal(t, 2, got.Depth)
	})

	t.Run("a collision in the new location conflicts and writes nothing", func(t *testing.T) {
		dst := mkFolder(t, repo, user.ID, nil, "cdst")
		mkFolder(t, repo, user.ID, &dst, "Same")
		mover := mkFolder(t, repo, user.ID, nil, "same")
		before := userVersion(t, db, user.ID)
		_, err := repo.Update(ctx, user.ID, mover.ID, domain.FolderUpdate{ParentID: domain.Value(dst.ID)})
		require.ErrorIs(t, err, domain.ErrFolderNameConflict)
		require.Equal(t, before, userVersion(t, db, user.ID))
		require.Equal(t, 1, folderDepth(t, db, mover.ID))

		sib := mkFolder(t, repo, user.ID, nil, "Taken")
		_, err = repo.Update(ctx, user.ID, mover.ID, domain.FolderUpdate{Name: domain.Value("taken")})
		require.ErrorIs(t, err, domain.ErrFolderNameConflict)
		require.NotEqual(t, sib.ID, mover.ID)
		// Moving to the top while a root sibling holds the name conflicts as well.
		nested := mkFolder(t, repo, user.ID, &dst, "Taken")
		_, err = repo.Update(ctx, user.ID, nested.ID, domain.FolderUpdate{ParentID: domain.Null[uuid.UUID]()})
		require.ErrorIs(t, err, domain.ErrFolderNameConflict)
	})

	t.Run("cycle and depth are rejected on the real tree", func(t *testing.T) {
		root := mkFolder(t, repo, user.ID, nil, "r")
		child := mkFolder(t, repo, user.ID, &root, "c")
		grand := mkFolder(t, repo, user.ID, &child, "g")
		lone := mkFolder(t, repo, user.ID, nil, "l")
		before := userVersion(t, db, user.ID)

		for name, parent := range map[string]domain.Folder{"itself": root, "child": child, "grandchild": grand} {
			_, err := repo.Update(ctx, user.ID, root.ID, domain.FolderUpdate{ParentID: domain.Value(parent.ID)})
			require.ErrorIs(t, err, domain.ErrFolderCycle, name)
		}
		_, err := repo.Update(ctx, user.ID, root.ID, domain.FolderUpdate{ParentID: domain.Value(lone.ID)})
		require.ErrorIs(t, err, domain.ErrFolderDepthExceeded, "a depth-3 chain under a root folder")
		_, err = repo.Update(ctx, user.ID, lone.ID, domain.FolderUpdate{ParentID: domain.Value(grand.ID)})
		require.ErrorIs(t, err, domain.ErrFolderDepthExceeded, "under a depth-3 folder")
		_, err = repo.Update(ctx, user.ID, lone.ID, domain.FolderUpdate{ParentID: domain.Value(child.ID)})
		require.NoError(t, err, "a single folder fits under a depth-2 folder")

		require.Equal(t, before+1, userVersion(t, db, user.ID), "only the successful move wrote")
		require.Equal(t, 1, folderDepth(t, db, root.ID))
		require.Equal(t, 3, folderDepth(t, db, lone.ID))
	})

	t.Run("a parent that is gone is not found", func(t *testing.T) {
		f := mkFolder(t, repo, user.ID, nil, "mover")
		_, err := repo.Update(ctx, user.ID, f.ID, domain.FolderUpdate{ParentID: domain.Value(uuid.New())})
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	})

	t.Run("an empty update writes nothing", func(t *testing.T) {
		f := mkFolder(t, repo, user.ID, nil, "still")
		before := userVersion(t, db, user.ID)
		got, err := repo.Update(ctx, user.ID, f.ID, domain.FolderUpdate{})
		require.NoError(t, err)
		require.Equal(t, f.ID, got.ID)
		require.Equal(t, before, userVersion(t, db, user.ID))
		var stored domain.Folder
		require.NoError(t, db.First(&stored, "id = ?", f.ID).Error)
		require.True(t, stored.UpdatedAt.Equal(f.UpdatedAt))
	})
}

func TestFolderRepository_Update_ConcurrentCycle(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewFolderRepository(db)
	user := newUser(t, db)
	ctx := context.Background()

	for i := 0; i < 10; i++ {
		a := mkFolder(t, repo, user.ID, nil, "a"+uuid.NewString())
		b := mkFolder(t, repo, user.ID, nil, "b"+uuid.NewString())
		errs := make([]error, 2)
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			_, errs[0] = repo.Update(ctx, user.ID, a.ID, domain.FolderUpdate{ParentID: domain.Value(b.ID)})
		}()
		go func() {
			defer wg.Done()
			_, errs[1] = repo.Update(ctx, user.ID, b.ID, domain.FolderUpdate{ParentID: domain.Value(a.ID)})
		}()
		wg.Wait()

		var ok, cycles int
		for _, err := range errs {
			switch {
			case err == nil:
				ok++
			case errors.Is(err, domain.ErrFolderCycle):
				cycles++
			default:
				require.NoError(t, err)
			}
		}
		require.Equal(t, 1, ok, "exactly one move succeeds")
		require.Equal(t, 1, cycles, "the other is a cycle")
	}
}

func TestFolderRepository_Create_ConcurrentSameName(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewFolderRepository(db)
	user := newUser(t, db)
	ctx := context.Background()

	for _, withParent := range []bool{false, true} {
		var parent *domain.Folder
		if withParent {
			p := mkFolder(t, repo, user.ID, nil, "parent")
			parent = &p
		}
		const n = 6
		errs := make([]error, n)
		var wg sync.WaitGroup
		for i := 0; i < n; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				name := "Same"
				if i%2 == 1 {
					name = "SAME"
				}
				f := domain.Folder{ID: domain.NewID(), UserID: user.ID, Name: name}
				if parent != nil {
					f.ParentID = &parent.ID
				}
				_, errs[i] = repo.Create(ctx, f)
			}()
		}
		wg.Wait()

		ok := 0
		for _, err := range errs {
			if err == nil {
				ok++
			} else {
				require.ErrorIs(t, err, domain.ErrFolderNameConflict)
			}
		}
		require.Equal(t, 1, ok, "exactly one create succeeds (parent: %v)", withParent)
	}
}

func TestFolderRepository_Delete(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewFolderRepository(db)
	bookmarks := repository.NewBookmarkRepository(db)
	user, other := newUser(t, db), newUser(t, db)
	ctx := context.Background()

	root := mkFolder(t, repo, user.ID, nil, "root")
	child := mkFolder(t, repo, user.ID, &root, "child")
	grand := mkFolder(t, repo, user.ID, &child, "grand")
	sibling := mkFolder(t, repo, user.ID, nil, "sibling")
	theirs := mkFolder(t, repo, other.ID, nil, "theirs")

	put := func(owner uuid.UUID, folder *domain.Folder, trashed bool) domain.Bookmark {
		b := newBookmark(owner, "https://example.com/"+domain.NewID().String())
		if folder != nil {
			b.FolderID = &folder.ID
		}
		if trashed {
			at := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
			b.DeletedAt = &at
		}
		require.NoError(t, db.Create(&b).Error)
		return b
	}
	liveRoot, liveChild, liveGrand := put(user.ID, &root, false), put(user.ID, &child, false), put(user.ID, &grand, false)
	oldTrashed := put(user.ID, &child, true)
	outside, atTop, inSibling := put(user.ID, nil, false), put(user.ID, nil, false), put(user.ID, &sibling, false)
	others := put(other.ID, &theirs, false)
	var oldDeletedAt = *oldTrashed.DeletedAt
	before := userVersion(t, db, user.ID)

	got, err := repo.Delete(ctx, user.ID, root.ID)
	require.NoError(t, err)
	require.Equal(t, domain.FolderDeletion{DeletedFolders: 3, TrashedBookmarks: 3}, got)

	var left int64
	require.NoError(t, db.Model(&domain.Folder{}).Where("id IN ?", []uuid.UUID{root.ID, child.ID, grand.ID}).Count(&left).Error)
	require.Zero(t, left, "the folder and its subfolders are gone")
	require.EqualValues(t, 1, folderCount(t, db, user.ID), "the sibling remains")
	require.EqualValues(t, 1, folderCount(t, db, other.ID), "the other user's folder remains")
	require.Equal(t, before+1, userVersion(t, db, user.ID), "one increment")

	reload := func(b domain.Bookmark) domain.Bookmark {
		var r domain.Bookmark
		require.NoError(t, db.First(&r, "id = ?", b.ID).Error)
		return r
	}
	var stamp time.Time
	for _, b := range []domain.Bookmark{liveRoot, liveChild, liveGrand} {
		r := reload(b)
		require.NotNil(t, r.DeletedAt, "live bookmark in the subtree is trashed")
		require.Nil(t, r.FolderID, "and ends with no folder")
		if stamp.IsZero() {
			stamp = *r.DeletedAt
		}
		require.True(t, stamp.Equal(*r.DeletedAt), "one shared deleted_at")
	}
	r := reload(oldTrashed)
	require.True(t, oldDeletedAt.Equal(*r.DeletedAt), "an already trashed bookmark keeps its deleted_at")
	require.Nil(t, r.FolderID, "and loses its folder through the foreign key")

	for _, b := range []domain.Bookmark{outside, atTop, inSibling, others} {
		require.Nil(t, reload(b).DeletedAt, "bookmarks outside the subtree and other users' are untouched")
	}
	require.Equal(t, &sibling.ID, reload(inSibling).FolderID)
	require.Equal(t, &theirs.ID, reload(others).FolderID)

	live, err := bookmarks.List(ctx, domain.BookmarkListQuery{UserID: user.ID, Mode: domain.ListLive, Limit: 100})
	require.NoError(t, err)
	trash, err := bookmarks.List(ctx, domain.BookmarkListQuery{UserID: user.ID, Mode: domain.ListTrash, Limit: 100})
	require.NoError(t, err)
	for _, b := range []domain.Bookmark{liveRoot, liveChild, liveGrand} {
		require.NotContains(t, ids(live), b.ID)
		require.Contains(t, ids(trash), b.ID)
	}

	t.Run("a folder with no bookmarks", func(t *testing.T) {
		empty := mkFolder(t, repo, user.ID, nil, "empty")
		before := userVersion(t, db, user.ID)
		got, err := repo.Delete(ctx, user.ID, empty.ID)
		require.NoError(t, err)
		require.Equal(t, domain.FolderDeletion{DeletedFolders: 1}, got)
		require.Equal(t, before+1, userVersion(t, db, user.ID))
	})
}

func TestFolderRepository_OtherUser(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewFolderRepository(db)
	bookmarks := repository.NewBookmarkRepository(db)
	alice, bob := newUser(t, db), newUser(t, db)
	ctx := context.Background()

	root := mkFolder(t, repo, alice.ID, nil, "Alice")
	kid := mkFolder(t, repo, alice.ID, &root, "kid")
	b := newBookmark(alice.ID, "https://example.com/alices")
	b.FolderID = &kid.ID
	require.NoError(t, db.Create(&b).Error)
	bobRoot := mkFolder(t, repo, bob.ID, nil, "Bob")
	aliceVersion, bobVersion := userVersion(t, db, alice.ID), userVersion(t, db, bob.ID)

	_, err := repo.Update(ctx, bob.ID, root.ID, domain.FolderUpdate{Name: domain.Value("hacked")})
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	_, err = repo.Update(ctx, bob.ID, root.ID, domain.FolderUpdate{})
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	_, err = repo.Update(ctx, alice.ID, kid.ID, domain.FolderUpdate{ParentID: domain.Value(bobRoot.ID)})
	require.ErrorIs(t, err, gorm.ErrRecordNotFound, "another user's folder cannot be a parent")
	_, err = repo.Delete(ctx, bob.ID, root.ID)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	_, err = repo.Subtree(ctx, bob.ID, root.ID)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	_, err = repo.Create(ctx, domain.Folder{ID: domain.NewID(), UserID: bob.ID, Name: "x", ParentID: &root.ID})
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)

	var stored domain.Folder
	require.NoError(t, db.First(&stored, "id = ?", root.ID).Error)
	require.Equal(t, "Alice", stored.Name)
	var bm domain.Bookmark
	require.NoError(t, db.First(&bm, "id = ?", b.ID).Error)
	require.Nil(t, bm.DeletedAt)
	require.Equal(t, aliceVersion, userVersion(t, db, alice.ID))
	require.Equal(t, bobVersion, userVersion(t, db, bob.ID))

	// The subtree walk of one user never reaches another's folders, whatever the ids.
	sub, err := repo.Subtree(ctx, alice.ID, root.ID)
	require.NoError(t, err)
	require.Len(t, sub, 2)

	// The list filter on another user's folder returns nothing of Alice's.
	rows, err := bookmarks.List(ctx, domain.BookmarkListQuery{UserID: bob.ID, Mode: domain.ListLive, FolderID: &root.ID, Limit: 10})
	require.NoError(t, err)
	require.Empty(t, rows)
}
