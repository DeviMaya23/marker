# Plan: get favicon (back end)

Branch: `claude/get-favicon-49x88t`

## Usecase (`backend/internal/usecase/favicon.go`, tests in `favicon_test.go`, fake in `fakes_test.go`)
- [x] The five served types come back with the same type and bytes: `TestFaviconService_Get_ServedTypes` table, `usecase/favicon_test.go`
- [x] `image/vnd.microsoft.icon` comes back as `image/x-icon`, same bytes: same table row
- [x] `image/svg+xml`, `text/html`, `IMAGE/PNG`, empty string give `gorm.ErrRecordNotFound` and no favicon: `TestFaviconService_Get_NotServableIsNotFound`, `usecase/favicon_test.go`
- [x] Store receives the caller's user id and favicon id (two different ids): `TestFaviconService_Get_PassesTheCallersIDs`, `usecase/favicon_test.go`
- [x] A non-not-found store error is not turned into not-found: `TestFaviconService_Get_OnlyNotServableBecomesNotFound`, `usecase/favicon_test.go`

## Handler (`backend/internal/handler/favicon.go`, tests in `favicon_test.go`, spy inline)
- [x] Each of the five types: 200, Content-Type, body, Content-Length, exact Cache-Control, ETag present: `TestGetFavicon_OK`, `handler/favicon_test.go`
- [x] ETag form and equals test-computed SHA-256 of type + `\n` + bytes: `TestGetFavicon_ETag`, `handler/favicon_test.go`
- [x] Same input same ETag; one byte changed differs; type changed differs: `TestGetFavicon_ETag`, `handler/favicon_test.go`
- [x] Spy gets the session's user id and the path id: `TestGetFavicon_PassesSessionUserAndPathID`, `handler/favicon_test.go`
- [x] `If-None-Match` equal to own ETag and `Range: bytes=0-0` still give 200 with full body: `TestGetFavicon_IgnoresConditionalAndRangeHeaders`, `handler/favicon_test.go`
- [x] Spy not-found gives 404 `not_found` problem+json: `TestGetFavicon_Errors`, `handler/favicon_test.go`
- [x] Spy unclassified error gives 500 `internal_error`: `TestGetFavicon_Errors`, `handler/favicon_test.go`
- [x] Spy returns `image/svg+xml`: 500 `internal_error`, body not the image: `TestGetFavicon_Errors`, `handler/favicon_test.go`
- [x] No cookie: 401, spy not called: `TestGetFavicon_NoCookie`, `handler/favicon_test.go`
- [x] Malformed id with session: 400 `validation_error`, spy not called: `TestGetFavicon_MalformedID`, `handler/favicon_test.go`

## Router test (`backend/internal/handler/router_test.go`)
- [x] Probe replaced with `DELETE /api/v1/account` (session + CSRF) expecting 501, comment updated; other `/favicons/` 501 expectations searched (none found besides this one): `TestRouter_APIRequiresASession`, `handler/router_test.go`

## Repository (integration, `backend/internal/repository/favicon.go`, tests in `favicon_integration_test.go`)
- [x] `Find` returns type and data byte for byte (non-UTF-8 bytes): `TestFaviconRepository_Find_ReturnsStoredBytes`
- [x] Another user's id and a random id are `gorm.ErrRecordNotFound`; owner still reads it: `TestFaviconRepository_Find_IsolatedPerUser`
- [x] After an overwrite from the same host, `Find` on the same id returns the new bytes: `TestFaviconRepository_Find_SeesOverwrittenBytes`
- [x] `Find` does not change `users.version`: `TestFaviconRepository_Find_DoesNotChangeUserVersion`

## Wiring
- [x] `handler/server.go` takes a fourth dependency `favicons`; every `NewServer(` call site updated (`devlogin_test.go`, `router_test.go`, `sync_test.go`, `folders_test.go`, `bookmarks_test.go`) and `cmd/server/main.go` wired

## Repo-wide
- [x] `make check` passes
- [x] Nothing outside the allowed paths changed
- [x] `make test-integration-local` run and result reported

## Judgment calls
- The conditional-header test also covers `If-None-Match: *` (named in the verifier's break-it list), not only the response's own ETag.
- The store interface is declared inline in both `NewFaviconService` and the struct field (the task asks for an inline declaration, so there is no named type).
- Not-servable-type logging uses `slog.Warn` with the favicon id from the stored row and the stored type.
- Integration run used PostgreSQL 16 (local path); CI uses 17, not run here.
