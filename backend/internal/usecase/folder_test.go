package usecase

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"marker/internal/domain"
)

type folderFixture struct {
	svc   *FolderService
	store *fakeFolderStore
	user  uuid.UUID
}

func newFolderFixture() *folderFixture {
	s := newFakeFolderStore()
	return &folderFixture{svc: NewFolderService(s), store: s, user: uuid.New()}
}

func fieldErrs(t *testing.T, err error) []domain.FieldError {
	t.Helper()
	var ve *domain.ValidationError
	require.ErrorAs(t, err, &ve)
	return ve.Fields
}

func TestFolderService_Names(t *testing.T) {
	tests := []struct {
		name     string
		in       string
		wantCode string // empty: accepted
		stored   string
	}{
		{"trimmed", "  Work \t", "", "Work"},
		{"spaces only", "   ", domain.FieldCodeRequired, ""},
		{"empty", "", domain.FieldCodeRequired, ""},
		{"100 characters pass", strings.Repeat("a", 100), "", strings.Repeat("a", 100)},
		{"101 characters fail", strings.Repeat("a", 101), domain.FieldCodeTooLong, ""},
		{"100 multi-byte characters pass", strings.Repeat("é", 100), "", strings.Repeat("é", 100)},
		{"101 multi-byte characters fail", strings.Repeat("日", 101), domain.FieldCodeTooLong, ""},
		{"padding does not count", " " + strings.Repeat("a", 100) + " ", "", strings.Repeat("a", 100)},
	}
	for _, tt := range tests {
		t.Run("create "+tt.name, func(t *testing.T) {
			f := newFolderFixture()
			got, err := f.svc.Create(context.Background(), f.user, domain.FolderCreate{Name: tt.in})
			if tt.wantCode != "" {
				require.Equal(t, []domain.FieldError{{Field: "name", Code: tt.wantCode}}, fieldErrs(t, err))
				require.Empty(t, f.store.folders)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.stored, got.Name)
			require.Equal(t, tt.stored, f.store.folders[0].Name)
		})
		t.Run("update "+tt.name, func(t *testing.T) {
			f := newFolderFixture()
			fo := f.store.add(f.user, nil, "Old")
			got, err := f.svc.Update(context.Background(), f.user, fo.ID, domain.FolderUpdate{Name: domain.Value(tt.in)})
			if tt.wantCode != "" {
				require.Equal(t, []domain.FieldError{{Field: "name", Code: tt.wantCode}}, fieldErrs(t, err))
				require.Equal(t, "Old", f.store.folders[0].Name)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.stored, got.Name)
		})
	}
}

func TestFolderService_Create_Validation(t *testing.T) {
	f := newFolderFixture()
	ctx := context.Background()

	// Unknown keys come before the name.
	_, err := f.svc.Create(ctx, f.user, domain.FolderCreate{Name: "", UnknownKeys: []string{"depth", "foo"}})
	require.Equal(t, []domain.FieldError{
		{Field: "depth", Code: domain.FieldCodeUnknownField}, {Field: "foo", Code: domain.FieldCodeUnknownField},
	}, fieldErrs(t, err))

	// The name comes before the parent.
	_, err = f.svc.Create(ctx, f.user, domain.FolderCreate{Name: "", ParentID: ptr(uuid.New())})
	require.Equal(t, []domain.FieldError{{Field: "name", Code: domain.FieldCodeRequired}}, fieldErrs(t, err))
	require.Empty(t, f.store.folders)
}

func ptr[T any](v T) *T { return &v }

