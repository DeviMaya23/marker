# Task: sync version (back end)

> One backend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> **Prerequisite:** none beyond the current `main`. The contract needs no change: `getSyncVersion` exists in `openapi.yaml` with its `200` and `401`. If something here contradicts `openapi.yaml`, stop and ask; do not edit it.

## Goal

A signed-in user's client can ask the server for the user's change counter, so that a later front-end task can poll it and refresh the screen when it changes. This is the server half of background sync; the poll itself is a later front-end task.

Requirements covered: NFR-2, server half: the counter that every write transaction increments (including completion of a background fetch) can be read by the client, per user.

Out of scope, and why:

- The poll, the refetch and the scroll-position handling in the UI: a front-end task that comes after this one.
- Exempting this route from rate limiting (NFR-16): rate limiting is not built at all yet. The limiter task must exempt this route; it is already written in the contract.
- Any new increment of `users.version`. Every write path already increments it (see "What is already true"); this task only reads it.
- Cache headers on the response: the contract lists none, and a generated response cannot carry a header the contract does not declare. See "Known gaps".
- A `HEAD` route, long polling, server-sent events or any push mechanism: polling is the decided design.
- Any change to the contract, the migrations or `docs/**`.

## Role and ownership

Role: Backend (see `AGENTS.md`).

You may change `backend/**` except `backend/migration/` and `backend/internal/api/` (generated). You may not change `openapi.yaml`, `oapi-codegen.yaml`, `docs/**` (except your own plan file, `docs/tasks/sync-version.plan.md`, see `AGENTS.md`), `CONVENTIONS.md`, the frontend, migrations or the Makefile. You need no migration: `users.version` exists (`bigint NOT NULL DEFAULT 0`). If you think you need one, stop and ask.

**Shared files.** No other backend task runs now; a front-end task may run at the same time, and it touches only `frontend/**`. You change `handler/server.go` (a third dependency on `NewServer`), `cmd/server/main.go` (wire it), `repository/user.go` (one method), and every place that calls `NewServer(`: `handler/devlogin_test.go`, `handler/router_test.go`, `handler/folders_test.go`, `handler/bookmarks_test.go` (pass `nil` or a spy for the new argument). You do not need to change `problem.go`, `router.go`, `domain/errors.go` or any migration; the new failure reuses `domain.ErrUnauthenticated`. If you find you must, stop and ask.

## Operations used

- `getSyncVersion` (`GET /api/v1/sync/version`), a 501 stub today. Response `200 { version: integer >= 0 }`, generated as `api.GetSyncVersion200JSONResponse` with `Version int`. Only `handler/` imports `internal/api`.

Authentication is applied by the router (a missing, unknown or expired session is `401 unauthenticated` before the handler runs). It is a `GET`, so there is no CSRF check and no request body.

## What is already true

Do not add or change any of this; the tests below prove it from the new read side.

- `repository.bumpUserVersion` increments `users.version` by 1 inside the write transaction of: bookmark create, bookmark update (only when something changed), trash, restore, empty trash (only if it deleted any), folder create, folder update (not for `{}`), folder delete, `RecordFetchSuccess` and `RecordFetchFailure`.
- A refused or failed write rolls back and does not increment it.
- `domain.User.Version` is `int64`.

## Behavior

### getSyncVersion

1. The caller is the user from the session (`middleware.AuthFrom`). No `Auth` in the context: `domain.ErrUnauthenticated`, as every other handler does.
2. Read `users.version` for that user id and nothing else: no join, no write, no lock (no `FOR UPDATE`). The request is polled every 2 to 3 seconds, so it must be one primary-key read.
3. Respond `200` with `{"version": <the number>}`. A user who has never written anything answers `{"version": 0}` (the field is present, not omitted).
4. Query parameters and headers other than the session cookie are ignored.

Two reads with no write between them return the same number. The number only goes up. It is not a count of anything and clients compare it only for equality with the last one they saw.

### Failures

| Situation | Status | Code |
|---|---|---|
| No cookie, unknown or expired session | `401` | `unauthenticated` (router, before the handler) |
| The session is valid but the user row is gone | `401` | `unauthenticated` |
| Any other error from the database | `500` | `internal_error` (the existing generic mapping) |

The "user row is gone" case: the repository reports `gorm.ErrRecordNotFound` and the usecase turns it into `domain.ErrUnauthenticated`. It must not reach the client as `404 not_found`, which the contract does not list for this operation.

### Known gaps

- The response carries no cache headers. A browser does not cache a `GET` that has no validators and no freshness information, so polling works; if a proxy ever caches it, the fix is a contract change (declare `Cache-Control: no-store`), which the user decides.
- The number is exact only up to 2^53 (a JavaScript client would round above it), and the handler's `int64` to `int` conversion assumes a 64-bit build. Accepted: the counter goes up by one per write, so it cannot get near either limit, and the contract sets no maximum.
- A write that commits between two polls shows as one change, however many writes it was. That is the design (clients refetch on any change).

## Structure

Follow `ARCHITECTURE.md` and the file-placement and test-file rules in `TESTING.md`.

