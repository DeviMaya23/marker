# Verification report: delete account (back end)

**Branch:** `claude/delete-account-task-339f33-bslryx` (the builder's commits `7ec207f`..`fca080c` plus this report and one added test)
**Result:** no Blocking findings.

## What was run

- `make check`: passed (after `npm ci` in `frontend/`). `openapi-lint` prints 7 existing "tag description" warnings; none concern this task.
- Integration tests: **not run by me** (verifier rule). They exist in `repository/user_integration_test.go`. The plan ticks "make test-integration-local run" but records no result or Postgres version, so I cannot confirm they passed.
- Unit mutation checks (break, see fail, revert), all reverted: usecase drops the not-found mapping, usecase maps every error to unauthenticated, handler passes a different user id, handler sets a cookie, handler answers 200, router test restored to the old `DELETE /account` → 501 expectation. Each made a test fail. The repository mutations (delete nothing, delete by a different id, remove `lockUser`) need a database; I checked them by reading only (see "Integration-only").

## Acceptance criteria

| # | Criterion | Test | Verdict | Evidence |
|---|---|---|---|---|
| U1 | Store `ErrRecordNotFound` → `ErrUnauthenticated`, not the gorm error | `TestAccountService_Delete` / "user row gone…" | Met | Fails when the mapping is removed. FR-25 |
| U2 | Other store error returned unchanged | same / "any other store error…" | Met | Fails when every error is mapped. |
| U3 | Store gets the passed id, called once | same / "the store gets the given user id, once" | Met | Spy records id and call count. |
| H1 | Valid session + CSRF → 204, empty body, no `Set-Cookie` | `TestDeleteAccount_NoContent` | Met | Fails on a 200 and on a `Set-Cookie`. |
| H2 | Spy receives the session's user id | same | Met | `callerID` from `authFor`; fails when a different id is passed. |
| H3 | `ErrUnauthenticated` → 401 problem `unauthenticated` | `TestDeleteAccount_Errors` | Met | `requireProblem` checks status and code. |
| H4 | Unclassified error → 500 `internal_error` | same | Met | |
| H5 | No cookie → 401, spy not called | `TestDeleteAccount_NoCookie` | Met | `spy.calls == 0`. |
| H6 | No CSRF token / wrong token → 403 `csrf_failed`, spy not called | `TestDeleteAccount_CSRF` | Met | Wrong token built from `withCSRF()`'s pieces; no new shared helper. |
| R1 | Router probe uses `POST /auth/logout`, expects 501, comment updated | `TestRouter_APIRequiresASession` | Met | Restoring the old probe makes it panic (nil service), so it discriminates. |
| R2 | Account row keeps the 403 half only | `TestRouter_WritesNeedCSRFProtection` | Met | `reachesStub` flag; logout row keeps both halves. |
| D1 | Everything removed, one assertion per table | `TestUserRepository_DeleteUser_RemovesEverything` | Met (integration-only) | users, sessions, folders, bookmarks, favicons, bookmark_content, each asserted. Seed has two sessions, parent/child folder, live and trashed bookmarks, content and a favicon. |
| D2 | Isolation (NFR-7), `users.version` unchanged | `…_LeavesOtherUsersAlone` | Met (integration-only) | Second user keeps every row; version compared before and after. |
| D3 | Random id and second delete → `ErrRecordNotFound` | `…_MissingUser` | Met (integration-only) | |
| D4 | Takes the user lock | `…_WaitsForTheUserLock` | Met (integration-only) | Polls `pg_stat_activity` (10 ms, 5 s cap), no fixed sleep. Without `lockUser` the delete would not wait, so the poll would time out. |
| D5 | Two concurrent deletes: one nil, one not found | `…_ConcurrentDeletes` | Met (integration-only) | Start barrier. |
| D6 | Save races delete, ≥ 20 rounds | `…_RacingSave` | Met (integration-only) | 25 rounds; asserts 0 bookmarks and Create ∈ {nil, `ErrRecordNotFound`}. |
| W1 | `make check` passes | | Met | |
| W2 | Nothing outside the allowed paths changed | | Met | Changed: `backend/**` (no migrations, no `internal/api`) and the plan file. |

Requirements: FR-25, NFR-3 (D1), NFR-7 (D2) are covered by the tests above. D1–D6 depend only on integration tests.

## Plan check (`delete-account.plan.md`)

- Every criterion in the task file appears in the plan. Nothing is missing.
- Every ticked item has a test, and each checks the behavior (see the table).
- Differences between plan and diff:
  - The plan names usecase subtests "other error is unchanged" and "passes the user id, once"; the real names are "any other store error is returned unchanged" and "the store gets the given user id, once". Cosmetic.
  - The plan ticks "`make test-integration-local` run and reported" but records no outcome or Postgres version.
  - The plan's judgment calls match the diff (raw `DELETE FROM users WHERE id = ?`, inline store interface, 25 rounds, `reachesStub` flag).

## Rule checks

| Rule | Result |
|---|---|
| Only `handler/` imports `internal/api` | Pass (`grep` finds no other importer outside `internal/api`). |
| Every repository query filters by user | Pass. `lockUser` and `DELETE FROM users WHERE id = ?` target the caller's row (the task's own lookup of the `users` row). |
| `users.version` incremented in every write transaction | Not applicable by design. The task says not to bump it, since the row is deleted; `DeleteUser` has no `bumpUserVersion`. |
| `go.mod` `go`/`toolchain` unchanged, no new dependency | Pass: `go.mod` and `go.sum` untouched (`go 1.26.0`). |
| One transaction, `lockUser` first, only the `users` row deleted, `RowsAffected == 0` → not found | Pass (`repository/user.go`). |
| Usecase maps only `ErrRecordNotFound`; handler never returns 404 or sets a header | Pass. |
| `openapi.yaml`, `oapi-codegen.yaml`, `api.gen.go`, migrations untouched | Pass. |
| No log call mentions the user id | Pass: no logging in the new code. |
| Every `NewServer(` call site compiles with the new argument; none hides a nil dereference on the account path | Pass. Five test call sites pass `nil`, none of them calls the account route with a token; `accountRouter` passes a spy. |
| Tables in migrations vs. the "everything" test | Pass. Tables: users, folders, favicons, bookmarks, bookmark_content, sessions. All six are asserted. |

## Findings

### Blocking

None.

### Non-blocking

1. The lock test's `pg_stat_activity` query matches any backend waiting on a lock, not only the `DeleteUser` one. It is safe while the package's tests run one at a time on a private database; a future `t.Parallel()` in the package could make it pass for the wrong reason.
2. Plan records no integration result or Postgres version (see Plan check). The user should run `make test-integration-local` or `make test-integration` before merging.
3. No test builds a user with 1,000 bookmarks to watch the cascade finish. By reading, the cascade is a single `DELETE`, so I expect it to be fine.
4. Known gaps in the task file stay as written: dead `session`/`csrf_token` cookies remain in the browser, and a save that loses the race answers `404`.

## Cases I added

`TestDeleteAccount_RequestBody` in `handler/account_test.go` (existing file): a `DELETE` body of 10 bytes and of exactly 64 KiB is ignored (204, handler called once); 64 KiB + 1 answers 413 and the handler is not called. It passes.

## Not covered by me

A second `DELETE` with the same cookie answering 401 depends on the session cascade in the database; it is covered only by D1 (sessions count 0) and the router's session check, not by an end-to-end test.
