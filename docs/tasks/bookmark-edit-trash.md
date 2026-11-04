# Task: edit, delete and restore bookmarks, and empty the trash (back end)

> Trial slice, back end, run in parallel with the front-end slice `docs/tasks/bookmark-actions.md`. One backend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

A signed-in user can change a bookmark's title, note and folder, move a bookmark to the trash, restore it from the trash, and empty the trash for good. This is the server half of the row actions, the bookmark page's editing and the trash actions.

Requirements covered: FR-8 (edit title and note, and clear a note), FR-14 and FR-15 (a bookmark's folder can be set or cleared; the UI for moving comes later), FR-17 (delete moves to the trash), FR-19 (restore goes to the top level), FR-20 (empty the trash), FR-21a (a trashed bookmark cannot be edited or deleted), NFR-2 (every write increments `users.version`), NFR-7 (another user's bookmark is "not found"), NFR-14 (title 300 and note 500 characters), NFR-17 (restoring does not change the count; emptying the trash frees room).

Out of scope, and why:

- Folders: `listFolders`, `createFolder`, `updateFolder`, `deleteFolder` stay stubs. `updateBookmark` accepts `folder_id` and checks the folder belongs to the caller, but no API creates folders yet, so tests create them directly in the database.
- Search (`q`, `include_notes`, `folder_id` on `listBookmarks`), `getSyncVersion`, `getFavicon`, the auth operations and `deleteAccount` stay as they are.
- Changing a bookmark's URL (never allowed), and rate limiting (a later task).

## Role and ownership

Role: Backend (see `AGENTS.md`).

You may change `backend/**` except `backend/migration/`. You may not change `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/bookmark-edit-trash.plan.md`, see `AGENTS.md`), the frontend, migrations or the Makefile. You need no migration: the tables, `deleted_at`, `updated_at` and the foreign keys exist. If you think you need one, stop and ask.

**Shared files.** The front-end task for this slice changes only `frontend/**`, so nothing overlaps. This task does need three shared back-end files, which no other task is changing now: the sentinel errors in `domain/errors.go`, the mapping table `domainProblems` in `handler/problem.go`, and the router or a middleware in `handler/` for the request-body check below.

## Operations used

Implement these four by defining methods on `*handler.Server`, replacing their 501 stubs. Take the types from `internal/api` (generated); only `handler/` imports it.

- `updateBookmark` (`PATCH /api/v1/bookmarks/{id}`), body `UpdateBookmarkRequest`, response `BookmarkSummary`.
- `deleteBookmark` (`DELETE /api/v1/bookmarks/{id}`), response `204`.
- `restoreBookmark` (`POST /api/v1/bookmarks/{id}/restore`), response `BookmarkSummary`.
- `emptyTrash` (`DELETE /api/v1/trash`), response `{ deleted: integer }`.

Authentication, CSRF, the 64 KB body cap and (later) rate limiting are applied by the router; do not repeat them in handlers.

## Behavior

### updateBookmark

The body can hold `title`, `note` and `folder_id`, and each of them is **absent, `null`, or a value**. Those are three different requests for `note` and `folder_id`:

| Field | Absent | `null` | A value |
|---|---|---|---|
| `title` | unchanged | `422 validation_error`, `{field: "title", code: "invalid"}` | the new title, stored exactly as given (an empty string is allowed) |
| `note` | unchanged | the note is cleared (stored as null) | the new note; an empty string is stored as null |
| `folder_id` | unchanged | the bookmark moves to the top level | the bookmark moves to that folder |

The generated `UpdateBookmarkRequest` has plain pointers and cannot tell absent from `null`. Solve it without a new dependency and without changing `openapi.yaml`, `oapi-codegen.yaml` or `api.gen.go`: a small piece of code in `handler/` (for example an operation middleware, which the generated router supports) reads the raw JSON object before it is decoded, records which keys were present and which were `null`, and puts that in the request context. If this cannot be done within those limits, stop and ask.

Checks run in this order, and the first failure answers:

1. **Unknown keys.** Any key other than `title`, `note` and `folder_id` (including the read-only ones: `url`, `content`, `fetch_status`, `deleted_at`, `id`, `favicon_url`) is `422 validation_error`, with one `errors` entry per key, `{field: <the key>, code: "unknown_field"}`. A body that is not a JSON object is whatever the generated code already answers; keep it.
2. **Values.** A title over 300 characters: `{field: "title", code: "too_long"}`. A note over 500: `{field: "note", code: "too_long"}`. Count characters as `create` does (runes, `utf8.RuneCountInString`), and report every failing field in one `422`. `title: null` as in the table.
3. **The bookmark.** Looked up by id for the caller. Not found or another user's: `404 not_found`.
4. **Trash.** A trashed bookmark: `409 bookmark_in_trash` (FR-21a).
5. **The folder.** A non-null `folder_id` must be one of the caller's folders (`FolderLookup`), else `404 not_found`. If the folder is deleted between the check and the write and the foreign key rejects it, that is also `404 not_found`, not a `500`.
6. **A body with no recognised keys** (`{}`): `200` with the bookmark as it is. Nothing is written and `users.version` is not incremented. It still goes through checks 3 and 4.
7. **The write**, in one transaction, only for the fields that were present:
   - `UPDATE bookmarks SET ... WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, with `updated_at = now()`. If zero rows change (it was trashed or deleted since the lookup), re-read to answer `404` or `409`; never write to a trashed bookmark.
   - If the title was present, rebuild `search_vector` in the same transaction (`refreshSearchVector`). The note and folder are not part of the vector.
   - Increment `users.version` in the same transaction (convention 4).
8. Respond `200` with the updated `BookmarkSummary` (`note` null when cleared, `folder_id` as stored).

### deleteBookmark

1. Not found or another user's: `404 not_found`. Already trashed: `409 bookmark_in_trash`.
2. In one transaction: `UPDATE bookmarks SET deleted_at = now() WHERE id = ? AND user_id = ? AND deleted_at IS NULL`; zero rows changed means re-read and answer `404` or `409`; then increment `users.version`. Nothing else changes (title, note, `folder_id` stay). Two simultaneous deletes of the same bookmark end with one `204` and one `409`.
3. Respond `204` with no body.

### restoreBookmark

1. Not found or another user's: `404 not_found`. Not trashed: `409 bookmark_not_in_trash`.
2. In one transaction: `UPDATE bookmarks SET deleted_at = NULL, folder_id = NULL WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL` (zero rows changed: re-read, `404` or `409`), then increment `users.version`. No cap check: restoring never changes the user's bookmark count (NFR-17).
3. Respond `200` with the restored `BookmarkSummary`.

### emptyTrash

1. In one transaction: delete every row with `user_id = ?` and `deleted_at IS NOT NULL` in a single statement (`bookmark_content` goes with it through its foreign key; favicons are shared per host and stay). Count the deleted rows.
2. Increment `users.version` in the same transaction only when at least one row was deleted.
3. Respond `200` with `{ "deleted": <count> }`. An empty trash is `200` with `0`, not an error.

### Errors, in one place

New sentinel errors in `domain`: `ErrBookmarkInTrash` and `ErrBookmarkNotInTrash`, each mapped in `domainProblems` to `409` with the codes `bookmark_in_trash` and `bookmark_not_in_trash` (both exist in `openapi.yaml`). Validation failures reuse `domain.ValidationError`. `gorm.ErrRecordNotFound` is already `404 not_found`. A malformed `{id}` is whatever the generated wrapper already answers.

## Structure

Follow `ARCHITECTURE.md` and the file-placement and test-file rules in `TESTING.md`.

- `domain/`: the two sentinels, the field-code constants (`invalid`, `unknown_field`), and a value type for an update with three states per nullable field (absent, null, value).
- `usecase/`: `usecase/bookmark_update.go` (update) and `usecase/bookmark_trash.go` (delete, restore, empty), as methods on `BookmarkService`. Extend `BookmarkStore` in `usecase/bookmark_store.go` with narrow methods, and the fake in `usecase/fakes_test.go`.
- `repository/`: `repository/bookmark_update.go` and `repository/bookmark_trash.go`, methods on `BookmarkRepository`. Every query filters by `user_id`. Reuse `refreshSearchVector` and `bumpUserVersion`.
- `handler/`: `handler/bookmarks_update.go` and `handler/bookmarks_trash.go`, plus the request-body check. Add the four methods to the `BookmarkService` interface in `handler/bookmarks.go` and update every handler test double that implements it. Reuse `summaryOf`.

## Dependencies

None. Use only what is in `go.mod`.

## Acceptance criteria

All of these must have a test. Unit tests need no database. Integration tests carry the `integration` build tag; run them with `make test-integration-local` if the session can start a database (see `TESTING.md`), and say in the report which ran and which did not.

**Update (usecase, unit, with fakes)**
- Each of the three states for `note` and `folder_id`: absent leaves the stored value, `null` clears it, a value sets it. The store receives exactly the fields that were present.
- Check order: a too-long title and an unknown key together answer with the unknown key first; a too-long field on a trashed bookmark answers `422` (not `409`); a trashed bookmark with an unknown folder answers `409` (not `404`).
- Title 300 characters passes, 301 fails; note 500 passes, 501 fails; both too long report both fields. Multi-byte characters count once.
- A folder that is not the caller's: `ErrRecordNotFound`. A folder that disappears at write time (the foreign key error) is also not-found.
- `{}` writes nothing and returns the bookmark; on a trashed bookmark it is `409`.

**Delete, restore, empty (usecase, unit, with fakes)**
- Delete and restore each return not-found, the trash sentinel, or success as above. Empty returns the count from the store.

**Handler (unit, with usecase doubles)**
- Each operation's success: status, and for `200` the `BookmarkSummary` body shape; `204` has no body; `emptyTrash` returns `{"deleted": n}`, including `0`.
- `updateBookmark` passes the three states correctly to the usecase: a body with `"note": null`, one with `"note": "x"` and one without `note` give three different inputs; the same for `folder_id`. Unknown keys (`url`, `fetch_status`, `foo`) each answer `422` with `unknown_field`; `"title": null` answers `422` with `invalid`; a title of 301 answers `422` with `too_long`.
- Error mappings, each asserting the `application/problem+json` shape and `code`: `404 not_found`, `409 bookmark_in_trash`, `409 bookmark_not_in_trash`, `422 validation_error`.
- A request with a malformed id keeps the generated wrapper's answer.

**Repository (integration)**
- Update: title, note and folder are written; absent fields are not touched; `updated_at` changes; `users.version` increases by one; after a title change the bookmark is found by a `search_vector` query on the new title and no longer on the old one. A note-only change leaves the vector alone.
- Update never writes a trashed bookmark: with the row trashed, the update changes nothing and reports the trash state.
- Update with another user's folder id, and with a folder id that does not exist, report not-found.
- Delete: `deleted_at` is set, the bookmark leaves the live list and appears first in the trash list; `users.version` increases; a second delete reports the trash state. Two concurrent deletes: exactly one succeeds.
- Restore: `deleted_at` and `folder_id` are cleared (a trashed bookmark that had a folder comes back at the top level); `users.version` increases; the user's total count (`CountByUserID`) is the same before and after; restoring a live bookmark reports not-in-trash.
- Empty trash: only the caller's trashed bookmarks are deleted, live ones stay, another user's trashed ones stay, their `bookmark_content` rows are gone, the returned count is right, `users.version` increases by one, and with an empty trash it does not increase. After emptying, `CountByUserID` is lower by the number deleted.
- User isolation (NFR-7): for update, delete and restore, another user's bookmark id reports not-found and changes nothing.

**Repo-wide**
- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt:

- Every repository query filters by `user_id`, and every write statement for update, delete and restore also carries the `deleted_at` condition in the same statement (not only in an earlier read).
- `users.version` is incremented in the same transaction as every write, and not when nothing was written (`{}` update, empty trash with nothing to delete).
- The three-state input is real: read the middleware or helper and the tests, and confirm that `"note": null` and a missing `note` cannot end up as the same value anywhere between the raw body and the SQL.
- No new dependency; `openapi.yaml`, `oapi-codegen.yaml`, `api.gen.go`, migrations untouched. The shared files changed are limited to `domain/errors.go`, `handler/problem.go` and the request-body check.
- Update, delete and restore answer `404` for another user's id with the same body as for an unknown id.
- `restoreBookmark` and `deleteBookmark` do not run a cap check.
- Try to break it with: `{}`; `{"note": null}`; `{"note": ""}`; `{"note": "   "}` (stored as given, not null); `{"title": ""}`; `{"title": null}`; `{"folder_id": null}` on a bookmark with a folder; a body that is a JSON array, `null` or a string; duplicate keys in the body; a 300-character title of multi-byte characters; unknown key together with a too-long title; PATCH of a trashed bookmark with an empty body; DELETE twice; restore of a live bookmark; empty trash with 0 and with several; two concurrent deletes; update racing with delete.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement or this file conflict with each other.
- You think you need a migration, a dependency, a change to the contract, to the generated code or its config, or a new `pkg/` package.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), which integration tests ran and which did not (and the Postgres version if they ran), how the request-body check works, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
