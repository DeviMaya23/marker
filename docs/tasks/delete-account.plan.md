# Plan: delete account (backend)

Prerequisite checked: `NewServer` takes four arguments and the router probe uses `DELETE /api/v1/account` expecting 501.

## Usecase (`backend/internal/usecase/account.go`, tests in `account_test.go`)
- [x] Store answering `gorm.ErrRecordNotFound` gives `domain.ErrUnauthenticated` — `TestAccountService_Delete` in `usecase/account_test.go`
- [x] Any other store error is returned as that same error — same file, subtest "other error is unchanged"
- [x] Store receives the passed user id and is called once — same file, subtest "passes the user id, once"

## Handler (`backend/internal/handler/account.go`, tests in `account_test.go`)
- [x] Valid session + CSRF → 204, empty body, no `Set-Cookie` — `TestDeleteAccount_NoContent` in `handler/account_test.go`
- [x] Spy receives the session's user id (`authFor`, `callerID`) — same test
- [x] Spy returns `ErrUnauthenticated` → 401 problem `unauthenticated` — `TestDeleteAccount_Errors`
- [x] Spy returns unclassified error → 500 `internal_error` — `TestDeleteAccount_Errors`
- [x] No cookie → 401, spy not called — `TestDeleteAccount_NoCookie`
- [x] Valid session, no CSRF token or wrong token → 403 `csrf_failed`, spy not called — `TestDeleteAccount_CSRF`

## Router test (`backend/internal/handler/router_test.go`)
- [x] "valid session reaches the handler" probes `POST /auth/logout` (session + CSRF), expects 501; comment updated
- [x] `TestRouter_WritesNeedCSRFProtection`: account row keeps the 403 half only; logout row keeps both

## Repository (`backend/internal/repository/user.go`, tests in `user_integration_test.go`)
- [x] Everything removed: users, sessions, folders, bookmarks, favicons, bookmark_content — `TestUserRepository_DeleteUser_RemovesEverything`
- [x] User isolation (NFR-7): second user's rows and `users.version` unchanged — `TestUserRepository_DeleteUser_LeavesOtherUsersAlone`
- [x] Random id and second delete → `gorm.ErrRecordNotFound` — `TestUserRepository_DeleteUser_MissingUser`
- [x] Takes the user lock (waits on `pg_stat_activity` Lock wait) — `TestUserRepository_DeleteUser_WaitsForTheUserLock`
- [x] Two concurrent deletes: one nil, one not found — `TestUserRepository_DeleteUser_ConcurrentDeletes`
- [x] Save races delete (>= 20 rounds): 0 bookmarks, Create is nil or not found — `TestUserRepository_DeleteUser_RacingSave`

## Wiring and call sites
- [x] `handler/server.go` fifth dependency `account`; `cmd/server/main.go` wires `usecase.NewAccountService(userRepo)`; all `NewServer(` call sites updated
- [x] `make check` passes; `make test-integration-local` run and reported

## Judgment calls
- `DeleteUser` runs `DELETE FROM users WHERE id = ?` as raw SQL through `tx.Exec`, like `lockUser` and `bumpUserVersion` do, and checks `RowsAffected`.
- The usecase store interface is written inline in the struct and constructor (task said "inline in `account.go`"), not as a named type.
- The "everything" seed uses `storeIcon` (existing helper) for the favicon, which also gives that bookmark saved content; a second content row is inserted for the live bookmark. So the user has 3 bookmarks and 2 `bookmark_content` rows; the isolation test checks the second user keeps all of them.
- Seeded folders and bookmarks are inserted directly with `db.Create` (as neighbouring tests do), not through the repositories.
- Lock test: waits for any backend in `pg_stat_activity` with `wait_event_type = 'Lock'` (the test database server is private to the test process, so only this wait can match).
- Racing-save test: 25 rounds. `DeleteUser` must succeed in every round (the user always exists when it starts).
- Router test: the account row in `TestRouter_WritesNeedCSRFProtection` got a `reachesStub` flag so only its 403 half runs.
- `make check` needed `npm ci` in `frontend/` first (fresh checkout), as `AGENTS.md` says.
