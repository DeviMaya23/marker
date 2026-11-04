# Task: folders, and listing a folder's bookmarks (back end)

> Trial slice, back end, run in parallel with the front-end slice `docs/tasks/folder-sidebar.md`. One backend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> **Prerequisite:** the task `bookmark-edit-trash` is merged. This task reuses what it added: the sentinel-error pattern in `domain/errors.go` and `domainProblems`, and the request-body check in `handler/` that tells an absent key from a `null` one and rejects unknown keys. If `main` does not have that check, stop and ask; do not write a second one.

## Goal

A signed-in user can create, list, rename, move and delete folders (up to 3 levels deep), and can list the bookmarks in one folder and all of its subfolders. This is the server half of the folder sidebar.

Requirements covered: FR-12 (create, view, rename), FR-13 (depth 3), FR-14 (a bookmark is in one folder or at the top), FR-15 (move a folder with its contents), FR-16 (delete a folder and its subtree; its live bookmarks go to the trash), FR-26 (sibling names are unique, ignoring case), FR-7 (the folder's list is the same list, filtered), NFR-2 (every write increments `users.version`), NFR-7 (another user's folder is "not found"), NFR-14 (folder name 100 characters).

Out of scope, and why:

- Search: `q` and `include_notes` on `listBookmarks` stay as they are (`q` answers 501). A folder-scoped search comes with search.
- Moving a bookmark into a folder works already (`updateBookmark` takes `folder_id`); nothing changes there.
- Rate limiting, `getSyncVersion`, `getFavicon`, auth and `deleteAccount`.
- A cap on the number of folders: the requirements have none.

## Role and ownership

Role: Backend (see `AGENTS.md`).

You may change `backend/**` except `backend/migration/`. You may not change `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/folders-api.plan.md`, see `AGENTS.md`), the frontend, migrations or the Makefile. You need no migration: the `folders` table, its unique index on sibling names (`folders_sibling_name_key`, on the lower-cased name, root included), the depth check and the foreign keys exist. If you think you need one, stop and ask.

**Shared files.** The front-end task for this slice changes only `frontend/**`. This task changes these shared back-end files, which no other task is changing now: `domain/errors.go` and `handler/problem.go` (new sentinels), `handler/server.go` and `cmd/server/main.go` (a folder service is added to `NewServer`), the `BookmarkService` interface and `usecase/bookmark_list.go` (the folder filter).

## Operations used

Implement these by defining methods on `*handler.Server`, replacing their 501 stubs, and extend `listBookmarks`. Take the types from `internal/api` (generated); only `handler/` imports it.

- `listFolders` (`GET /api/v1/folders`), response `{ items: Folder[] }`.
- `createFolder` (`POST /api/v1/folders`), body `CreateFolderRequest`, response `201 Folder`.
- `updateFolder` (`PATCH /api/v1/folders/{id}`), body `UpdateFolderRequest`, response `200 Folder`.
- `deleteFolder` (`DELETE /api/v1/folders/{id}`), response `200 { deleted_folders, trashed_bookmarks }`.
- `listBookmarks` (`GET /api/v1/bookmarks`): the `folder_id` parameter.

Authentication, CSRF, the body cap and (later) rate limiting are applied by the router.

## Behavior

### A folder as the API shows it

`Folder`: `id`, `name`, `parent_id` (null at the top), `depth` (1 to 3), `bookmark_count`, `created_at`, `updated_at`. `bookmark_count` is the number of **live** bookmarks directly in that folder: not its subfolders, not trashed ones. Every response that returns a `Folder` includes it (a new folder has `0`).

### Names

A name is trimmed of surrounding whitespace before anything else. After trimming, an empty name is `422 validation_error` with `{field: "name", code: "required"}`, and a name over 100 characters (count runes, as the bookmark title does) is `{field: "name", code: "too_long"}`. The trimmed name is what is stored. Names are compared for uniqueness among siblings ignoring case (the unique index does this; map its violation, do not rely on a check alone).

### listFolders

All of the caller's folders as a flat list in `items`, ordered by lower-cased name then id. No folders: `200` with `items: []` (an empty array, not `null`).

### createFolder

Checks run in this order, and the first failure answers:

1. Unknown keys (anything but `name` and `parent_id`): `422 validation_error`, `{field: <key>, code: "unknown_field"}` each. Reuse the request-body check from `bookmark-edit-trash`.
2. Name: required and too long, as above. A missing `name` key is `required`.
3. `parent_id`: absent or `null` means the top level. A value must be one of the caller's folders, else `404 not_found`. If the parent already has depth 3, `422 folder_depth_exceeded`.
4. The write, in one transaction that first takes the per-user folder lock (see "Concurrency"): insert with `depth = parent depth + 1` (1 at the top), then increment `users.version`. A violation of the sibling-name index is `409 folder_name_conflict`. A foreign-key violation on the parent (it was deleted meanwhile) is `404 not_found`.
5. Respond `201` with the `Folder`.

### updateFolder

`name` and `parent_id` can each be absent, `null` or a value. `name: null` is `422 validation_error`, `{field: "name", code: "invalid"}`. `parent_id: null` moves the folder to the top level; a value moves it under that folder; absent leaves it.