func TestFolderService_Create_Depth(t *testing.T) {
	f := newFolderFixture()
	ctx := context.Background()
	d1 := f.store.add(f.user, nil, "one")
	d2 := f.store.add(f.user, &d1, "two")
	d3 := f.store.add(f.user, &d2, "three")
	other := f.store.add(uuid.New(), nil, "theirs")

	tests := []struct {
		name      string
		parent    *uuid.UUID
		wantDepth int
		wantErr   error
	}{
		{"top level is depth 1", nil, 1, nil},
		{"parent depth 1 gives 2", &d1.ID, 2, nil},
		{"parent depth 2 gives 3", &d2.ID, 3, nil},
		{"parent depth 3 is too deep", &d3.ID, 0, domain.ErrFolderDepthExceeded},
		{"another user's parent is not found", &other.ID, 0, gorm.ErrRecordNotFound},
		{"unknown parent is not found", ptr(uuid.New()), 0, gorm.ErrRecordNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			before := len(f.store.folders)
			got, err := f.svc.Create(ctx, f.user, domain.FolderCreate{Name: "new " + tt.name, ParentID: tt.parent})
			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
				require.Len(t, f.store.folders, before, "nothing is written")
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.wantDepth, got.Depth)
			require.Equal(t, tt.wantDepth, f.store.lastCreated.Depth)
			require.Equal(t, 0, got.BookmarkCount)
		})
	}
}

func TestFolderService_Create_NameConflict(t *testing.T) {
	f := newFolderFixture()
	f.store.add(f.user, nil, "Work")
	_, err := f.svc.Create(context.Background(), f.user, domain.FolderCreate{Name: " WORK "})
	require.ErrorIs(t, err, domain.ErrFolderNameConflict)
}

func TestFolderService_Update_CycleAndDepth(t *testing.T) {
	// Every case gets a fresh tree:
	//   root(1) -> child(2) -> grand(3)      lone(1)
	//   top2(1) -> deep2(2)                  pair(1) -> pairChild(2)
	type tree struct{ root, child, grand, lone, deep2, pair domain.Folder }
	tests := []struct {
		name    string
		pick    func(tree) (id uuid.UUID, parent domain.Field[uuid.UUID])
		wantErr error
	}{
		{"into itself", func(tr tree) (uuid.UUID, domain.Field[uuid.UUID]) { return tr.root.ID, domain.Value(tr.root.ID) }, domain.ErrFolderCycle},
		{"into its child", func(tr tree) (uuid.UUID, domain.Field[uuid.UUID]) { return tr.root.ID, domain.Value(tr.child.ID) }, domain.ErrFolderCycle},
		{"into its grandchild", func(tr tree) (uuid.UUID, domain.Field[uuid.UUID]) { return tr.root.ID, domain.Value(tr.grand.ID) }, domain.ErrFolderCycle},
		{"height-2 subtree under a depth-2 parent is too deep", func(tr tree) (uuid.UUID, domain.Field[uuid.UUID]) { return tr.pair.ID, domain.Value(tr.deep2.ID) }, domain.ErrFolderDepthExceeded},
		{"height-2 subtree under a depth-1 parent fits", func(tr tree) (uuid.UUID, domain.Field[uuid.UUID]) { return tr.pair.ID, domain.Value(tr.lone.ID) }, nil},
		{"single folder under a depth-2 parent fits", func(tr tree) (uuid.UUID, domain.Field[uuid.UUID]) { return tr.lone.ID, domain.Value(tr.deep2.ID) }, nil},
		{"single folder under a depth-3 parent is too deep", func(tr tree) (uuid.UUID, domain.Field[uuid.UUID]) { return tr.lone.ID, domain.Value(tr.grand.ID) }, domain.ErrFolderDepthExceeded},
		{"depth-3 chain under a root folder is too deep", func(tr tree) (uuid.UUID, domain.Field[uuid.UUID]) { return tr.root.ID, domain.Value(tr.lone.ID) }, domain.ErrFolderDepthExceeded},
		{"depth-2 subtree of a depth-3 chain to the top fits", func(tr tree) (uuid.UUID, domain.Field[uuid.UUID]) { return tr.child.ID, domain.Null[uuid.UUID]() }, nil},
		{"to the top level", func(tr tree) (uuid.UUID, domain.Field[uuid.UUID]) { return tr.grand.ID, domain.Null[uuid.UUID]() }, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newFolderFixture()
			var tr tree
			tr.root = f.store.add(f.user, nil, "root")
			tr.child = f.store.add(f.user, &tr.root, "child")
			tr.grand = f.store.add(f.user, &tr.child, "grand")
			tr.lone = f.store.add(f.user, nil, "lone")
			top2 := f.store.add(f.user, nil, "top2")
			tr.deep2 = f.store.add(f.user, &top2, "deep2")
			tr.pair = f.store.add(f.user, nil, "pair")
			f.store.add(f.user, &tr.pair, "pairChild")

			id, parent := tt.pick(tr)
			_, err := f.svc.Update(context.Background(), f.user, id, domain.FolderUpdate{ParentID: parent})
			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
				require.Zero(t, f.store.updates, "nothing is written")
				return
			}
			require.NoError(t, err)
			require.Equal(t, 1, f.store.updates)
		})
	}

	t.Run("cycle is checked before depth", func(t *testing.T) {
		// root(1) -> child(2) -> grand(3): moving root into grand is a cycle and
		// would also be too deep; the cycle is what is reported.
		f := newFolderFixture()
		root := f.store.add(f.user, nil, "root")
		child := f.store.add(f.user, &root, "child")
		grand := f.store.add(f.user, &child, "grand")
		_, err := f.svc.Update(context.Background(), f.user, root.ID, domain.FolderUpdate{ParentID: domain.Value(grand.ID)})
		require.ErrorIs(t, err, domain.ErrFolderCycle)
		require.NotErrorIs(t, err, domain.ErrFolderDepthExceeded)
	})
}

