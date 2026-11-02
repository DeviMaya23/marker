# Plan: save a URL

Branch: `claude/brave-bohr-ejckv2`. Paths are under `backend/internal/` unless noted.

## Normalization (unit, table-driven) — `domain/url_test.go`
- [ ] http/https + host case + trailing slash give the same key (FR-22): `domain/url.go`, `TestNormalizeURL`
- [ ] Tracking params removed, others kept, order and fragment ignored: `domain/url.go`, `TestNormalizeURL`
- [ ] Different paths / non-tracking params give different keys: `domain/url.go`, `TestNormalizeURL`

## Create — `usecase/bookmark.go`, `usecase/bookmark_test.go`, `handler/bookmarks.go`, `handler/bookmarks_test.go`
- [ ] Happy path 201 + BookmarkSummary, `pending`: `TestCreateBookmark_HappyPath` (usecase), `TestCreateBookmark_Created` (handler)
- [ ] `ftp://x`, `javascript:x`, unparseable → 422 `invalid_url`: `TestCreateBookmark_InvalidURL`
- [ ] 2,049-char URL / 301-char title → 422 `validation_error` with `too_long`: `TestCreateBookmark_TooLong`
- [ ] Duplicate live and trashed → 409 `duplicate_bookmark` with `existing_bookmark_id`, `in_trash`: `TestCreateBookmark_Duplicate`
- [ ] At 1,000 → 409 `bookmark_limit_reached`; duplicate at 1,000 → duplicate: `TestCreateBookmark_Cap`
- [ ] Another user's `folder_id` → 404 `not_found`: `TestCreateBookmark_ForeignFolder`
- [ ] Supplied title stored; enqueue failure still 201: `TestCreateBookmark_TitleStored`, `TestCreateBookmark_EnqueueFailure`
- [ ] Enqueue only after commit (ordered fake): `TestCreateBookmark_EnqueueAfterCommit`

## Create (integration, written not run) — `repository/bookmark_create_integration_test.go`
- [ ] Row, `search_vector`, `users.version` increment: `TestCreateBookmark_Persists`
- [ ] Concurrent saves → one row, one duplicate: `TestCreateBookmark_Concurrent`
- [ ] Sweep finds a saved bookmark with no job: `TestCreateBookmark_FoundBySweep`

## Get — `usecase/bookmark.go`, `repository/bookmark.go`, `handler/bookmarks.go`
- [ ] Detail for own live/trashed; `content` null while pending: `TestGetBookmark_*` (usecase, handler)
- [ ] Other user's / unknown id → 404, two users: `TestGetBookmark_OtherUser` (integration), handler 404 test

## Fetch — `usecase/fetch.go`, `usecase/fetch_test.go`, `adaptor/extract.go`, `adaptor/extract_test.go`, `adaptor/pagefetcher.go`
- [ ] Success stores content, favicon, `ok`, version bump: `TestFetch_Success`; integration `TestFetch_HTTPTestServer`
- [ ] Empty title filled, non-empty kept (FR-5b): `TestFetch_Title*`
- [ ] Note/folder/trash unchanged, incl. trashed (FR-5c): `TestFetch_PreservesOtherFields`
- [ ] Deleted bookmark/user discarded, no error: `TestFetch_Deleted*`
- [ ] Any failure → `failed`; favicon failure alone → `ok`: `TestFetch_Failure`, `TestFetch_FaviconFailure`
- [ ] Not-pending left alone: `TestFetch_NotPending`
- [ ] Truncation of 500 KB text / 300-char title: `TestFetch_Truncates`
- [ ] Extraction (script/style/nav dropped, whitespace, charset, og:title, relative favicon, `/favicon.ico`): `adaptor/extract_test.go`
- [ ] Blocked address → `failed`: `TestFetch_BlockedAddress`

## Repo-wide
- [ ] `make check` passes
- [ ] Content stored/returned as plain text only

## Judgment calls
(filled in at the end)
