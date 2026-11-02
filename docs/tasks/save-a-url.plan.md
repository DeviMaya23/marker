# Plan: save a URL

Branch: `claude/brave-bohr-ejckv2`. Paths are under `backend/internal/` unless noted.

## Normalization (unit, table-driven) — `domain/url_test.go`
- [x] http/https + host case + trailing slash give the same key (FR-22): `domain/url.go`, `TestNormalizeURL`
- [x] Tracking params removed, others kept, order and fragment ignored: `domain/url.go`, `TestNormalizeURL`
- [x] Different paths / non-tracking params give different keys: `domain/url.go`, `TestNormalizeURL`

## Create — `usecase/bookmark.go`, `usecase/bookmark_test.go`, `handler/bookmarks.go`, `handler/bookmarks_test.go`
- [x] Happy path 201 + BookmarkSummary, `pending`: `TestCreateBookmark_HappyPath` (usecase), `TestCreateBookmark_Created` (handler)
- [x] `ftp://x`, `javascript:x`, unparseable → 422 `invalid_url`: `TestCreateBookmark_InvalidURL`
- [x] 2,049-char URL / 301-char title → 422 `validation_error` with `too_long`: `TestCreateBookmark_TooLong`
- [x] Duplicate live and trashed → 409 `duplicate_bookmark` with `existing_bookmark_id`, `in_trash`: `TestCreateBookmark_Duplicate`
- [x] At 1,000 → 409 `bookmark_limit_reached`; duplicate at 1,000 → duplicate: `TestCreateBookmark_Cap`
- [x] Another user's `folder_id` → 404 `not_found`: `TestCreateBookmark_ForeignFolder`
- [x] Supplied title stored; enqueue failure still 201: `TestCreateBookmark_TitleStored`, `TestCreateBookmark_EnqueueFailure`
- [x] Enqueue only after commit (ordered fake): `TestCreateBookmark_EnqueueAfterCommit`

## Create (integration, written not run) — `repository/bookmark_create_integration_test.go`
- [x] Row, `search_vector`, `users.version` increment: `TestCreateBookmark_Persists`
- [x] Concurrent saves → one row, one duplicate: `TestCreateBookmark_Concurrent`
- [x] Sweep finds a saved bookmark with no job: `TestCreateBookmark_FoundBySweep`

## Get — `usecase/bookmark.go`, `repository/bookmark.go`, `handler/bookmarks.go`
- [x] Detail for own live/trashed; `content` null while pending: `TestGetBookmark_*` (usecase, handler)
- [x] Other user's / unknown id → 404, two users: `TestGetBookmark_OtherUser` (integration), handler 404 test

## Fetch — `usecase/fetch.go`, `usecase/fetch_test.go`, `adaptor/extract.go`, `adaptor/extract_test.go`, `adaptor/pagefetcher.go`
- [x] Success stores content, favicon, `ok`, version bump: `TestFetch_Success`; integration `TestFetch_HTTPTestServer`
- [x] Empty title filled, non-empty kept (FR-5b): `TestFetch_Title*`
- [x] Note/folder/trash unchanged, incl. trashed (FR-5c): `TestFetch_PreservesOtherFields`
- [x] Deleted bookmark/user discarded, no error: `TestFetch_Deleted*`
- [x] Any failure → `failed`; favicon failure alone → `ok`: `TestFetch_Failure`, `TestFetch_FaviconFailure`
- [x] Not-pending left alone: `TestFetch_NotPending`
- [x] Truncation of 500 KB text / 300-char title: `TestFetch_Truncates`
- [x] Extraction (script/style/nav dropped, whitespace, charset, og:title, relative favicon, `/favicon.ico`): `adaptor/extract_test.go`
- [x] Blocked address → `failed`: `TestFetch_BlockedAddress`

## Repo-wide
- [ ] `make check` passes — NOT fully green: lint, build, openapi-lint and frontend tests pass; 3 backend tests fail, none from this work (see Judgment calls)
- [x] Content stored/returned as plain text only

## Judgment calls
- **Pre-existing red tests, left alone.** `TestRouter_RequestBodyIsCappedAt64KB/at_the_cap...` (handler) fails at the base commit `a25b092` too: Echo's body limiter answers 413 for a body of exactly 64 KB. `TestGet_ProductionClientRefusesLoopback` and `TestGet_RefusesPrivateAndMetadataLiterals` (safehttp) fail because this container has no IPv6 (`address family not supported`). I did not skip or edit them (CLAUDE.md: no weakening tests), so `make check` ends red on `test-backend`.
- **Existing tests touched.** `NewServer` now takes the bookmark service, so `devlogin_test.go` and `router_test.go` call `NewServer(nil)`. `POST /bookmarks` is no longer a stub, so the CSRF test in `router_test.go` uses `POST /folders` as its stub write.
- **Validation order.** The task lists `invalid_url` before `too_long`. A bad URL wins over a too-long title, and a request with both a too-long URL and title reports both fields. Lengths count characters (runes), not bytes.
- **Empty or missing `url`** is `422 invalid_url` (it does not parse as http/https). The generated code does not enforce `required`.
- **Duplicate whose winner vanished.** If the unique constraint fires but the existing row is gone by the follow-up lookup (emptied from the trash in between), the usecase returns the bare `ErrDuplicateBookmark`. It has no `existing_bookmark_id`, so it is not in `domainProblems` and answers 500. This is a very narrow race; I did not invent a response the contract lacks.
- **Normalization details.** Port and userinfo are kept; the `utm_` prefix and param names are matched case-insensitively; params are re-encoded with `QueryEscape`; a path of only `/` becomes empty. `ParseBookmarkURL` also rejects an empty host.
- **Empty note** is returned as `null` (the contract treats null as a cleared note).
- **Extraction.** `<head>` is excluded from the text (the `<title>` is not visible text). Each text node is followed by a space, so words in adjacent elements do not run together. NUL bytes and invalid UTF-8 are stripped (PostgreSQL text rejects NUL). The `og:title` fallback also applies when `<title>` is empty. Only the first `<link>` with an `icon` token and an `href` counts; `apple-touch-icon` is not the token `icon`.
- **Favicon.** Stored under the final page URL's lowercase hostname. The `safehttp` favicon fetch shares the 11 s deadline with the page fetch. A favicon over 32 KB, empty, or failing is "no favicon".
- **SQL guards.** `RecordFetchSuccess`/`RecordFetchFailure` also require `fetch_status = 'pending'`, so a late duplicate job cannot overwrite a finished fetch; they also set `updated_at`. Zero rows counts as "gone" and is discarded.
- **FR-5b/5c in unit tests.** The "title only if empty" and "touch nothing else" rules live in the repository SQL, so the usecase unit tests use a fake that mirrors that contract. The real proof is `bookmark_fetch_integration_test.go` (written, not run).
- **Dependencies.** `golang.org/x/net` and `golang.org/x/text` moved from indirect to direct in `go.mod` (versions unchanged; `go` directive untouched). `x/text` is used directly only by an extraction test (`charmap`, to build a Latin-1 page).
- **Frontend deps** were installed with `npm ci` (git-ignored `node_modules`) so `make check` could run its lint step.