func TestFolderService_Update_CheckOrder(t *testing.T) {
	f := newFolderFixture()
	ctx := context.Background()
	other := f.store.add(uuid.New(), nil, "theirs")
	mine := f.store.add(f.user, nil, "mine")

	t.Run("unknown keys before the name", func(t *testing.T) {
		_, err := f.svc.Update(ctx, f.user, uuid.New(), domain.FolderUpdate{Name: domain.Value(" "), UnknownKeys: []string{"foo"}})
		require.Equal(t, []domain.FieldError{{Field: "foo", Code: domain.FieldCodeUnknownField}}, fieldErrs(t, err))
	})
	t.Run("unknown keys before name null", func(t *testing.T) {
		_, err := f.svc.Update(ctx, f.user, uuid.New(), domain.FolderUpdate{Name: domain.Null[string](), UnknownKeys: []string{"id"}})
		require.Equal(t, []domain.FieldError{{Field: "id", Code: domain.FieldCodeUnknownField}}, fieldErrs(t, err))
	})
	t.Run("the name before the folder", func(t *testing.T) {
		_, err := f.svc.Update(ctx, f.user, uuid.New(), domain.FolderUpdate{Name: domain.Value(" ")})
		require.Equal(t, []domain.FieldError{{Field: "name", Code: domain.FieldCodeRequired}}, fieldErrs(t, err))
	})
	t.Run("another user's folder is not found", func(t *testing.T) {
		_, err := f.svc.Update(ctx, f.user, other.ID, domain.FolderUpdate{Name: domain.Value("x")})
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	})
	t.Run("another user's parent is not found", func(t *testing.T) {
		_, err := f.svc.Update(ctx, f.user, mine.ID, domain.FolderUpdate{ParentID: domain.Value(other.ID)})
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	})
	t.Run("the folder is checked before the parent", func(t *testing.T) {
		_, err := f.svc.Update(ctx, f.user, uuid.New(), domain.FolderUpdate{ParentID: domain.Value(uuid.New())})
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
		require.Zero(t, f.store.updates)
	})
}

