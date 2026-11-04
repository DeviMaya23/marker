# Verification report: list bookmarks and the trash (back end)

Verifier branch: `claude/list-bookmarks-verify-v63b1p` (built on `claude/list-bookmarks-task-soo7jv`, tip `f6fb6da`).

**Result: no Blocking findings.** Integration tests written, not run.

## 1. `make check`

Passes (exit 0) after `npm ci` in `frontend/` (a fresh checkout has no `node_modules`; without it `lint-frontend` fails on a missing `@eslint/js`). Includes `go vet -tags integration`, so the integration tests compile. Redocly reports 7 tag-description warnings in `openapi.yaml`; they were there before and are not part of this task.

## 2. Acceptance criteria

"Real?" = would the test fail if the behaviour were missing.

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| C1 | Cursor round-trips to the nanosecond (mode, time, id) | `domain` `TestCursor_RoundTrip` (both modes, non-UTC input, compares `UnixNano`) | Yes; a millisecond truncation would fail | Met |
| C2 | Every decode failure rejected | `TestDecodeCursor_Rejects` (all 8 listed cases plus extras) and `TestDecodeCursor_LengthLimitIsExactly512` | Yes; each row asserts `ErrInvalidCursor` | Met |
| U1 | Default limit 50 asked as 51 | `usecase` `TestBookmarkService_List_DefaultLimitAsksForOneMore` | Yes, reads the limit the fake store received | Met |
| U2 | `limit` rows + cursor from the last returned row; exactly `limit` gives nil; none gives empty non-nil | `TestBookmarkService_List_Paging` (live and trash) and `..._FollowingTheCursorVisitsEachRowOnce` | Yes; the cursor id is compared to the last returned row, not the extra one | Met |
| U3 | Wrong-mode cursor gives `ValidationError` on `cursor` | `TestBookmarkService_List_WrongModeCursorIsRejected` | Yes; asserts exact `FieldError` | Met |
| U4 | Store gets decoded cursor values and caller id | `TestBookmarkService_List_PassesCursorAndUserToStore` | Yes; includes a non-existent id and ns precision | Met |
| H1 | 200 `BookmarkPage` shape, `[]` not `null`, `deleted_at` present | `handler` `TestListBookmarks_PageShape` | Yes; `JSONEq` on empty and nil-slice cases | Met |
| H2 | Passes `trashed`, `cursor`, `limit` as sent; zero when absent | `TestListBookmarks_PassesParametersDown` | Yes; compares the spy's input | Met |
| H3 | `limit` 0 and 101 give 422 `limit/out_of_range`; 1 and 100 pass | `TestListBookmarks_LimitRange` (also `-1`, `abc`) | Yes | Met |
| H4 | `trashed=true` with `q`, `folder_id`, both: one entry each; empty `q` allowed | `TestListBookmarks_TrashedCombinations` | Yes | Met |
| H5 | Invalid cursor gives 422 on `cursor` | `TestListBookmarks_InvalidCursor` | Yes | Met |
| H6 | `q`/`folder_id` without `trashed` gives 501; `include_notes` ignored | `TestListBookmarks_SearchAndFolderAreNotImplemented`, `..._PassesParametersDown` | Yes | Met |
| H7 | Failures assert `application/problem+json` | `requireProblem` / `requireListProblem` used by every failure test | Yes (helper asserts content type and code) | Met |
| R1-R7 | Repository: ordering, ties, 120/100 paging, microseconds, trash, isolation (NFR-7), no content | `repository/bookmark_list_integration_test.go` (names in section 3) | Cannot run; read only | Met on reading, unverified by execution |
| W1 | `make check` passes | run above | | Met |
| W2 | Nothing outside allowed paths changed | `git diff --stat 7ec7d49 HEAD` (15 files, all under `backend/internal/` except the plan) | | Met (see N2) |

Requirement IDs: FR-7 (H1, U2, R1, R3), FR-18 (R5), FR-21 (R1, R5), NFR-7 (R6). The repository criteria R1-R7, and so the FR-7 paging, FR-18 and NFR-7 evidence, depend **only on integration tests**; the unit tests cover the handler and usecase logic around them.

Integration tests that exist (build tag `integration`, written, not run): `LiveNewestFirstWithoutTrashed`, `EmptyForAUserWithNoBookmarks`, `SameCreatedAtOrdersByIDDescendingAndPagesSplitTheTie`, `PagingThrough120And100Bookmarks`, `MicrosecondDifferencesAreOrderedAndPaged`, `TrashIsTrashedOnlyMostRecentlyTrashedFirst`, `TrashTiesOnDeletedAtSplitByID`, `CursorAtAnIDThatDoesNotExistStillPagesFromThere`, `UserIsolation`, `ReturnsNoPageContent`.

