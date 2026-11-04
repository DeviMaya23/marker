# Verification report: bookmark edit, delete, restore, empty trash (back end)

Verifier branch: `claude/bookmark-edit-trash-verify-nm1yz1` (started from the builder's `claude/bookmark-edit-trash-6zkvqq` at `09ed38d`).
Plan: [bookmark-edit-trash.plan.md](bookmark-edit-trash.plan.md)

**Result: no Blocking findings.** 3 Non-blocking.

## Commands run

- `make check`: passes. A fresh checkout needs `npm ci` in `frontend/` first (lint failed on a missing `@eslint/js` until then); after it, exit 0.
- `make test-integration-local`: **run, passed** (PostgreSQL 16, all packages `ok`, including `repository` and `worker`). The session could start a database, so the integration tests were run, not only compiled.
- Mutation checks (reverted afterwards): treating `null` as absent in `fieldOf` makes the handler tests fail; dropping `AND deleted_at IS NULL` from the update statement fails `TestBookmarkRepository_Update_Trashed`. The tests do exercise those behaviours.

## Acceptance criteria

"Real?" = would the test fail if the behaviour were removed.

| # | Criterion | Test(s) | Real? | Status |
|---|---|---|---|---|
| U1 | Three states for `note` and `folder_id`; store receives only present fields (FR-8, FR-14, FR-15) | `usecase` `TestBookmarkService_Update_ThreeStates`; handler `TestUpdateBookmark_PassesThreeStates`, `TestRecordBodyKeys` | Yes (mutation run) | Met |
| U2 | Check order: unknown key before long title; long field on trashed is 422; trashed + unknown folder is 409 | `TestBookmarkService_Update_CheckOrder` | Yes | Met |
| U3 | 300/301 title, 500/501 note, both reported, multi-byte counts once (NFR-14) | `TestBookmarkService_Update_Lengths` | Yes, exact boundaries | Met |
| U4 | Foreign folder is not found; folder vanishing at write time is not found | `TestBookmarkService_Update_Folder` (usecase, fake); repo `TestBookmarkRepository_Update_FolderNotFound` | Usecase half uses the fake returning not-found; the real FK-violation branch in `repository.Update` has no test of its own (see N3) | Met |
| U5 | `{}` writes nothing; trashed is 409 | `TestBookmarkService_Update_Empty` | Yes | Met |
| D1 | Delete / restore: not found, trash sentinel, success; empty returns store count (FR-17, FR-19, FR-20, FR-21a) | `TestBookmarkService_Delete`, `_Restore`, `_EmptyTrash` | Yes | Met |
| H1 | Success of each operation: status, body shape, 204 empty, `{"deleted": n}` incl. 0 | `TestUpdateBookmark_Success`, `TestDeleteBookmark_NoContent`, `TestRestoreBookmark_Success`, `TestEmptyTrash_Counts` | Yes | Met |
| H2 | Three states reach the usecase | `TestUpdateBookmark_PassesThreeStates` (15 rows, through the real router and middleware) | Yes | Met |
| H3 | `url`, `fetch_status`, `foo` answer 422 `unknown_field`; `title: null` 422 `invalid`; 301 title 422 `too_long` | `TestUpdateBookmark_ValidationFromTheUsecase` | The handler only renders a `ValidationError` the double returns; the rule itself is judged in the usecase tests (U2, U3). No test drives body to 422 across both layers, which TESTING.md forbids | Partly met (by design, plan judgment call 2) |
| H4 | Error mappings with problem+json shape and `code` | `TestUpdateBookmark_Problems`, `TestTrashOperations_Problems` | Yes | Met |
| H5 | Malformed id keeps the generated answer | `TestUpdateBookmark_BindingFailures`, `TestTrashOperations_MalformedID` | Yes | Met |
| R1 | Update writes fields, absent untouched, `updated_at` moves, version +1, vector follows title, note-only leaves vector | `TestBookmarkRepository_Update_Fields`, `_SearchVector` | Yes | Met (integration only) |
| R2 | Update never writes a trashed bookmark | `TestBookmarkRepository_Update_Trashed` | Yes (mutation run) | Met (integration only) |
| R3 | Another user's / nonexistent folder: not found | `TestBookmarkRepository_Update_FolderNotFound` | Yes | Met (integration only) |
| R4 | Delete: `deleted_at`, list/trash order, version, second delete reports trash, 8 concurrent deletes one wins | `TestBookmarkRepository_Trash`, `_Trash_ConcurrentDeletes` | Yes | Met (integration only) |
| R5 | Restore: clears `deleted_at` and `folder_id`, version, `CountByUserID` unchanged, live is not-in-trash (NFR-17) | `TestBookmarkRepository_Restore` | Yes | Met (integration only) |
| R6 | Empty trash: scope, content rows gone, count, version once, no bump when empty, count drops (FR-20, NFR-17) | `TestBookmarkRepository_EmptyTrash` | Yes | Met (integration only) |
| R7 | User isolation for update, delete, restore (NFR-7) | `TestBookmarkRepository_Mutations_OtherUser` | Yes | Met (integration only) |
| W1 | `make check` passes | run | n/a | Met |
| W2 | Nothing outside allowed paths changed | `git diff --name-only origin/main..HEAD`: only `backend/internal/**` and the plan | n/a | Met |

Criteria that rest on integration tests alone: R1 to R7 (every repository criterion). They were run here and passed on PostgreSQL 16; they were not run on 17 (CI).

## Plan check

- Every acceptance criterion appears in the plan; none missing.
- Every ticked item has a test that exists and checks the behavior (verified by reading, plus the two mutation runs above).
- Plan vs diff differences, all recorded by the builder as judgment calls: `router_test.go` changed one row (`DELETE /trash` to `DELETE /folders/{id}`), because the old row's operation is no longer a stub (call 9); `NewRouter` switched to `RegisterHandlersWithOptions` (call 10); `domain.BookmarkUpdate` carries `UnknownKeys` (call 5). Nothing in the diff is unmentioned.
- Plan "make test-integration-local run and result reported": the plan holds no result text; this report supplies it (passed, PG 16).
- Task says a cleared note is "stored as null"; the schema is `note text NOT NULL DEFAULT ''` and no migration is allowed, so it is stored as `''` and rendered as `null` by `noteOf` (call 1). Reasonable and consistent with the response contract.

## Rule checks

- **Only `handler/` imports `internal/api`:** yes (grep over `backend`).
- **`user_id` on every repository query:** yes. `getBookmark`, the update, trash, restore and empty statements, the folder `EXISTS` subquery and `refreshSearchVector` all filter by `user_id`. No exception is used.
- **`deleted_at` condition in the write statement:** update and delete carry `IS NULL`, restore carries `IS NOT NULL`, in the same statement; zero rows triggers a re-read.
- **`users.version`:** bumped in the same transaction as update (not for `{}`, which writes nothing), trash, restore, and empty trash only when `n > 0`.
- **Three-state input:** `recordBodyKeys` records presence and null-ness from the raw body, `fieldOf` maps to `domain.Field`; `null`, absent and `""` give three distinct values at the handler, usecase (store receives `Set`/`Null`) and SQL (`folder_id = NULL`, note `''`). Duplicate keys keep the last, matching the decoder. Keys are case-sensitive, so `{"Title":"x"}` is `unknown_field` rather than silently a title.
- **`go.mod`/`go.sum`:** unchanged. `openapi.yaml`, `oapi-codegen.yaml`, `api.gen.go`, migrations: untouched. Shared files changed: `domain/errors.go`, `handler/problem.go`, `handler/router.go` plus the new `handler/body_keys.go`, as allowed (and `domain/bookmark_detail.go`, one constant).
- **404 body identical for another user's id and an unknown id:** yes, both are `gorm.ErrRecordNotFound` from a `user_id`-scoped read.
- **No cap check in delete or restore:** correct; neither calls the count.
- **Probes tried through the real router** (spy usecase): `{}`, `null` body and empty body give an empty update; `{"note":null}`, `{"note":""}`, `{"note":"   "}`, `{"note":" null "}` (a value, not null); `{"title":null}`; `{"folder_id":null}`; array, string and broken JSON give 400; duplicate keys; unauthenticated gives 401; wrong-typed `title` gives 400. 300 multi-byte characters pass, 301 fail (usecase). PATCH of a trashed bookmark with `{}`: 409 (usecase test). DELETE twice and restore of a live bookmark: tests R4, R5. Concurrent deletes: R4. Update racing with delete: I added `TestBookmarkRepository_Update_RacesWithDelete` (20 rounds, passes with `-count=3`): a trashed row is never written and the version moves once per real write.

## Findings

### Blocking

None.

### Non-blocking

- **N1. PATCH with a missing or non-JSON `Content-Type` answers `500 internal_error`.** Reproduce: `PATCH /api/v1/bookmarks/{id}` with a session and CSRF header but no `Content-Type`, body `{"note":"x"}`. Echo's binder returns 415 and `problem.go` has no mapping for it. `POST /api/v1/bookmarks` behaves the same, so this comes from the generated code and the existing error handler, which the task says to keep; it is not new. Worth a later task.
- **N2. H3 is judged in two halves, not end to end.** See the criteria table. Acceptable under TESTING.md, but a regression where the handler stopped forwarding unknown keys would be caught only by `TestUpdateBookmark_PassesThreeStates`.
- **N3. The foreign-key-violation branch of `repository.Update` (folder deleted between the `EXISTS` check and the write) has no test.** It needs a deliberate interleaving. In practice the `EXISTS` guard in the same statement makes it close to unreachable.

## Tests I added

- `repository/bookmark_update_integration_test.go`: `TestBookmarkRepository_Update_RacesWithDelete` (the "update racing with delete" probe from the task file). No source changed.
