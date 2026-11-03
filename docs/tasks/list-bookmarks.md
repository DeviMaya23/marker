# Task: list bookmarks and the trash (back end)

> Trial slice, back end, run in parallel with the front-end slice `docs/tasks/bookmark-list.md`. One backend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

A signed-in user can read their bookmarks a page at a time, newest first, and read their trash a page at a time, most recently trashed first. This is the server half of the list screen (FR-7) and the trash view (FR-18).

Requirements covered: FR-7 (list, newest first, pages), FR-18 (view the trash), FR-21 (trashed bookmarks are not in the list), NFR-7 (another user's bookmarks never appear).

Out of scope, and why:

- **`q`, `include_notes`, `folder_id`.** Search and the folder subtree are a later slice. A request that uses `q` or `folder_id` without `trashed=true` answers `501 not_implemented`, exactly as the stub does today (see "Parameters").
- Everything else on `/bookmarks` and the rest of the API: `updateBookmark`, `deleteBookmark`, `restoreBookmark`, `emptyTrash`, folders. They stay stubs.
- A search-ranked cursor. Only the two orderings below exist in this slice.

## Role and ownership

Role: Backend (see `AGENTS.md`).

You may change `backend/**` except `backend/migration/`. You may not change `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/list-bookmarks.plan.md`, see `AGENTS.md`), the frontend, migrations or the Makefile. You need no migration: the table and the index `bookmarks_list_idx ON bookmarks (user_id, deleted_at, created_at DESC, id DESC)` exist. If you think you need one, stop and ask.

**Shared files.** This task runs at the same time as a front-end task that changes only `frontend/**`, so there is no overlap in directories. You do not need to change `domainProblems` in `problem.go`, `server.go`, `cmd/server/main.go` or `domain/errors.go`: the new errors reuse `domain.ValidationError` and `ErrNotImplemented`, and `NewBookmarkService` keeps its signature. If you find you must change one of them, stop and ask.

## Operations used

- `listBookmarks` (`GET /api/v1/bookmarks`). Implement it by defining a method on `*handler.Server`, replacing its 501 stub. Response `BookmarkPage { items: BookmarkSummary[], next_cursor: string | null }`.

Authentication, CSRF and rate limiting are already applied by the router; do not repeat them in the handler. Take the types from `internal/api` (generated); only `handler/` imports it.

## Behavior

### Parameters

| Parameter | Behavior in this slice |
|---|---|
| `trashed` | Absent or `false`: the live list. `true`: the trash. |
| `cursor` | Opaque string from a previous `next_cursor`. Absent: the first page. |
| `limit` | Integer 1 to 100, default 50. |
| `q` | An empty value (after trimming) counts as absent. Otherwise see below. |
| `folder_id` | Absent, or see below. |
| `include_notes` | Accepted and ignored (it only means something with `q`). |

Checks run in this order, and the first failure answers:

1. `limit` below 1 or above 100: `422 validation_error`, `errors: [{field: "limit", code: "out_of_range"}]`. A value that is not an integer is whatever the generated wrapper already answers for a bad query value; keep that, and say in your report what it is.
2. `trashed=true` together with a non-empty `q`, or with `folder_id`: `422 validation_error`, one `errors` entry per offending parameter, `{field: "q" | "folder_id", code: "not_allowed_with_trashed"}`.
3. `cursor` that does not decode (see "The cursor"): `422 validation_error`, `errors: [{field: "cursor", code: "invalid"}]`.
4. `trashed` not `true`, and a non-empty `q` or a `folder_id`: `501 not_implemented` (return `ErrNotImplemented`).
5. Otherwise the page below.

### The two lists

Both return only the caller's bookmarks, and both return `BookmarkSummary` items (never page content: do not select or join `bookmark_content`).

- **Live list** (`trashed` false): rows where `deleted_at IS NULL`, ordered by `created_at DESC, id DESC`.
- **Trash** (`trashed=true`): rows where `deleted_at IS NOT NULL`, ordered by `deleted_at DESC, id DESC`. Each item carries its `deleted_at`.

A live bookmark never appears in the trash and a trashed one never appears in the live list (FR-21).

### Paging

Keyset paging, never `OFFSET`:

- Read `limit + 1` rows. If there are more than `limit`, return the first `limit` and a `next_cursor` that points just after the last returned row. Otherwise `next_cursor` is `null`. The extra row is never returned.
- A page that ends exactly at the last row has `next_cursor: null` (no empty trailing page).
- No bookmarks: `200` with `items: []` (an empty array, not `null`) and `next_cursor: null`.
- The next page starts strictly after the cursor's `(sort key, id)` pair in the list's own order, so rows with the same `created_at` (or `deleted_at`) are neither skipped nor repeated.
- The sort timestamps keep their full microsecond precision in the cursor. A cursor that rounds to milliseconds skips or repeats rows; the integration tests below must catch that.

### The cursor

Opaque to clients, defined once in `domain` as two pure functions with unit tests:

- Content: the mode (live or trash), the last row's sort timestamp (`created_at` for live, `deleted_at` for trash) and its `id`.
- Encoding: base64url without padding of a small JSON object. The timestamp is RFC 3339 with nanosecond precision, in UTC.
- Decoding fails (and the request answers `422`, check 3) when: the string is longer than 512 characters, is not valid base64url, does not hold JSON of that shape, has a missing or unparseable timestamp, has an `id` that is not a UUID, or was made for the other mode (a live cursor used with `trashed=true`, or the reverse).
- The decoded values are passed to the query as bound parameters, never concatenated into SQL.

