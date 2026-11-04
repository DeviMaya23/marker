# Task: delete account (back end)

> One backend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> **Prerequisite:** the `get-favicon` task is merged to `main`. Check it before you start: `NewServer` takes four arguments (`bookmarks, folders, sync, favicons`), and the "valid session reaches the handler" probe in `handler/router_test.go` uses `DELETE /api/v1/account` and expects `501`. If either is missing, stop and ask; do not create it. Both tasks change `handler/server.go`, `cmd/server/main.go` and the same test files, so they cannot run together.
>
> The contract needs no change: `deleteAccount` exists in `openapi.yaml` with its `204`, `401`, `403` and `429` and no response header. If something here contradicts `openapi.yaml`, stop and ask; do not edit it.

## Goal

A signed-in user's client can permanently erase all of the user's app data in one call: bookmarks, notes, folders, favicons, saved page content, the trash and every session. The identity provider's account is untouched. The delete button and its confirmation in the UI, and logging out, are separate tasks.

Requirements covered: FR-25 (the account's data is erased, including the trash), NFR-3 (no app data of the user remains, and no copy is kept), NFR-7 (only the caller's rows are removed).

Out of scope, and why:

- The account area and the confirmation dialog in the UI: a front-end task that comes after this one.
- Clearing the `session` and `csrf_token` cookies: the contract's `204` declares no `Set-Cookie`, and a generated response cannot carry a header the contract does not list. See "Known gaps".
- `authLogout`, `authLogin`, `authCallback`: the Auth task. This task does not touch them.
- Producing `429` (rate limiting, NFR-16): not built at all yet. The contract already lists it; the limiter task adds it.
- Deleting the user at Kinde (FR-25 says the IdP account is not deleted).
- Any migration. Every user-owned table already references `users (id) ON DELETE CASCADE` (`000001_core_entities`, `000002_sessions`), and `bookmark_content` cascades from its bookmark. If you find a table that would survive the delete, stop and ask; do not add a migration.
- Any change to the contract, the generated code, `docs/**` or the frontend.

## Role and ownership

Role: Backend (see `AGENTS.md`).

You may change `backend/**` except `backend/migration/` and `backend/internal/api/` (generated). You may not change `openapi.yaml`, `oapi-codegen.yaml`, `docs/**` (except your own plan file, `docs/tasks/delete-account.plan.md`, see `AGENTS.md`), `CONVENTIONS.md`, the frontend, migrations or the Makefile.

**Shared files.** No other backend task may run at the same time (`get-favicon` must be merged first, see the Prerequisite). A front-end task may run at the same time; it touches only `frontend/**`. You change `handler/server.go` (a fifth dependency on `NewServer`), `cmd/server/main.go` (wire it), `repository/user.go` (one method), `usecase/fakes_test.go` only if you need a fake there, and every place that calls `NewServer(`: find them with `grep -rn "NewServer(" backend` (at least `handler/devlogin_test.go`, `handler/router_test.go`, `handler/sync_test.go`, `handler/folders_test.go`, `handler/bookmarks_test.go` and the favicon handler test) and pass `nil` or a spy for the new, last argument. You also change `handler/router_test.go` in two places (see "Acceptance criteria"). You do not need to change `problem.go`, `router.go`, `domain/errors.go` or any migration; the one new failure reuses `domain.ErrUnauthenticated`. If you find you must, stop and ask.

## Operations used

- `deleteAccount` (`DELETE /api/v1/account`), a 501 stub today. Request: no body; the `X-CSRF-Token` header parameter. Response `204` with no body, generated as `api.DeleteAccount204Response{}`. Only `handler/` imports `internal/api`. The request object carries a `Params` value with the CSRF header; the handler ignores it (the router has already checked CSRF).

Authentication and CSRF are applied by the router: a missing, unknown or expired session is `401 unauthenticated`, and a missing or wrong CSRF token is `403 csrf_failed`, both before the handler runs. There is no request body.

## Behavior

### deleteAccount

1. The caller is the user from the session (`middleware.AuthFrom`). No `Auth` in the context: `domain.ErrUnauthenticated`, as every other handler does.
2. In one database transaction, take the user's lock with the existing `lockUser` (a `SELECT … FOR UPDATE` on the `users` row), then delete that `users` row. The database cascades the delete to the user's sessions, folders, bookmarks, favicons and, through the bookmarks, their saved content. Trashed bookmarks are bookmarks, so they go too. Do not delete the dependent tables one by one; the cascade is the mechanism (`requirements.md`, "All user-owned tables cascade on delete from `users`").
3. Do not call `bumpUserVersion`: the row it would update is the one being deleted.
4. Respond `204` with no body. No cookie is set or cleared, and no other header is added.

Order of effects for a write that races the delete: `lockUser` serialises them. A write that holds the lock first commits, and its rows are then removed by the cascade. A write that comes after finds no user (`gorm.ErrRecordNotFound`) and fails as it does today for a missing user. After the delete commits, the user has no row in any table.

A page fetch that is running for one of the user's bookmarks when the account is deleted is already discarded quietly by `FetchService` (FR-5c); this task does not change it. River's own job rows hold only a bookmark id, no user data, and are left alone.

