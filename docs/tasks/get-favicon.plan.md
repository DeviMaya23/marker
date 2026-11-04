# Plan: get favicon (back end)

Branch: `claude/get-favicon-49x88t`

## Usecase (`backend/internal/usecase/favicon.go`, tests in `favicon_test.go`, fake in `fakes_test.go`)
- [ ] The five served types come back with the same type and bytes: `TestFaviconService_Get` table, `usecase/favicon_test.go`
- [ ] `image/vnd.microsoft.icon` comes back as `image/x-icon`, same bytes: same table row
- [ ] `image/svg+xml`, `text/html`, `IMAGE/PNG`, empty string give `gorm.ErrRecordNotFound` and no favicon: `TestFaviconService_Get_NotServable`, `usecase/favicon_test.go`
- [ ] Store receives the caller's user id and favicon id (two different ids): `TestFaviconService_Get_PassesIDs`, `usecase/favicon_test.go`
- [ ] A non-not-found store error is not turned into not-found: `TestFaviconService_Get_StoreErrorStaysAnError`, `usecase/favicon_test.go`

## Handler (`backend/internal/handler/favicon.go`, tests in `favicon_test.go`, spy inline)
- [ ] Each of the five types: 200, Content-Type, body, Content-Length, exact Cache-Control, ETag present: `TestGetFavicon_OK`, `handler/favicon_test.go`
- [ ] ETag form and equals test-computed SHA-256 of type + `\n` + bytes: `TestGetFavicon_ETag`, `handler/favicon_test.go`
- [ ] Same input same ETag; one byte changed differs; type changed differs: `TestGetFavicon_ETag`, `handler/favicon_test.go`
- [ ] Spy gets the session's user id and the path id: `TestGetFavicon_PassesIDs`, `handler/favicon_test.go`
- [ ] `If-None-Match` equal to own ETag and `Range: bytes=0-0` still give 200 with full body: `TestGetFavicon_IgnoresConditionalHeaders`, `handler/favicon_test.go`
- [ ] Spy not-found gives 404 `not_found` problem+json: `TestGetFavicon_Errors`, `handler/favicon_test.go`
- [ ] Spy unclassified error gives 500 `internal_error`: `TestGetFavicon_Errors`, `handler/favicon_test.go`
- [ ] Spy returns `image/svg+xml`: 500 `internal_error`, body not the image: `TestGetFavicon_Errors`, `handler/favicon_test.go`
- [ ] No cookie: 401, spy not called: `TestGetFavicon_NoCookie`, `handler/favicon_test.go`
- [ ] Malformed id with session: 400 `validation_error`, spy not called: `TestGetFavicon_BadID`, `handler/favicon_test.go`

## Router test (`backend/internal/handler/router_test.go`)
- [ ] Probe replaced with `DELETE /api/v1/account` (session + CSRF) expecting 501, comment updated; other `/favicons/` 501 expectations searched (none found besides this one): `TestRouter_APIRequiresASession`, `handler/router_test.go`

## Repository (integration, `backend/internal/repository/favicon.go`, tests in `favicon_integration_test.go`)
- [ ] `Find` returns type and data byte for byte (non-UTF-8 bytes): `TestFaviconRepository_Find_ReturnsStoredBytes`
- [ ] Another user's id and a random id are `gorm.ErrRecordNotFound`; owner still reads it: `TestFaviconRepository_Find_IsolatedPerUser`
- [ ] After an overwrite from the same host, `Find` on the same id returns the new bytes: `TestFaviconRepository_Find_SeesOverwrittenBytes`
- [ ] `Find` does not change `users.version`: `TestFaviconRepository_Find_DoesNotBumpVersion`

## Wiring
- [ ] `handler/server.go` takes a fourth dependency `favicons`; every `NewServer(` call site updated (`devlogin_test.go`, `router_test.go`, `sync_test.go`, `folders_test.go`, `bookmarks_test.go`) and `cmd/server/main.go` wired

## Repo-wide
- [ ] `make check` passes
- [ ] Nothing outside the allowed paths changed
- [ ] `make test-integration-local` run and result reported

## Judgment calls
(filled in at the end)