- `repository/user.go`: a new method on `UserRepository`, `Version(ctx, userID) (int64, error)`, that selects only the `version` column for `id = userID`. A missing user is `gorm.ErrRecordNotFound`. Do not load the whole `domain.User`.
- `usecase/sync.go` (new): `SyncService` with `NewSyncService(store)` and `Version(ctx, userID) (int64, error)`. Its store interface has one method and is used only here, so declare it inline in `sync.go`, not in a separate `_store.go` (`ARCHITECTURE.md`: at most 2 methods and used by one file). It maps `gorm.ErrRecordNotFound` to `domain.ErrUnauthenticated`; every other error passes through unchanged.
- `handler/sync.go` (new): a `SyncService` interface (`Version(ctx, userID uuid.UUID) (int64, error)`), satisfied by `usecase.SyncService`, and the method `(*Server).GetSyncVersion`, which shadows the stub. Convert the `int64` to the response's `int`. The server is 64-bit only, so the conversion is exact; add no overflow check.
- `handler/server.go`: `Server` gets a `sync SyncService` field and `NewServer(bookmarks, folders, sync)` takes it third. Keep the `GetSyncVersion` stub in `stubs.go`: the other implemented operations keep theirs, and the method on `Server` shadows it.
- `cmd/server/main.go`: build `usecase.NewSyncService(repository.NewUserRepository(db))` and pass it to `NewServer`. Reuse the `UserRepository` the auth service already gets if one is in scope; do not open a second database connection.

## Dependencies

None. Use only what is in `go.mod`.

## Acceptance criteria

Unit tests need no database. Integration tests carry the `integration` build tag; run them with `make test-integration-local` if the session can start a database (see `TESTING.md`) and say in the report which ran and which did not.

**Usecase (unit, value-return spy for the store)**
- A store answering `gorm.ErrRecordNotFound` gives `domain.ErrUnauthenticated` (`require.ErrorIs`), not the gorm error.
- Any other store error comes back as that same error (it is not mistaken for the user-gone case). This is a deliberate exception to the "no pass-through tests" rule in `TESTING.md`: it pins the boundary of the mapping above, so the one assertion is wanted.

**Handler (unit, usecase spy)**
- `200` with `Content-Type: application/json` and the body `{"version": 7}` when the spy returns 7, and `{"version": 0}` (the key present) when it returns 0.
- The user id the spy receives is the one in the session (use a session for a known user id).
- The spy returning `domain.ErrUnauthenticated` answers `401` `application/problem+json` with `code: unauthenticated`.
- The spy returning an unclassified error answers `500` with `code: internal_error`.
- Through the router with no cookie: `401 unauthenticated`, and the spy is not called.
- A request with query parameters (`?version=5`) and an unrelated header gets the same `200` body, and the spy receives only the user id.
- Build the router and the session the way `handler/bookmarks_test.go` does (reuse `authFor` and `callerID`); do not add a second helper for the same thing.

**Router test.** `TestRouter_APIRequiresASession` in `handler/router_test.go` currently probes `/api/v1/sync/version` and expects `501` to show that a valid session reaches the handler. That probe is now a real operation. Replace it with another operation that is still a stub (`GET /api/v1/favicons/<any uuid>`, expecting `501 not_implemented`), so the test keeps proving what it proves. If `getFavicon` is no longer a stub when you build this, pick any stub still in `stubs.go`; if there is none, stop and ask.

**Repository (integration, in a new `repository/user_integration_test.go`; imports `domain`, `repository` and `testutil` only)**

Create the user with `UserRepository.FindOrCreateUserByIdpID` and do the writes through `BookmarkRepository` and `FolderRepository` directly, as the neighbouring integration tests do; construct no service. For `RecordFetchSuccess` and `RecordFetchFailure` the bookmark is one saved as pending.

- `Version` returns `0` for a new user.
- After each of these real writes through the repositories, `Version` returns exactly the previous value plus 1: bookmark create, bookmark update that changes something, trash, restore, empty trash that deletes at least one bookmark, folder create, folder rename, folder delete, `RecordFetchSuccess`, `RecordFetchFailure`. One subtest per write, so a missing increment names the path.
- No increment, and the same number from `Version` before and after: empty trash with nothing in the trash, and a write the database refuses (for example a duplicate bookmark create).
- User isolation (NFR-7): a write by user B leaves user A's `Version` unchanged; `Version` for a random id is `gorm.ErrRecordNotFound`.
- Two consecutive `Version` calls with no write between them return the same number (the read does not write).

**Repo-wide**
- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt:

- `Version` filters by the user id it is given and selects only `version`. There is no `FOR UPDATE`, no write and no second query in the read path.
- The usecase maps only `gorm.ErrRecordNotFound`; the handler never returns `404` for this operation.
- `handler/` is the only package that imports `internal/api`. No new dependency; `go.mod`, `go.sum`, `openapi.yaml`, `oapi-codegen.yaml`, `api.gen.go` and migrations are untouched. No `bumpUserVersion` call added or removed anywhere.
- Every `NewServer(` call site compiles with the new argument; none passes a value that hides a nil dereference on the sync path in a test that uses it.
- To confirm the tests discriminate (break the behavior, see them fail, revert): make `Version` return a constant, and check `Version`'s integration tests fail; delete the not-found mapping, and check the usecase test fails; drop the `int` conversion's value (return 0), and check the handler test fails; remove one `bumpUserVersion` call from one write path (for example `RecordFetchFailure`), and check exactly that subtest fails. Revert each.
- Try to break it with: a request with `?version=5` or a body; a valid session whose user row was deleted straight in the database (the sessions cascade with the user, so the router answers `401` first; the usecase's not-found mapping is proved only by its unit test, so check that test, not this request); two users polling at once while one writes.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement or this file conflict with each other.
- You think you need a migration, a dependency, a change to the contract, to the generated code or its config, or a new `pkg/` package.
- A write path you find does not increment `users.version`. Do not add the increment; report which path.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), which integration tests ran and which did not (and the Postgres version if they ran), and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