Checks run in this order:

1. Unknown keys, as for create.
2. Name, if present: required, too long.
3. The folder: not found or another user's is `404 not_found`.
4. `parent_id`, if present and not `null`: must be one of the caller's folders, else `404 not_found`.
5. **Cycle:** the new parent is the folder itself or any of its descendants: `422 folder_cycle`.
6. **Depth:** let `h` be the number of levels in the moved folder's subtree (the folder alone is 1). With the new depth `d` of the folder (1 at the top, else the parent's depth plus 1), the deepest descendant would sit at `d + h - 1`. If that is more than 3: `422 folder_depth_exceeded`.
7. `{}` (no recognised key) answers `200` with the folder as it is and writes nothing, without incrementing `users.version`. Moving a folder to the parent it already has, and renaming it to the name it already has (even changing only the case), are valid.
8. **The write**, in one transaction that first takes the per-user folder lock: update `name` and `parent_id` as given, set `depth` on the folder and on every descendant, set `updated_at`, then increment `users.version`. A sibling-name collision in the resulting location (the new parent, with the resulting name) is `409 folder_name_conflict`; a folder cannot collide with itself.
9. Respond `200` with the `Folder`, `bookmark_count` included.

### deleteFolder

1. Not found or another user's: `404 not_found`.
2. In one transaction that first takes the per-user folder lock:
   - find the folder's subtree (the folder and every descendant);
   - set `deleted_at` to the current time, the same value for all of them, on every **live** bookmark whose `folder_id` is in the subtree; count them; bookmarks already in the trash stay as they are and are not counted;
   - delete the folder row; its subfolders go with it through the foreign key, and every bookmark that pointed into the subtree ends with `folder_id` null (the foreign key does this);
   - increment `users.version`.
3. Respond `200` with `{ "deleted_folders": <folders in the subtree, the folder included, so at least 1>, "trashed_bookmarks": <count above> }`.

### listBookmarks with `folder_id`

`folder_id` without `trashed=true` now lists the **live** bookmarks whose `folder_id` is that folder or any of its descendants, newest first, paged exactly as the plain live list (same cursor, same limit rules, same `BookmarkPage`). The folder must be the caller's: otherwise `404 not_found`. The check order from `list-bookmarks` stays, with this change at the end:

1. `limit`, 2. the `trashed` combinations (`trashed=true` with `folder_id` is still `422`), 3. the cursor, 4. a non-empty `q` is still `501 not_implemented` (also with a `folder_id`), 5. the folder (`404`), 6. the page.

### Concurrency

Folder writes (create, update, delete) take a per-user lock at the start of their transaction, for example `SELECT id FROM users WHERE id = ? FOR UPDATE`, so the cycle, depth and name checks see a consistent tree. Two moves that would together form a cycle must end with exactly one success and one `folder_cycle`. Two creates of the same name under the same parent end with one `201` and one `409`.

### Errors, in one place

New sentinel errors in `domain`: `ErrFolderNameConflict` (`409 folder_name_conflict`), `ErrFolderDepthExceeded` (`422 folder_depth_exceeded`), `ErrFolderCycle` (`422 folder_cycle`), each mapped in `domainProblems` (all three codes exist in `openapi.yaml`). Field validation reuses `domain.ValidationError`, with the new field codes `required` and `unknown_field`. `gorm.ErrRecordNotFound` is already `404 not_found`.

## Structure

Follow `ARCHITECTURE.md` and the file-placement and test-file rules in `TESTING.md`.

- `domain/`: extend `folder.go` with the sentinels' companions: a folder-with-count value type and an update input with three states per nullable field.
- `usecase/`: `usecase/folder.go` with a `FolderService` (list, create, update, delete) and `usecase/folder_store.go` for its store interface; `FolderService` defines the interfaces it needs. The depth, cycle and name rules live here. Add the folder filter to `BookmarkService.List` (it already holds a `FolderLookup`) and to the list input and the store query.
- `repository/`: extend `repository/folder.go` (which has `GetFolder`) with the folder queries, and `repository/bookmark_list.go` with the subtree filter (a recursive query over `folders.parent_id`, always with `user_id`). Reuse `bumpUserVersion`.
- `handler/`: `handler/folders.go` with a `FolderService` interface and the four operations; update `handler/bookmarks_list.go` for `folder_id`. `NewServer` gets the folder service; wire it in `cmd/server/main.go`. Update every handler test double that needs it.

## Dependencies

None. Use only what is in `go.mod`.

## Acceptance criteria

All of these must have a test. Unit tests need no database. Integration tests carry the `integration` build tag; run them with `make test-integration-local` if the session can start a database (see `TESTING.md`), and say in the report which ran and which did not.