func TestFolderService_Update_ThreeStates(t *testing.T) {
	ctx := context.Background()
	build := func() (*folderFixture, domain.Folder, domain.Folder) {
		f := newFolderFixture()
		parent := f.store.add(f.user, nil, "parent")
		child := f.store.add(f.user, &parent, "child")
		return f, parent, child
	}

	t.Run("absent parent leaves it", func(t *testing.T) {
		f, parent, child := build()
		got, err := f.svc.Update(ctx, f.user, child.ID, domain.FolderUpdate{Name: domain.Value("renamed")})
		require.NoError(t, err)
		require.Equal(t, &parent.ID, got.ParentID)
		require.False(t, f.store.lastUpdate.ParentID.Set)
	})
	t.Run("null moves to the top", func(t *testing.T) {
		f, _, child := build()
		got, err := f.svc.Update(ctx, f.user, child.ID, domain.FolderUpdate{ParentID: domain.Null[uuid.UUID]()})
		require.NoError(t, err)
		require.Nil(t, got.ParentID)
		require.True(t, f.store.lastUpdate.ParentID.Null)
	})
	t.Run("a value moves under it", func(t *testing.T) {
		f, _, child := build()
		target := f.store.add(f.user, nil, "target")
		got, err := f.svc.Update(ctx, f.user, child.ID, domain.FolderUpdate{ParentID: domain.Value(target.ID)})
		require.NoError(t, err)
		require.Equal(t, &target.ID, got.ParentID)
	})
	t.Run("name null is invalid", func(t *testing.T) {
		f, _, child := build()
		_, err := f.svc.Update(ctx, f.user, child.ID, domain.FolderUpdate{Name: domain.Null[string]()})
		require.Equal(t, []domain.FieldError{{Field: "name", Code: domain.FieldCodeInvalid}}, fieldErrs(t, err))
		require.Zero(t, f.store.updates)
	})
}

func TestFolderService_Update_NoOpAndSelfNames(t *testing.T) {
	ctx := context.Background()

	t.Run("empty update writes nothing and returns the folder", func(t *testing.T) {
		f := newFolderFixture()
		fo := f.store.add(f.user, nil, "Work")
		f.store.counts[fo.ID] = 4
		got, err := f.svc.Update(ctx, f.user, fo.ID, domain.FolderUpdate{})
		require.NoError(t, err)
		require.Equal(t, fo.ID, got.ID)
		require.Equal(t, 4, got.BookmarkCount)
		require.Zero(t, f.store.updates)
		require.Zero(t, f.store.versions[f.user])
	})
	t.Run("empty update on another user's folder is not found", func(t *testing.T) {
		f := newFolderFixture()
		fo := f.store.add(uuid.New(), nil, "Theirs")
		_, err := f.svc.Update(ctx, f.user, fo.ID, domain.FolderUpdate{})
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	})

	for _, name := range []string{"Work", "work", "WORK"} {
		t.Run("rename to "+name+" is not a conflict", func(t *testing.T) {
			f := newFolderFixture()
			fo := f.store.add(f.user, nil, "Work")
			got, err := f.svc.Update(ctx, f.user, fo.ID, domain.FolderUpdate{Name: domain.Value(name)})
			require.NoError(t, err)
			require.Equal(t, name, got.Name)
		})
	}
	t.Run("moving to the current parent is not a conflict", func(t *testing.T) {
		f := newFolderFixture()
		parent := f.store.add(f.user, nil, "p")
		fo := f.store.add(f.user, &parent, "Work")
		_, err := f.svc.Update(ctx, f.user, fo.ID, domain.FolderUpdate{ParentID: domain.Value(parent.ID)})
		require.NoError(t, err)
	})
	t.Run("a sibling's name is a conflict", func(t *testing.T) {
		f := newFolderFixture()
		f.store.add(f.user, nil, "Work")
		fo := f.store.add(f.user, nil, "Play")
		_, err := f.svc.Update(ctx, f.user, fo.ID, domain.FolderUpdate{Name: domain.Value("work")})
		require.ErrorIs(t, err, domain.ErrFolderNameConflict)
	})
}

func TestFolderService_Delete(t *testing.T) {
	f := newFolderFixture()
	fo := f.store.add(f.user, nil, "Work")
	f.store.deletion = domain.FolderDeletion{DeletedFolders: 3, TrashedBookmarks: 7}

	got, err := f.svc.Delete(context.Background(), f.user, fo.ID)
	require.NoError(t, err)
	require.Equal(t, domain.FolderDeletion{DeletedFolders: 3, TrashedBookmarks: 7}, got)

	_, err = f.svc.Delete(context.Background(), uuid.New(), fo.ID)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
}