### Failures

| Situation | Status | Code |
|---|---|---|
| No cookie, unknown or expired session | `401` | `unauthenticated` (router, before the handler) |
| Missing or wrong CSRF token | `403` | `csrf_failed` (router, before the handler) |
| The session is valid but the user row is already gone | `401` | `unauthenticated` |
| Any other error from the database | `500` | `internal_error` (the existing generic mapping) |

"The user row is already gone": the repository reports `gorm.ErrRecordNotFound` and the usecase turns it into `domain.ErrUnauthenticated`. It must not reach the client as `404 not_found`, which the contract does not list for this operation. Sessions cascade with the user, so the router already answers `401` for a second `DELETE` with the same cookie; the usecase mapping covers a race between two deletes of the same account.

The router checks the session first and the CSRF token second, so a request with neither answers `401`. A request body on the `DELETE` is ignored (and still subject to the router's 64 KiB cap). A database error leaves the data as it was, because the delete is one statement inside one transaction; that is not tested (see "Known gaps").

There is no confirmation step in the API and no request field. The client's dialog is the safeguard (FR-25 is satisfied by the call itself).

### Known gaps

- The browser keeps its `session` and `csrf_token` cookies after the call. They are dead: the session row is gone, so the next request answers `401`. Clearing them needs a `Set-Cookie` on the `204`, which is a contract change the user has decided against for now.
- A save that races the delete and loses answers `404 not_found` (the generic mapping of `gorm.ErrRecordNotFound`), which the contract does not list for `createBookmark`. The client is leaving the account at that moment; not changed here.
- No test injects a database failure to prove the rollback; it follows from the single transaction, and the verifier checks it by reading the code.
- The deletion is not logged. Do not add a log line with the user id.
- Whatever the database or the host keeps outside the app's tables (write-ahead log, filesystem backups) is not the app's to erase; NFR-3 says the app keeps no backups.

## Structure

Follow `ARCHITECTURE.md` and the file-placement and test-file rules in `TESTING.md`.

- `repository/user.go`: a new method on `UserRepository`, `DeleteUser(ctx, userID uuid.UUID) error`. It runs the transaction above using `lockUser`. A missing user is `gorm.ErrRecordNotFound` (from `lockUser`). It also checks that the delete affected one row, and returns `gorm.ErrRecordNotFound` if it affected none. No other method changes.
- `usecase/account.go` (new): `AccountService` with `NewAccountService(store)` and `Delete(ctx, userID uuid.UUID) error`. Its store interface has one method (`DeleteUser`) and is used only here, so declare it inline in `account.go`, not in a `_store.go` file (`ARCHITECTURE.md`). It maps `gorm.ErrRecordNotFound` to `domain.ErrUnauthenticated`; every other error passes through unchanged. Follow `usecase/sync.go`.
- `handler/account.go` (new): an `AccountService` interface (`Delete(ctx, userID uuid.UUID) error`), satisfied by `usecase.AccountService`, and the method `(*Server).DeleteAccount`, which shadows the stub. Follow `handler/sync.go`.
- `handler/server.go`: `Server` gets an `account AccountService` field on its own line, and `NewServer(bookmarks, folders, sync, favicons, account)` takes it last. Keep the `DeleteAccount` stub in `stubs.go`: the other implemented operations keep theirs, and the method on `Server` shadows it.
- `cmd/server/main.go`: build `usecase.NewAccountService(userRepo)`, reusing the `UserRepository` that is already in scope, and pass it to `NewServer`. Do not open a second database connection.

## Dependencies

None. Use only what is in `go.mod`.

## Acceptance criteria

Unit tests need no database. Integration tests carry the `integration` build tag; run them with `make test-integration-local` if the session can start a database (see `TESTING.md`) and say in the report which ran and which did not.

**Usecase (unit, value-return spy for the store; in `usecase/account_test.go`)**
- A store answering `gorm.ErrRecordNotFound` gives `domain.ErrUnauthenticated` (`require.ErrorIs`), not the gorm error.
- Any other store error comes back as that same error (it is not mistaken for the user-gone case). This is a deliberate exception to the "no pass-through tests" rule in `TESTING.md`: it pins the boundary of the mapping above, so the one assertion is wanted.
- The store receives the user id that was passed in, and is called once.

**Handler (unit, usecase spy; in `handler/account_test.go`)**
- `DELETE /api/v1/account` with a valid session and CSRF token answers `204` with an empty body, and sets no `Set-Cookie` header.
- The user id the spy receives is the one in the session (use `authFor` and `callerID` from `handler/bookmarks_test.go`; do not add a second helper for the same thing).
- The spy returning `domain.ErrUnauthenticated` answers `401` `application/problem+json` with `code: unauthenticated`.
- The spy returning an unclassified error answers `500` with `code: internal_error`.
- Through the router with no cookie: `401 unauthenticated`, and the spy is not called.
- With a valid session and no CSRF token: `403 csrf_failed`, and the spy is not called. With a wrong token (the `X-CSRF-Token` header set to a value that differs from the `csrf_token` cookie, with the matching `Origin`; build it from `withCSRF()`'s pieces in the test, no new shared helper): the same.

**Router test (`handler/router_test.go`).** Two places currently rely on `deleteAccount` being a 501 stub, and both break when it is real:
- `TestRouter_APIRequiresASession`, the subtest "valid session reaches the handler", probes `DELETE /api/v1/account` and expects `501`. Replace the probe with `POST /auth/logout` sent with `withSession(goodSession)` and `withCSRF()`, expecting `501 not_implemented`, and update the comment above it to say `authLogout` is the stub it relies on. If `authLogout` is no longer a stub when you build this, pick any stub still in `stubs.go` that sits behind the session check; if there is none, stop and ask.
- `TestRouter_WritesNeedCSRFProtection` has the row `DELETE /api/v1/account` and, for each row, asserts `403` without a token and `501` with one. `newTestRouter` passes `nil` services, so a request that reaches the account handler would dereference `nil`. Keep the `403` half for the account row, and drop the `501` half for it (the `POST /auth/logout` row keeps both). The handler tests above prove the real `DELETE /account` behavior with a token. Do not remove the account row's `403` assertion.

**Repository (integration, in `repository/user_integration_test.go`, which exists; imports `domain`, `repository` and `testutil` only, no service)**

Use the helpers the neighbouring files already have (`newUser`, `newBookmark`, `newFolder`, `newSession`); do not add copies.

- `DeleteUser` for a user with everything: two sessions, a folder with a child folder, a live bookmark in the child folder, a trashed bookmark (`deleted_at` set), a bookmark with saved content (`bookmark_content`), and a favicon (created through `RecordFetchSuccess` with a `FaviconData`, or inserted directly). Afterwards no row remains with that user: counts of `users`, `sessions`, `folders`, `bookmarks`, `favicons` filtered by the user are all `0`, and there is no `bookmark_content` row for the user's bookmark ids. One assertion per table, so a surviving table names itself.
- User isolation (NFR-7): a second user created in the same test, with a session, a folder, a bookmark with content and a favicon, keeps every one of those rows, and their `users.version` is unchanged.
- `DeleteUser` for a random id is `gorm.ErrRecordNotFound`, and deleting the same user twice returns `gorm.ErrRecordNotFound` the second time.
- `DeleteUser` takes the same lock as every other write: hold `SELECT … FOR UPDATE` on the user's row in an open transaction, start `DeleteUser` in a goroutine, and wait until `pg_stat_activity` shows a backend with `wait_event_type = 'Lock'` (poll every 10 ms, give up after 5 s and fail). Do not use a fixed sleep. Then check `DeleteUser` has not returned, commit the holder's transaction, and check `DeleteUser` returns `nil` and the user is gone.
- Two `DeleteUser` calls for the same user started together (use a start barrier): exactly one returns `nil` and the other returns `gorm.ErrRecordNotFound`.
- A save races the delete: start `BookmarkRepository.Create` for the user in a goroutine and `DeleteUser` at the same time, many times over fresh users (at least 20 rounds). In every round, afterwards, there are `0` bookmarks for that user, and the `Create` returned either `nil` or `gorm.ErrRecordNotFound`, never another error. Use a start barrier, as `TestBookmarkRepository_Create_ConcurrentSavesNeverExceedTheCap` does.

**Repo-wide**
- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt:

- `DeleteUser` runs in a single transaction, calls `lockUser` first and deletes only the `users` row (no per-table deletes), and has no `bumpUserVersion` call. Every query filters by the given user id (NFR-7).
- The usecase maps only `gorm.ErrRecordNotFound`; the handler never returns `404` for this operation and never sets a cookie or another header.
- `handler/` is the only package that imports `internal/api`. No new dependency; `go.mod`, `go.sum`, `openapi.yaml`, `oapi-codegen.yaml`, `api.gen.go` and migrations are untouched. No log call mentions the user id.
- Every `NewServer(` call site compiles with the new argument; none passes a value that hides a nil dereference on the account path in a test that uses it.
- Compare the user-owned tables in the migrations (every table with a `user_id`, plus `bookmark_content`) with the tables checked by the "everything" integration test. A table in the migrations that the test does not check is a finding.
- To confirm the tests discriminate (break the behavior, see them fail, revert): make `DeleteUser` delete nothing (return `nil` early) and check the repository tests fail; add `AND user_id <> …` or delete by a different id and check the isolation test fails; remove the `lockUser` call and check the lock test fails; delete the not-found mapping in the usecase and check its test fails; make the handler answer `200` or set a cookie and check the handler test fails; restore the old `501` expectation in the router test and check it fails. Revert each.
- Try to break it with: a second `DELETE` with the same cookie; `DELETE` with a body; a user with 1,000 bookmarks (the cap, NFR-17) to see the cascade finish; two deletes of the same account at once; a bookmark save and a delete at once.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement or this file conflict with each other.
- You think you need a migration, a dependency, a change to the contract, to the generated code or its config, or a new `pkg/` package.
- A table holds user data and does not cascade from `users`, or the cascade leaves a row behind.
- The Prerequisite is not met.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), which integration tests ran and which did not (and the Postgres version if they ran), and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
