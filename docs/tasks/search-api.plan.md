# Plan: search-api (back end)

Branch: `claude/search-api-task-8d7ryb`. Query type: a separate `domain.BookmarkSearchQuery` and a new store method `Search` (see Judgment calls).

## Search cursor (domain, unit) — `backend/internal/domain/cursor_search.go`, test `cursor_search_test.go`
- [x] Round trip: encode then decode gives the same offset and accepts the same fingerprint — `TestSearchCursor_RoundTrip`
- [x] Fingerprint changes with `q`, `include_notes`, folder; unchanged by surrounding whitespace in `q` — `TestSearchFingerprint`
- [x] Rejections (over 512, not base64url, non-JSON, wrong shape, unknown key, missing field, negative offset, offset 100,001, other fingerprint, plain-list/trash cursor, and search cursor given to the plain decoder) — `TestDecodeSearchCursor_Rejects`; reverse direction and plain-decoder case in `cursor_search_test.go` too

## List with a query (usecase, unit) — `backend/internal/usecase/bookmark_list.go`, test `bookmark_list_test.go`, fake in `fakes_test.go`
- [x] Store receives trimmed query, include_notes, folder, user id, decoded offset, `limit+1` — `TestBookmarkService_List_Search_PassesQueryToStore`
- [x] More than limit rows: limit items and cursor offset prev+limit; exactly limit: no cursor; none: empty non-nil slice — `TestBookmarkService_List_Search_Paging`
- [x] Cursor for other q, plain-list cursor, trash cursor are `ValidationError` on `cursor` — `TestBookmarkService_List_Search_WrongCursorIsRejected`
- [x] Unknown folder: not-found returned, store search never called — `TestBookmarkService_List_Search_UnknownFolder`
- [x] No `q`: plain path unchanged (existing tests pass untouched) — existing `bookmark_list_test.go` tests

## Handler (unit) — `backend/internal/handler/bookmarks_list.go`, test `bookmarks_list_test.go`
- [x] `q=go` reaches usecase (no 501); blank q is no query; 200 chars passes, 201 is 422 `q too_long`; multi-byte counted as characters — `TestListBookmarks_Query`, `TestListBookmarks_PassesParametersDown`
- [x] `trashed=true` with q / folder_id / both is 422 as before; `include_notes` without q ignored; with q passed down — `TestListBookmarks_TrashedCombinations` (unchanged), `TestListBookmarks_PassesParametersDown`
- [x] Check order: `limit=0` with long q answers on limit; long q with bad cursor answers on q — `TestListBookmarks_CheckOrder`
- [x] Failures assert `application/problem+json` shape — `requireListProblem` in all of the above
- [x] Search cursor pre-check in handler (other request's cursor is 422) — `TestListBookmarks_SearchCursor`

## Search (repository, integration) — `backend/internal/repository/bookmark_search.go`, test `bookmark_search_integration_test.go`
- [x] Title, URL, content each match; note only with include_notes — `TestBookmarkRepository_Search_FieldsMatched`
- [x] Ranking: title > content; title > note-only; ties by created_at then id desc — `TestBookmarkRepository_Search_Ranking`
- [x] websearch syntax: phrase, `-word`, odd characters no error, stop-word-only empty — `TestBookmarkRepository_Search_QuerySyntax`
- [x] Stemming: `running` finds "How to run" — `TestBookmarkRepository_Search_Stemming`
- [x] Folder scope over three levels, not sibling or top level — `TestBookmarkRepository_Search_FolderScope`
- [x] Trashed not found, restored found, pending found by title and URL — `TestBookmarkRepository_Search_TrashedAndPending`
- [x] User isolation across a page boundary and with a folder — `TestBookmarkRepository_Search_UserIsolation`
- [x] Paging: 120 matches at limit 50 give 50/50/20, once each, in rank order; exact-end has no empty page; deterministic — `TestBookmarkRepository_Search_Paging`
- [x] Speed with ~1,000 bookmarks with several KB content, include_notes, under 1 s (measured time reported) — `TestBookmarkRepository_Search_Speed`
- [x] No `bookmark_content` access in the query (summary columns + search_vector only) — `TestBookmarkRepository_Search_QueryShape` (captures the SQL: no `bookmark_content`, `user_id`, `deleted_at IS NULL`, `websearch_to_tsquery('english'`, order)

## Shared subtree helper
- [x] Subtree SQL once, used by list and search — `repository/bookmark_list.go`; covered by existing list tests plus `TestBookmarkRepository_Search_FolderScope`

## Repo-wide
- [x] `make check` passes
- [x] `make test-integration-local` passes (Postgres version reported)
- [x] Nothing outside allowed paths changed; `go.mod`, `go.sum`, `openapi.yaml`, `internal/api`, migrations untouched
- [x] Break ranking on purpose, confirm a test fails, revert

## Judgment calls
1. **Query type:** a separate `domain.BookmarkSearchQuery` and a new store method `Search`, rather than extra fields on `BookmarkListQuery`. The list query carries a mode and a keyset cursor that mean nothing for search, and a search has an offset instead.
2. **Cursor wire format** (not fixed by the task): `{"k":"search","o":<offset>,"f":"<fingerprint>"}`. Because unknown keys are rejected, plain-list and trash cursors (`m`, `t`, `id`) fail the search decoder and the reverse, with no extra kind check needed.
3. **Fingerprint input:** SHA-256 of `notes \x00 folder \x00 trimmed q` (first 8 bytes, hex), with the query last so its text cannot blur into the other fields. The task fixed the inputs, not the byte layout.
4. **`ListBookmarksInput.IsSearch()`:** added so handler and usecase share one rule (live list with a non-blank query). The usecase also trims `Query` itself, so a blank query that reached it is never a search.
5. **Handler check 3 with `trashed=true`:** the trashed check (2) answers first, so `trashed=true` with a 201-character `q` is `q: not_allowed_with_trashed`, not `too_long`.
6. **Handler pre-check of the cursor** uses the search decoder when the request is a search (with the trimmed `q`, the flag and the folder), and the plain decoder otherwise, so a search cursor sent without `q` is `422 cursor invalid`.
7. **`include_notes` without a query** is dropped by the handler (the usecase never sees it), matching "ignored otherwise".
8. **Note column:** `COALESCE(note, '')` in the notes vector, though the column is NOT NULL in practice, so a NULL could never blank the whole vector.
9. **Shared subtree helper:** `inFolderSubtree` in `repository/bookmark_list.go`. `folder.go` has a separate `subtreeOf` that returns folder rows for another purpose; I left it alone, as it is not the bookmark-list SQL the task named.
10. **Test seeding:** content is stored through the real `RecordFetchSuccess` so the vector is built by app code. The 1,000-row speed test seeds with SQL (the save cap would otherwise get in the way) and builds the vector with the same formula as `refreshSearchVector`. Integration tests need `fetch_status` `ok`, not `success`.
11. **Offset cap:** a cursor with offset 100,000 is accepted and gives an empty page, as the task asks; the cap only bounds the cursor, not the first page.
12. **Pre-existing flaky frontend tests:** `make check` runs the whole frontend suite; under load `FolderSection.test.tsx` (folder delete, redirect after deleting) failed intermittently in my full runs (2 failures, then 1) and passes alone. I did not touch `frontend/`.
