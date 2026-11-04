# Plan: delete account (backend)

Prerequisite checked: `NewServer` takes four arguments and the router probe uses `DELETE /api/v1/account` expecting 501.

## Usecase (`backend/internal/usecase/account.go`, tests in `account_test.go`)
- [ ] Store answering `gorm.ErrRecordNotFound` gives `domain.ErrUnauthenticated` — `TestAccountService_Delete` in `usecase/account_test.go`
- [ ] Any other store error is returned as that same error — same file, subtest "other error is unchanged"
- [ ] Store receives the passed user id and is called once — same file, subtest "passes the user id, once"

## Handler (`backend/internal/handler/account.go`, tests in `account_test.go`)
- [ ] Valid session + CSRF → 204, empty body, no `Set-Cookie` — `TestDeleteAccount_NoContent` in `handler/account_test.go`
- [ ] Spy receives the session's user id (`authFor`, `callerID`) — same test
- [ ] Spy returns `ErrUnauthenticated` → 401 problem `unauthenticated` — `TestDeleteAccount_Errors`
- [ ] Spy returns unclassified error → 500 `internal_error` — `TestDeleteAccount_Errors`
- [ ] No cookie → 401, spy not called — `TestDeleteAccount_NoCookie`
- [ ] Valid session, no CSRF token or wrong token → 403 `csrf_failed`, spy not called — `TestDeleteAccount_CSRF`

## Router test (`backend/internal/handler/router_test.go`)
- [ ] "valid session reaches the handler" probes `POST /auth/logout` (session + CSRF), expects 501; comment updated
- [ ] `TestRouter_WritesNeedCSRFProtection`: account row keeps the 403 half only; logout row keeps both

## Repository (`backend/internal/repository/user.go`, tests in `user_integration_test.go`)
- [ ] Everything removed: users, sessions, folders, bookmarks, favicons, bookmark_content — `TestUserRepository_DeleteUser_RemovesEverything`
- [ ] User isolation (NFR-7): second user's rows and `users.version` unchanged — `TestUserRepository_DeleteUser_LeavesOtherUsersAlone`
- [ ] Random id and second delete → `gorm.ErrRecordNotFound` — `TestUserRepository_DeleteUser_MissingUser`
- [ ] Takes the user lock (waits on `pg_stat_activity` Lock wait) — `TestUserRepository_DeleteUser_WaitsForTheUserLock`
- [ ] Two concurrent deletes: one nil, one not found — `TestUserRepository_DeleteUser_ConcurrentDeletes`
- [ ] Save races delete (>= 20 rounds): 0 bookmarks, Create is nil or not found — `TestUserRepository_DeleteUser_RacingSave`

## Wiring and call sites
- [ ] `handler/server.go` fifth dependency `account`; `cmd/server/main.go` wires `usecase.NewAccountService(userRepo)`; all `NewServer(` call sites updated
- [ ] `make check` passes; `make test-integration-local` run and reported

## Judgment calls
(to be filled in at the end)