## Structure

Follow `ARCHITECTURE.md` and the file-placement and test-file rules in `TESTING.md`.

- `domain/`: the cursor encode and decode (`cursor.go`), the page value type if you need one, and the list query value type.
- `usecase/`: `usecase/bookmark_list.go`, a `List` method on `BookmarkService`. It applies the default limit, asks the store for `limit + 1`, trims, and builds `next_cursor`. Add the narrow list method to the store interface in `usecase/bookmark_store.go` and to the fake in `usecase/fakes_test.go`.
- `repository/`: `repository/bookmark_list.go`, a method on `BookmarkRepository`. Every query filters by `user_id`. Select only the summary columns.
- `handler/`: the operation in `handler/bookmarks_list.go`; add `List` to the `BookmarkService` interface in `handler/bookmarks.go` and update every handler test double that implements it. Reuse `summaryOf`. Map `domain.ValidationError` through the existing path.

## Dependencies

None. Use only what is in `go.mod`.

## Acceptance criteria

All of these must have a test. Unit tests need no database. Integration tests carry the `integration` build tag, are written but not run by you, and the report must say "integration tests written, not run".

**Cursor (domain, unit, table-driven)**
- A cursor round-trips: encode then decode gives the same mode, timestamp (to the nanosecond) and id.
- Each decoding failure in the list above is rejected: over 512 characters, not base64url, base64url of non-JSON, JSON of the wrong shape, missing timestamp, unparseable timestamp, id not a UUID, and the wrong mode.

**List (usecase, unit, with the fake store)**
- A default `limit` of 50 is asked of the store as 51.
- More rows than `limit` returns `limit` items and a `next_cursor` built from the last returned row; exactly `limit` rows returns `next_cursor` nil; no rows returns an empty, non-nil slice and no cursor.
- A live cursor sent for the trash (and the reverse) is rejected with a `domain.ValidationError` on `cursor`.
- The store receives the decoded cursor values and the caller's id.

**Handler (unit, with a usecase double)**
- `200` with the `BookmarkPage` shape: `items` is `[]` and not `null` when empty, `next_cursor` is `null` on the last page, and each item has the `BookmarkSummary` fields, `deleted_at` included.
- What the handler passes down: `trashed`, `cursor` and `limit` as sent, and no limit (zero) when `limit` is absent.
- `limit=0` and `limit=101` answer `422 validation_error` with `{field: "limit", code: "out_of_range"}`; `limit=1` and `limit=100` pass.
- `trashed=true` with `q`, with `folder_id`, and with both: `422`, one `errors` entry per offending parameter. `trashed=true&q=` (empty) is allowed.
- An invalid cursor answers `422` on `cursor`.
- `q=go` or a `folder_id` without `trashed=true` answers `501 not_implemented`. `include_notes=true` alone is ignored.
- Each failure asserts the `application/problem+json` shape, not only the status.

**Repository (integration)**
- The live list returns newest first by `created_at`, and trashed bookmarks are absent.
- Rows with the same `created_at` come back ordered by `id` descending, and two pages split inside such a tie give every row exactly once.
- Paging through 120 bookmarks at `limit=50` returns 50, 50 and 20 rows, each row once, in order, and `next_cursor` is nil on the last page. A page boundary exactly at the end (100 rows, `limit=50`) has no empty third page.
- Timestamps that differ only in microseconds are ordered and paged correctly.
- The trash lists only trashed bookmarks, most recently trashed first, paged the same way with ties on `deleted_at` split by `id`.
- User isolation (NFR-7): with two users who each have live and trashed bookmarks, each user's list and trash show only their own, including across a page boundary.
- A returned bookmark carries no page content (the summary has no content field, and the query does not touch `bookmark_content`).

**Repo-wide**
- `make check` passes. `make test-integration` is for the user to run.
- Nothing outside the allowed paths changed.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt:

- Every repository query filters by `user_id`; there is no `OFFSET`; the cursor values are bound parameters.
- The cursor keeps nanosecond precision end to end (encode, decode, the comparison in SQL). Look for a `time.Truncate`, a `UnixMilli` or a format string without fractional seconds.
- The row-value comparison matches the ordering: `(created_at, id) < (?, ?)` for the live list, `(deleted_at, id) < (?, ?)` for the trash. A comparison on the timestamp alone is a bug.
- The `limit + 1` row never reaches the client, and `items` is never `null`.
- Check order: `limit`, then the `trashed` combinations, then the cursor, then the 501.
- No file other than the ones named under "Structure" (and the test doubles that must implement the new interface method) changed. `problem.go`, `server.go`, `main.go` and `domain/errors.go` are untouched.
- Try to break it with: `limit` of 0, 1, 100, 101, `-1`, `abc`; a cursor of exactly 512 and 513 characters; a cursor made from a live list used for the trash; a cursor whose `id` is a valid UUID that does not exist (it must still page from that position, not fail); `trashed=true&q=` (empty q); `trashed=false&folder_id=<uuid>`; a user with no bookmarks; two bookmarks created in the same microsecond.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement or this file conflict with each other.
- You think you need a migration, a dependency, a change to `problem.go`, `server.go`, `main.go` or `domain/errors.go`, a change to the contract, or a new `pkg/` package.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), integration tests written but not run, what the generated wrapper answers for a non-integer `limit`, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
