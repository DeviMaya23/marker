# Plan: list bookmarks and the trash (back end)

Branch: `claude/list-bookmarks-task-soo7jv`. Paths are under `backend/internal/`.
Test-file rule (TESTING.md): one test file per source file.

## Cursor (domain, unit, table-driven) — `domain/cursor.go`, tests in `domain/cursor_test.go`

- [ ] A cursor round-trips: mode, timestamp (to the nanosecond) and id — `TestCursor_RoundTrip`
- [ ] Each decoding failure is rejected (over 512 chars, not base64url, non-JSON, wrong shape, missing timestamp, unparseable timestamp, id not a UUID, wrong mode) — `TestDecodeCursor_Rejects` (table)

## List (usecase, unit, fake store) — `usecase/bookmark_list.go`, `usecase/bookmark_store.go` (new store method), fake in `usecase/fakes_test.go`, tests in `usecase/bookmark_list_test.go`

- [ ] Default limit 50 is asked of the store as 51 — `TestBookmarkService_List_DefaultLimitAsksForOneMore`
- [ ] More rows than limit gives `limit` items and a cursor from the last returned row; exactly `limit` gives nil cursor; none gives empty non-nil slice — `TestBookmarkService_List_Paging`
- [ ] Wrong-mode cursor rejected with `domain.ValidationError` on `cursor` — `TestBookmarkService_List_WrongModeCursor`
- [ ] Store receives decoded cursor values and the caller's id — `TestBookmarkService_List_PassesCursorAndUserToStore`

## Handler (unit, usecase double) — `handler/bookmarks_list.go`, `handler/bookmarks.go` (interface), tests in `handler/bookmarks_list_test.go`; `bookmarkSpy` in `handler/bookmarks_test.go` gains `List`

- [ ] 200 with `BookmarkPage` shape (`items: []`, `next_cursor: null`, summary fields incl. `deleted_at`) — `TestListBookmarks_PageShape`
- [ ] Passes `trashed`, `cursor`, `limit` as sent; zero limit when absent — `TestListBookmarks_PassesParametersDown`
- [ ] `limit=0`, `101` give 422 `limit/out_of_range`; `1` and `100` pass — `TestListBookmarks_LimitRange`
- [ ] `trashed=true` with `q`, `folder_id`, both: 422, one entry per offender; `q=` empty allowed — `TestListBookmarks_TrashedCombinations`
- [ ] Invalid cursor: 422 on `cursor` — `TestListBookmarks_InvalidCursor`
- [ ] `q=go` / `folder_id` without trashed: 501; `include_notes=true` alone ignored — `TestListBookmarks_NotImplementedSearch`
- [ ] Every failure asserts the `application/problem+json` shape — helper used by all failure tests above

## Repository (integration, `integration` tag, written not run) — `repository/bookmark_list.go`, tests in `repository/bookmark_list_integration_test.go`

- [ ] Live list newest first, trashed absent — `TestBookmarkRepository_List_LiveNewestFirst`
- [ ] Same `created_at` ordered by id desc; two pages split inside a tie give each row once — `TestBookmarkRepository_List_TiesSplitByID`
- [ ] 120 rows at limit 50 → 50/50/20, each once, nil cursor at end; 100 rows has no empty third page — `TestBookmarkRepository_List_Paging`
- [ ] Microsecond-only differences ordered and paged correctly — `TestBookmarkRepository_List_MicrosecondPrecision`
- [ ] Trash lists only trashed, most recently trashed first, ties split by id — `TestBookmarkRepository_List_Trash`
- [ ] User isolation (NFR-7) across a page boundary, live and trash — `TestBookmarkRepository_List_UserIsolation`
- [ ] No page content in the result — `TestBookmarkRepository_List_NoContent`

## Repo-wide

- [ ] `make check` passes
- [ ] Nothing outside the allowed paths changed

## Judgment calls

(filled in at the end)
