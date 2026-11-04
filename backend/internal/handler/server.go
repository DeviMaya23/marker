package handler

import "marker/internal/api"

// Server implements the generated strict server interface, one method per operation in
// openapi.yaml. Operations without an implementation fall through to the embedded
// `unimplemented` and answer 501.
//
// To implement an operation, define its method on *Server in a file named after its
// feature (bookmarks.go, folders.go, ...). A method on Server shadows the promoted stub
// of the same name, so server.go and stubs.go need no edit beyond a new dependency field.
type Server struct {
	unimplemented

	bookmarks BookmarkService
	folders   FolderService
	sync      SyncService
	favicons  FaviconService
}

func NewServer(bookmarks BookmarkService, folders FolderService, sync SyncService, favicons FaviconService) *Server {
	return &Server{bookmarks: bookmarks, folders: folders, sync: sync, favicons: favicons}
}

// The compiler checks that Server covers every operation in the contract.
var _ api.StrictServerInterface = (*Server)(nil)
