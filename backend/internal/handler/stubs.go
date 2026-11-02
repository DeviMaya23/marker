package handler

import (
	"context"

	"marker/internal/api"
)

// unimplemented answers every operation with ErrNotImplemented (HTTP 501). Server
// embeds it; real implementations on Server take precedence.
type unimplemented struct{}

func (unimplemented) DeleteAccount(context.Context, api.DeleteAccountRequestObject) (api.DeleteAccountResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) AuthCallback(context.Context, api.AuthCallbackRequestObject) (api.AuthCallbackResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) AuthLogin(context.Context, api.AuthLoginRequestObject) (api.AuthLoginResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) AuthLogout(context.Context, api.AuthLogoutRequestObject) (api.AuthLogoutResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) ListBookmarks(context.Context, api.ListBookmarksRequestObject) (api.ListBookmarksResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) CreateBookmark(context.Context, api.CreateBookmarkRequestObject) (api.CreateBookmarkResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) DeleteBookmark(context.Context, api.DeleteBookmarkRequestObject) (api.DeleteBookmarkResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) GetBookmark(context.Context, api.GetBookmarkRequestObject) (api.GetBookmarkResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) UpdateBookmark(context.Context, api.UpdateBookmarkRequestObject) (api.UpdateBookmarkResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) RestoreBookmark(context.Context, api.RestoreBookmarkRequestObject) (api.RestoreBookmarkResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) GetFavicon(context.Context, api.GetFaviconRequestObject) (api.GetFaviconResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) ListFolders(context.Context, api.ListFoldersRequestObject) (api.ListFoldersResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) CreateFolder(context.Context, api.CreateFolderRequestObject) (api.CreateFolderResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) DeleteFolder(context.Context, api.DeleteFolderRequestObject) (api.DeleteFolderResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) UpdateFolder(context.Context, api.UpdateFolderRequestObject) (api.UpdateFolderResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) GetSyncVersion(context.Context, api.GetSyncVersionRequestObject) (api.GetSyncVersionResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) EmptyTrash(context.Context, api.EmptyTrashRequestObject) (api.EmptyTrashResponseObject, error) {
	return nil, ErrNotImplemented
}
