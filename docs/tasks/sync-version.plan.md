# Plan: sync version (back end)

Paths are under `backend/internal/`.

## Usecase (`usecase/sync.go`, tests in `usecase/sync_test.go`, unit, value-return spy)
- [x] Store answering `gorm.ErrRecordNotFound` gives `domain.ErrUnauthenticated` — `TestSyncService_Version/user row gone`
- [x] Any other store error comes back as that same error — `TestSyncService_Version/other error is unchanged`

## Handler (`handler/sync.go`, tests in `handler/sync_test.go`, unit, usecase spy)
- [x] 200, `application/json`, `{"version":7}` and `{"version":0}` (key present) — `TestGetSyncVersion_OK`
- [x] Spy receives the session's user id (`callerID`) — `TestGetSyncVersion_OK`
- [x] `ErrUnauthenticated` → 401 problem `unauthenticated` — `TestGetSyncVersion_Errors`
- [x] Unclassified error → 500 `internal_error` — `TestGetSyncVersion_Errors`
- [x] No cookie → 401, spy not called — `TestGetSyncVersion_NoCookie`
- [x] `?version=5` and an unrelated header → same 200, spy gets only the user id — `TestGetSyncVersion_IgnoresQueryAndHeaders`
- [x] Reuse `authFor` / `callerID`; no second helper

## Router test (`handler/router_test.go`)
- [x] `TestRouter_APIRequiresASession` probes `GET /api/v1/favicons/<uuid>` expecting 501 `not_implemented`

## Repository (`repository/user.go`, tests in `repository/user_integration_test.go`)
- [x] `Version` is 0 for a new user — `TestUserVersion/new user is zero`
- [x] +1 after each write, one subtest each: bookmark create, update, trash, restore, empty trash (non-empty), folder create, rename, delete, RecordFetchSuccess, RecordFetchFailure — `TestUserVersion/<write>`
- [x] No increment: empty trash with nothing, refused duplicate create — `TestUserVersion/no increment ...`
- [x] Isolation: B's write leaves A's version; random id is `gorm.ErrRecordNotFound` — `TestUserVersion/isolation`
- [x] Two consecutive reads equal — `TestUserVersion/read does not write`

## Wiring
- [x] `handler/server.go`: `NewServer(bookmarks, folders, sync)`; `cmd/server/main.go` wires `usecase.NewSyncService`; update the 4 test call sites
- [x] `make check` passes
- [x] Integration tests run via `make test-integration-local`
- [x] Nothing outside allowed paths changed

## Judgment calls
- `Version` uses `Select("version").Scan(&[]int64).Limit(1)` so a missing row is detected from an empty result in one query (no `First`, which would add ordering and load via the model).
- The repository test creates users with `FindOrCreateUserByIdpID` and reuses the package's existing `newBookmark`/`newFolder` constructors (pure domain structs) to build inputs; it does not use `userVersion` (a raw-DB helper), so `Version` itself is what is asserted.
- The "folder rename" test uses a fresh random name to avoid a sibling-name conflict; "bookmark update" sets a note, which changes the row.
- Success handler test is table-driven (two cases) and checks the body with `JSONEq`; the key-present check for 0 holds because `JSONEq` compares against `{"version":0}`.
- In `main.go` I hoisted one `userRepo` shared by auth and sync, as the task suggested.
- `go.mod` was not touched; `make check` needed `npm ci` in `frontend/` first (not committed).
