# Plan: sync version (back end)

Paths are under `backend/internal/`.

## Usecase (`usecase/sync.go`, tests in `usecase/sync_test.go`, unit, value-return spy)
- [ ] Store answering `gorm.ErrRecordNotFound` gives `domain.ErrUnauthenticated` — `TestSyncService_Version/user row gone`
- [ ] Any other store error comes back as that same error — `TestSyncService_Version/other error is unchanged`

## Handler (`handler/sync.go`, tests in `handler/sync_test.go`, unit, usecase spy)
- [ ] 200, `application/json`, `{"version":7}` and `{"version":0}` (key present) — `TestGetSyncVersion_OK`
- [ ] Spy receives the session's user id (`callerID`) — `TestGetSyncVersion_OK`
- [ ] `ErrUnauthenticated` → 401 problem `unauthenticated` — `TestGetSyncVersion_Errors`
- [ ] Unclassified error → 500 `internal_error` — `TestGetSyncVersion_Errors`
- [ ] No cookie → 401, spy not called — `TestGetSyncVersion_NoCookie`
- [ ] `?version=5` and an unrelated header → same 200, spy gets only the user id — `TestGetSyncVersion_IgnoresQueryAndHeaders`
- [ ] Reuse `authFor` / `callerID`; no second helper

## Router test (`handler/router_test.go`)
- [ ] `TestRouter_APIRequiresASession` probes `GET /api/v1/favicons/<uuid>` expecting 501 `not_implemented`

## Repository (`repository/user.go`, tests in `repository/user_integration_test.go`)
- [ ] `Version` is 0 for a new user — `TestUserVersion/new user is zero`
- [ ] +1 after each write, one subtest each: bookmark create, update, trash, restore, empty trash (non-empty), folder create, rename, delete, RecordFetchSuccess, RecordFetchFailure — `TestUserVersion/<write>`
- [ ] No increment: empty trash with nothing, refused duplicate create — `TestUserVersion/no increment ...`
- [ ] Isolation: B's write leaves A's version; random id is `gorm.ErrRecordNotFound` — `TestUserVersion/isolation`
- [ ] Two consecutive reads equal — `TestUserVersion/read does not write`

## Wiring
- [ ] `handler/server.go`: `NewServer(bookmarks, folders, sync)`; `cmd/server/main.go` wires `usecase.NewSyncService`; update the 4 test call sites
- [ ] `make check` passes
- [ ] Integration tests run via `make test-integration-local`
- [ ] Nothing outside allowed paths changed

## Judgment calls