## 3. Plan check (`list-bookmarks.plan.md`, read after the criteria)

- Every criterion in the task file appears in the plan. None is missing.
- Every ticked item has a test that checks the behaviour, with two naming differences: the plan names `TestBookmarkService_List_WrongModeCursor` (actual: `..._WrongModeCursorIsRejected`) and `TestListBookmarks_NotImplementedSearch` (actual: `TestListBookmarks_SearchAndFolderAreNotImplemented`). The tests exist and are correct; only the plan text is stale. The plan also gives repository test names that differ from the actual longer names. Non-blocking.
- Plan vs diff: the diff matches the plan's file list and judgment calls. The plan says the `router_test.go` edit is the only existing test changed besides the doubles; confirmed.

## 4. Rule checks

- **Only `handler/` imports `internal/api`:** yes (problem.go, stubs.go, server.go, router.go, bookmarks*.go and handler tests; no other package).
- **Every repository query filters by `user_id`:** the only new query (`BookmarkRepository.List`) does, `Where("user_id = ?")`, before any mode or cursor clause. No exception was needed.
- **`users.version` incremented in write transactions:** not applicable, the slice adds no write.
- **`go.mod` / `go.sum`:** not in the diff; no new dependency.
- **Verifier checks from the task file:**
  - No `OFFSET`; cursor values are bound (`?`); the only interpolated text is `sortCol`, one of two constants.
  - Nanosecond precision end to end: `time.RFC3339Nano` in the cursor, `time.Time` bound to the query. No `Truncate`, `UnixMilli` or short format string.
  - Row-value comparison `(created_at, id) < (?, ?)` / `(deleted_at, id) < (?, ?)` matches the order.
  - The extra row never leaves the usecase (`rows[:limit]`); `items` is non-nil at usecase and handler.
  - Check order limit, trashed combinations, cursor, 501: matches the task, with a test for each adjacent pair.
  - `problem.go`, `server.go`, `main.go`, `domain/errors.go`, migrations, Makefile, `openapi.yaml`, `docs/` (except the plan): untouched.
  - The query selects only summary columns; no join on `bookmark_content`.
- **Non-integer `limit`:** the generated wrapper answers `400` `application/problem+json`, `code: validation_error`, no `errors` array. The builder reported this and a test pins it.

## 5. Attempts to break it

Done at unit level (the handler runs through the real router):

- `limit` 0, 1, 100, 101, -1, `abc`: as specified.
- Cursor of exactly 512 and 513 characters: 512 decodes and reaches the usecase; 513 gives 422. I added `TestListBookmarks_CursorLengthBoundary` to `handler/bookmarks_list_test.go` for the handler end. (No valid base64url string is 513 characters long, so the 513 case is 512 plus one character.)
- Live cursor for the trash and the reverse: 422 on `cursor`.
- `trashed=true&q=` and `q=%20`: allowed. `trashed=false&folder_id=<uuid>`: 501. `q=go&cursor=bad`: 422 before the 501.
- A cursor whose id is a valid UUID that does not exist: passes to the store (unit and integration test).
- Two bookmarks in the same microsecond: covered only by the integration tie tests; not run.
- Concurrent writes: the list is read-only; a row inserted between pages can only appear on a page not yet read or not at all (a keyset property). Not a defect.

## 6. Findings

### Blocking

None.

### Non-blocking

- **N1.** `uuid.UUID`'s JSON decoding also accepts `urn:uuid:...`, `{...}` and 32-hex ids in a cursor. The task says "an `id` that is not a UUID"; these are UUIDs, and a forged one only pages from that position, so harmless.
- **N2.** `handler/router_test.go` changed its "reaches the handler" example from `GET /bookmarks` to `GET /folders`. Needed because `/bookmarks` is no longer a stub, and the builder recorded it. It is not a test double, so it is outside the task's literal list, but nothing else could be done.
- **N3.** The cursor is decoded in the handler (for check order) and again in the usecase. Documented in the plan; harmless.
- **N4.** Plan text has stale test names (section 3).
- **N5.** The whole repository half rests on integration tests that nobody has run. The user should run `make test-integration` before merging.

## 7. Change by the verifier

Added `TestListBookmarks_CursorLengthBoundary` to `backend/internal/handler/bookmarks_list_test.go`. No source code changed. `make check` passes with it.
