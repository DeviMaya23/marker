# Plan: list bookmarks and the trash (back end)

Branch: `claude/list-bookmarks-task-soo7jv`. Paths are under `backend/internal/`.
Test-file rule (TESTING.md): one test file per source file.

## Cursor (domain, unit, table-driven) — `domain/cursor.go`, tests in `domain/cursor_test.go`

- [x] A cursor round-trips: mode, timestamp (to the nanosecond) and id — `TestCursor_RoundTrip`
- [x] Each decoding failure is rejected (over 512 chars, not base64url, non-JSON, wrong shape, missing timestamp, unparseable timestamp, id not a UUID, wrong mode) — `TestDecodeCursor_Rejects` (table)

## List (usecase, unit, fake store) — `usecase/bookmark_list.go`, `usecase/bookmark_store.go` (new store method), fake in `usecase/fakes_test.go`, tests in `usecase/bookmark_list_test.go`

- [x] Default limit 50 is asked of the store as 51 — `TestBookmarkService_List_DefaultLimitAsksForOneMore`
- [x] More rows than limit gives `limit` items and a cursor from the last returned row; exactly `limit` gives nil cursor; none gives empty non-nil slice — `TestBookmarkService_List_Paging`
- [x] Wrong-mode cursor rejected with `domain.ValidationError` on `cursor` — `TestBookmarkService_List_WrongModeCursor`
- [x] Store receives decoded cursor values and the caller's id — `TestBookmarkService_List_PassesCursorAndUserToStore`

## Handler (unit, usecase double) — `handler/bookmarks_list.go`, `handler/bookmarks.go` (interface), tests in `handler/bookmarks_list_test.go`; `bookmarkSpy` in `handler/bookmarks_test.go` gains `List`

- [x] 200 with `BookmarkPage` shape (`items: []`, `next_cursor: null`, summary fields incl. `deleted_at`) — `TestListBookmarks_PageShape`
- [x] Passes `trashed`, `cursor`, `limit` as sent; zero limit when absent — `TestListBookmarks_PassesParametersDown`
- [x] `limit=0`, `101` give 422 `limit/out_of_range`; `1` and `100` pass — `TestListBookmarks_LimitRange`
- [x] `trashed=true` with `q`, `folder_id`, both: 422, one entry per offender; `q=` empty allowed — `TestListBookmarks_TrashedCombinations`
- [x] Invalid cursor: 422 on `cursor` — `TestListBookmarks_InvalidCursor`
- [x] `q=go` / `folder_id` without trashed: 501; `include_notes=true` alone ignored — `TestListBookmarks_NotImplementedSearch`
- [x] Every failure asserts the `application/problem+json` shape — helper used by all failure tests above

## Repository (integration, `integration` tag, written not run) — `repository/bookmark_list.go`, tests in `repository/bookmark_list_integration_test.go`

- [x] Live list newest first, trashed absent — `TestBookmarkRepository_List_LiveNewestFirst`
- [x] Same `created_at` ordered by id desc; two pages split inside a tie give each row once — `TestBookmarkRepository_List_TiesSplitByID`
- [x] 120 rows at limit 50 → 50/50/20, each once, nil cursor at end; 100 rows has no empty third page — `TestBookmarkRepository_List_Paging`
- [x] Microsecond-only differences ordered and paged correctly — `TestBookmarkRepository_List_MicrosecondPrecision`
- [x] Trash lists only trashed, most recently trashed first, ties split by id — `TestBookmarkRepository_List_Trash`
- [x] User isolation (NFR-7) across a page boundary, live and trash — `TestBookmarkRepository_List_UserIsolation`
- [x] No page content in the result — `TestBookmarkRepository_List_NoContent`

## Repo-wide

- [x] `make check` passes
- [x] Nothing outside the allowed paths changed

## Judgment calls

- **Field codes** `invalid`, `out_of_range`, `not_allowed_with_trashed` are constants in `domain/bookmark_list.go`, because `domain/errors.go` is off limits.
- **Cursor checked twice.** Check 3 (bad cursor, 422) must run before the 501 of check 4, and the 501 never reaches the usecase. The handler therefore calls `domain.DecodeCursor` to validate, and still passes the cursor string down as sent; the usecase decodes it again for the store. The usecase also rejects a bad or wrong-mode cursor as a `ValidationError` on `cursor`.
- **Absent limit** is passed as 0; the usecase treats any limit <= 0 as 50 (the handler already rejects 0 when it is sent).
- **Whitespace-only `q`** counts as absent for every check, including the 501 and the `trashed` combination.
- **Non-integer `limit`** (and `trashed=abc`, bad `folder_id`): the generated wrapper answers `400` `application/problem+json` with `code: validation_error`, title "Invalid request" and no `errors` array (via `problemFor`). Kept as is.
- **Decoder strictness.** Beyond the listed failures, the cursor rejects unknown JSON fields, trailing data after the object, padded base64 and a missing mode. A cursor of exactly 512 characters decodes, 513 does not (test pins both).
- **Store method** is `List(ctx, domain.BookmarkListQuery)` on `BookmarkStore` (the file already holds more than two methods). The query carries `Limit` already incremented by one; the usecase owns the +1.
- **Timestamp precision.** Nanoseconds are kept in the cursor; PostgreSQL stores microseconds, so values read from the database round-trip exactly. A hand-forged cursor with finer precision is truncated by the driver, which cannot skip or repeat real rows.
- **Stale existing test.** `handler/router_test.go` used `GET /bookmarks` as its "still a 501 stub" example; that is now implemented, so I pointed the example at `GET /folders`. No other existing test changed except adding `List` to the `bookmarkSpy` double and the usecase fake store.
- **Trash row without `deleted_at`** (cannot happen in the database) makes the usecase return an internal error rather than a cursor.
- **Extra tests** beyond the criteria: following cursors end to end in the usecase, the 512/513 boundary, cursor at a non-existent id, empty list for a user with no bookmarks, and handler check order. No dependency, migration, or contract change.
- `make check` needed `npm ci` in `frontend/` first (as AGENTS.md says); `node_modules` is not committed.