**Rules (usecase, unit, with fakes; table-driven where the setup is the same)**
- Names: trimmed, empty after trim is `required`, 100 characters pass, 101 fail, multi-byte characters count once; the stored name is the trimmed one.
- Create: parent depth 1 and 2 give depth 2 and 3; parent depth 3 is `folder_depth_exceeded`; another user's parent is not-found.
- Update, depth and cycle: moving a folder into itself, its child and its grandchild is `folder_cycle`; moving a folder with a subtree of height 2 under a depth-2 parent is `folder_depth_exceeded`, under a depth-1 parent it passes; moving a single folder under a depth-2 parent passes; moving to the top level passes. Cycle is checked before depth.
- Update, absent versus `null`: absent `parent_id` leaves the parent, `null` moves to the top, a value moves under it; `name: null` is `invalid`.
- `{}` writes nothing and returns the folder; renaming to the same name or the same name in another case, and moving to the current parent, are not conflicts.
- Delete returns the counts the store reports.
- Folder filter on the list: another user's or unknown folder is not-found; the store receives the folder id.

**Handler (unit, with usecase doubles)**
- Success of each operation: status and the `Folder` body (including `bookmark_count` and `parent_id: null` at the top), `201` for create, `200` with both counts for delete, `items: []` and not `null` for an empty list.
- Request handling: unknown keys (`depth`, `id`, `foo`) each answer `422` with `unknown_field`; a missing `name` answers `422` `required`; `name: null` on update answers `422` `invalid`; the three states of `parent_id` reach the usecase as three different inputs.
- Error mappings, each asserting the `application/problem+json` shape and `code`: `404 not_found`, `409 folder_name_conflict`, `422 folder_cycle`, `422 folder_depth_exceeded`, `422 validation_error`.
- `listBookmarks`: `folder_id` alone reaches the usecase (no longer `501`); `folder_id` with a non-empty `q` is still `501`; `folder_id` with `trashed=true` is `422`; an unknown folder is `404`; a bad cursor with a `folder_id` is `422` before the folder check.

**Repository (integration)**
- List: only the caller's folders, ordered by lower-cased name; `bookmark_count` counts live bookmarks directly in the folder and excludes trashed ones and subfolders' bookmarks.
- Create: the row has the right depth; two creates of the same name under the same parent, with a different case, and at the top level (no parent), conflict; the same name under different parents does not; a parent deleted at the same moment gives not-found, not a server error. `users.version` increases.
- Update: rename; move to the top; move under another folder updates the depth of the folder and of every descendant; a collision in the new location conflicts; renaming to a different case of its own name works; cycle and depth are rejected in the database path too (with the real tree). `users.version` increases, and does not for `{}`.
- Concurrency: two moves that would form a cycle end with exactly one success; two creates of the same name end with exactly one success.
- Delete: the folder and all subfolders are gone; every live bookmark in the subtree is trashed with one shared `deleted_at`; bookmarks already trashed stay trashed and uncounted; bookmarks outside the subtree and another user's are untouched; the returned counts are right; `users.version` increases once; the trashed bookmarks appear in the trash list and not in the live list; their `folder_id` is null afterwards.
- Folder filter on the list: a folder's list includes its own bookmarks and those of subfolders at depth 2 and 3, excludes sibling folders and the top level, excludes trashed bookmarks, is newest first and pages across a boundary without gaps or repeats; another user's folder is not-found.
- User isolation (NFR-7): for update, delete and the filter, another user's folder reports not-found and changes nothing.

**Repo-wide**
- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt:

- Every repository query filters by `user_id`, including the recursive subtree query and the descendant-depth update. The subtree walk cannot leave the caller's folders.
- Every folder write transaction takes the per-user lock before it reads the tree, and `users.version` is incremented in the same transaction (and not when nothing was written).
- The depth arithmetic is right at the boundaries: a folder with a depth-3 descendant cannot be moved under any folder that is not at the top; a single folder moves under a depth-2 folder but not a depth-3 one. Check it against the code, not only the tests.
- Cycle detection covers the folder itself, a child and a grandchild.
- The sibling-name rule is enforced by the index and mapped from its violation, at the top level (no parent) as well, and ignoring case; renaming a folder to a different case of its own name is not a conflict.
- Delete uses one timestamp, counts only live bookmarks, and does not touch bookmarks that were already trashed. A bookmark in the subtree that was trashed before the delete ends with a null `folder_id` and is not counted.
- The folder filter is applied only to the live list, the 501 for `q` and the 422 for `trashed=true` with `folder_id` still hold, and the check order is as written.
- The request-body check from `bookmark-edit-trash` is reused, not copied. No new dependency; `openapi.yaml`, `oapi-codegen.yaml`, `api.gen.go` and migrations are untouched.
- Try to break it with: a name of spaces; a name of 100 and 101 multi-byte characters; `{"parent_id": null}` on a root folder; `{"name": "A"}` on a folder named `a`; moving a folder into its own grandchild; moving a depth-3 chain under a root folder; a 3-deep tree and a create under its depth-3 folder; deleting a folder whose subtree holds both live and trashed bookmarks; deleting a folder with no bookmarks; listing a folder with 120 bookmarks across subfolders at limit 50; `folder_id` of a folder of another user, and of a random UUID; two concurrent moves, two concurrent creates, a create racing with a delete of the parent.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement or this file conflict with each other.
- You think you need a migration, a dependency, a change to the contract, to the generated code or its config, or a new `pkg/` package.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), which integration tests ran and which did not (and the Postgres version if they ran), and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
