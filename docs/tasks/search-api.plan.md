# Plan: search-api (back end)

Branch: `claude/search-api-task-8d7ryb`. Query type: a separate `domain.BookmarkSearchQuery` and a new store method `Search` (see Judgment calls).

## Search cursor (domain, unit) — `backend/internal/domain/cursor_search.go`, test `cursor_search_test.go`
- [ ] Round trip: encode then decode gives the same offset and accepts the same fingerprint — `TestSearchCursor_RoundTrip`
- [ ] Fingerprint changes with `q`, `include_notes`, folder; unchanged by surrounding whitespace in `q` — `TestSearchFingerprint`
- [ ] Rejections (over 512, not base64url, non-JSON, wrong shape, unknown key, missing field, negative offset, offset 100,001, other fingerprint, plain-list/trash cursor, and search cursor given to the plain decoder) — `TestDecodeSearchCursor_Rejects`; reverse direction and plain-decoder case in `cursor_search_test.go` too

## List with a query (usecase, unit) — `backend/internal/usecase/bookmark_list.go`, test `bookmark_list_test.go`, fake in `fakes_test.go`
- [ ] Store receives trimmed query, include_notes, folder, user id, decoded offset, `limit+1` — `TestBookmarkService_List_Search_PassesQueryToStore`
- [ ] More than limit rows: limit items and cursor offset prev+limit; exactly limit: no cursor; none: empty non-nil slice — `TestBookmarkService_List_Search_Paging`
- [ ] Cursor for other q, plain-list cursor, trash cursor are `ValidationError` on `cursor` — `TestBookmarkService_List_Search_WrongCursorIsRejected`
- [ ] Unknown folder: not-found returned, store search never called — `TestBookmarkService_List_Search_UnknownFolder`
- [ ] No `q`: plain path unchanged (existing tests pass untouched) — existing `bookmark_list_test.go` tests

## Handler (unit) — `backend/internal/handler/bookmarks_list.go`, test `bookmarks_list_test.go`
- [ ] `q=go` reaches usecase (no 501); blank q is no query; 200 chars passes, 201 is 422 `q too_long`; multi-byte counted as characters — `TestListBookmarks_Query`
- [ ] `trashed=true` with q / folder_id / both is 422 as before; `include_notes` without q ignored; with q passed down — `TestListBookmarks_TrashedCombinations`, `TestListBookmarks_PassesParametersDown`
- [ ] Check order: `limit=0` with long q answers on limit; long q with bad cursor answers on q — `TestListBookmarks_CheckOrder`
- [ ] Failures assert `application/problem+json` shape — `requireListProblem` in all of the above
- [ ] Search cursor pre-check in handler (other request's cursor is 422) — `TestListBookmarks_SearchCursor`

## Search (repository, integration) — `backend/internal/repository/bookmark_search.go`, test `bookmark_search_integration_test.go`
- [ ] Title, URL, content each match; note only with include_notes — `TestSearch_FieldsMatched`
- [ ] Ranking: title > content; title > note-only; ties by created_at then id desc — `TestSearch_Ranking`
- [ ] websearch syntax: phrase, `-word`, odd characters no error, stop-word-only empty — `TestSearch_QuerySyntax`
- [ ] Stemming: `running` finds "How to run" — `TestSearch_Stemming`
- [ ] Folder scope over three levels, not sibling or top level — `TestSearch_FolderScope`
- [ ] Trashed not found, restored found, pending found by title and URL — `TestSearch_TrashedAndPending`
- [ ] User isolation across a page boundary and with a folder — `TestSearch_UserIsolation`
- [ ] Paging: 120 matches at limit 50 give 50/50/20, once each, in rank order; exact-end has no empty page; deterministic — `TestSearch_Paging`
- [ ] Speed with ~1,000 bookmarks with several KB content, include_notes, under 1 s (measured time reported) — `TestSearch_Speed`
- [ ] No `bookmark_content` access in the query (summary columns + search_vector only) — `TestSearch_DoesNotReadContent` (content row removed after seeding the vector; still found)

## Shared subtree helper
- [ ] Subtree SQL once, used by list and search — `repository/bookmark_list.go`; covered by existing list tests plus `TestSearch_FolderScope`

## Repo-wide
- [ ] `make check` passes
- [ ] `make test-integration-local` passes (Postgres version reported)
- [ ] Nothing outside allowed paths changed; `go.mod`, `go.sum`, `openapi.yaml`, `internal/api`, migrations untouched
- [ ] Break ranking on purpose, confirm a test fails, revert

## Judgment calls
(filled in at the end)
