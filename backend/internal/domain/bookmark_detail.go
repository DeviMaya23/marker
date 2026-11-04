package domain

// Limits on bookmark input and storage (NFR-14, NFR-17).
const (
	MaxURLLength    = 2048
	MaxTitleLength  = 300
	MaxNoteLength   = 500
	MaxBookmarks    = 1000
	MaxContentBytes = 500 << 10
	MaxFaviconBytes = 32 << 10
)

// BookmarkDetail is a bookmark with its stored page text. Content is nil while the
// fetch is pending or after it failed.
type BookmarkDetail struct {
	Bookmark
	Content *string
}

// FetchedPage is what the page fetcher found: plain text, never HTML. Favicon is nil
// when there is none or it could not be fetched.
type FetchedPage struct {
	Title   string
	Text    string
	Favicon *FaviconData
}

// FaviconData is a fetched icon, before it is stored for a user.
type FaviconData struct {
	Host        string
	ContentType string
	Data        []byte
}

// FetchResult is a finished fetch, already truncated to the storage limits and ready
// to store. Title is only applied when the bookmark's own title is empty (FR-5b).
type FetchResult struct {
	Title   string
	Text    string
	Favicon *FaviconData
}
