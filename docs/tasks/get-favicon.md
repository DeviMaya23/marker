# Task: get favicon (back end)

> One backend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> **Prerequisite:** none beyond the current `main` (`sync-version` is merged, so `NewServer` already takes `bookmarks, folders, sync`). The contract needs no change: `getFavicon` exists in `openapi.yaml` with its `200`, `401`, `404` and `429`. If something here contradicts `openapi.yaml`, stop and ask; do not edit it.

## Goal

A signed-in user's browser can load the icon of one of their own bookmarks from the `favicon_url` that the bookmark responses already carry (`/api/v1/favicons/{id}`). Today that URL answers `501`, so every icon falls back to a lettered tile. The front end already draws the icon from `favicon_url` and falls back to the tile when it is `null` or fails to load (`frontend/src/components/ui/Favicon.tsx`), so once this merges icons appear with no front-end change.

Requirements covered: FR-5 (server half: the favicon the page fetch stored can be read back), NFR-7 (a user can read only their own icons).

Out of scope, and why:

- Any front-end change: the `Favicon` component and its fallback already exist. The only change visible in the UI is that the images now load.
- `304 Not Modified` and any conditional-request handling: the contract lists no `304`. The response always carries the bytes (see "Known gaps").
- Changing how icons are stored or overwritten: `RecordFetchSuccess` already upserts on `(user_id, host)`. A line about it is in the backlog.
- Rate limiting (`429`, NFR-16): not built at all yet; the limiter task will cover this route.
- Fetching, resizing, converting or validating icon bytes: the page fetch (`adaptor/pagefetcher.go`) already skips empty icons and ones over `domain.MaxFaviconBytes` (32 KB), and `safehttp.FaviconLimits` holds the content-type allowlist. The table itself has no check constraint, and this task adds none.
- `X-Content-Type-Options: nosniff`: the generated response cannot carry a header the contract does not declare (see "Known gaps").
- Any change to the contract, the migrations or `docs/**`.

## Role and ownership

Role: Backend (see `AGENTS.md`).

You may change `backend/**` except `backend/migration/` and `backend/internal/api/` (generated). You may not change `openapi.yaml`, `oapi-codegen.yaml`, `docs/**` (except your own plan file, `docs/tasks/get-favicon.plan.md`, see `AGENTS.md`), `CONVENTIONS.md`, the frontend, migrations or the Makefile. You need no migration: the `favicons` table and `bookmarks.favicon_id` exist. If you think you need one, stop and ask.

**Shared files.** No other backend task runs now. A front-end task (`top-bar-search`) and a front-end test fix may run at the same time; they touch only `frontend/**`. You change `handler/server.go` (a fourth dependency on `NewServer`), `cmd/server/main.go` (wire it), and every place that calls `NewServer(`: `handler/devlogin_test.go`, `handler/router_test.go`, `handler/sync_test.go`, `handler/folders_test.go`, `handler/bookmarks_test.go` (pass `nil` for the new argument; it is the last one). You also change `usecase/fakes_test.go` (a new fake) and `handler/router_test.go` (one probe, see "Acceptance criteria"). You do not need to change `problem.go`, `router.go`, `domain/errors.go` or any migration; both failures reuse existing errors (`domain.ErrUnauthenticated`, `gorm.ErrRecordNotFound`). If you find you must, stop and ask.

## Operations used

- `getFavicon` (`GET /api/v1/favicons/{id}`), a 501 stub today. Path parameter `id` (uuid). Response `200` with the image bytes in one of five media types, generated as `api.GetFavicon200ImagepngResponse`, `...ImagejpegResponse`, `...ImagegifResponse`, `...ImagewebpResponse` and `...ImagexIconResponse`. Each has `Body io.Reader`, `ContentLength int64` and `Headers api.GetFavicon200ResponseHeaders` (`CacheControl *string`, `ETag *string`). Only `handler/` imports `internal/api`.

Authentication is applied by the router (a missing, unknown or expired session is `401 unauthenticated` before the handler runs). It is a `GET`, so there is no CSRF check and no request body.

## What is already true

Do not add or change any of this.

- `domain.Favicon` (`ID`, `UserID`, `Host`, `ContentType`, `Data`) maps the `favicons` table, which has a `UNIQUE (user_id, host)` constraint and cascades on delete from `users`.
- The page fetch stores `ContentType` as the lower-case media type without parameters, from this allowlist (`safehttp.FaviconLimits`): `image/png`, `image/x-icon`, `image/vnd.microsoft.icon`, `image/jpeg`, `image/gif`, `image/webp`.
- `RecordFetchSuccess` inserts with `ON CONFLICT (user_id, host) DO UPDATE SET content_type, data`, so **the bytes behind one id can change** when another bookmark from the same host is fetched. The contract says the content behind an id "never changes"; that is not strictly true. This task follows the contract anyway: a one-year `max-age` ("a long max-age"), plus an ETag that changes with the content. Do not change the upsert.
- `bookmarks` responses carry `favicon_url` as `/api/v1/favicons/<favicon_id>` or `null` (`handler.faviconURL`).

## Behavior

### getFavicon

1. The caller is the user from the session (`middleware.AuthFrom`). No `Auth` in the context: `domain.ErrUnauthenticated`, as every other handler does.
2. Read the favicon whose `id` is the path id **and** whose `user_id` is the caller's. One primary-key read: no join, no write, no lock, and it must not change `users.version`. No bookmark row is consulted: any favicon the caller owns is served, including one that no bookmark points to any more and one that only a trashed bookmark points to.
3. Decide the media type to serve from the stored `content_type`, exact match (no lower-casing, no trimming):

   | Stored | Served as |
   |---|---|
   | `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/x-icon` | the same |
   | `image/vnd.microsoft.icon` | `image/x-icon` (the contract lists only the latter; it is the same format) |
   | anything else, including the empty string | not servable: treat as not found |

   A not-servable type is logged with `slog.Warn` (the id and the stored type; no bytes), as `usecase/bookmark.go` does for its warnings, and answers `404 not_found`. Never serve a type the contract does not list.
4. Respond `200` with:
   - `Content-Type`: the served media type;
   - `Content-Length`: the number of bytes (set from `ContentLength`; a stored icon is never empty, because the page fetch skips empty ones);
   - `Cache-Control`: exactly `private, max-age=31536000` (one year; no `immutable`, which the contract does not mention);
   - `ETag`: a strong validator in quotes, `"` + the lower-case hex SHA-256 of the **served** media type, one `\n`, and the bytes + `"` (64 hex digits between the quotes). The same type and bytes always give the same ETag; a change in either gives a different one. It does not depend on the id, the user or the time.
   - the body: the stored bytes, unchanged.
5. Request headers other than the session cookie are ignored. In particular `If-None-Match`, `If-Modified-Since` and `Range` do not change the answer: it is always the `200` above.

### Failures

| Situation | Status | Code |
|---|---|---|
| No cookie, unknown or expired session | `401` | `unauthenticated` (router, before the handler) |
| The id is not a uuid | `400` | `validation_error` (the generated binding, as for every id route; the contract lists no `400` here, and this task does not change that) |
| No favicon with that id | `404` | `not_found` |
| The favicon belongs to another user | `404` | `not_found`, the same answer as for an unknown id (NFR-7: nothing tells the two apart) |
| The stored type is not servable (step 3) | `404` | `not_found` |
| Any other error from the database | `500` | `internal_error` (the existing generic mapping) |

Order: session (`401`), then the id binding (`400`), then the lookup (`404`, `500`).

### Known gaps

- The bytes behind an id can change (see "What is already true"). A browser that cached the old icon shows it for up to one year, because the URL does not change; only a hard reload or clearing the cache refreshes it. This is accepted: the damage is one outdated icon, cosmetic only. Fixing the overwrite (so the contract's "never changes" becomes true) is a separate backlog item.
- The `ETag` is sent but never compared: no `304`, because the contract lists none. After the `max-age` the browser downloads the (at most 32 KB) icon again.
- No `X-Content-Type-Options: nosniff`: the contract declares only `Cache-Control` and `ETag`, and the generated response writes only those. SVG is excluded from the stored types, so a sniffed script is not expected.
- A type is compared exactly. A stored value with an upper-case letter or a parameter would answer `404`; the page fetch never stores one.

## Structure

Follow `ARCHITECTURE.md` and the file-placement and test-file rules in `TESTING.md`.

- `repository/favicon.go` (new): `FaviconRepository`, `NewFaviconRepository(db)`, and `Find(ctx, userID, id uuid.UUID) (domain.Favicon, error)`. It selects the row with `id = ? AND user_id = ?`. A missing row is `gorm.ErrRecordNotFound`. Another user's id is the same error.
- `usecase/favicon.go` (new): `FaviconService` with `NewFaviconService(store)` and `Get(ctx, userID, id uuid.UUID) (domain.Favicon, error)`. Its store interface has one method and is used only here, so declare it inline in `favicon.go` (`ARCHITECTURE.md`). `Get` calls the store, applies the type table of step 3 (returning the favicon with `ContentType` set to the served type), and returns `gorm.ErrRecordNotFound` for a not-servable type after logging it. Every store error passes through unchanged. The five served types and the one alias live here, as unexported package-level values.
- `handler/favicon.go` (new): a `FaviconService` interface (`Get(ctx, userID, id uuid.UUID) (domain.Favicon, error)`), satisfied by `usecase.FaviconService`, and the method `(*Server).GetFavicon`, which shadows the stub. It picks the generated response type from the returned `ContentType`, builds the headers and the ETag, and wraps the bytes in a `bytes.Reader`. For a `ContentType` it has no response type for (which the usecase must never return) it returns an error that is not a domain error, so the client gets `500 internal_error`. The handler does not log it; `ErrorHandler` already logs every 5xx.
- `handler/server.go`: `Server` gets a `favicons FaviconService` field and `NewServer(bookmarks, folders, sync, favicons)` takes it last. Keep the `GetFavicon` stub in `stubs.go`: the other implemented operations keep theirs, and the method on `Server` shadows it.
- `cmd/server/main.go`: build `usecase.NewFaviconService(repository.NewFaviconRepository(db))` and pass it to `NewServer`. Do not open a second database connection.

## Dependencies

None. Use only what is in `go.mod` (`crypto/sha256` and `encoding/hex` are standard library).

## Acceptance criteria

Unit tests need no database. Integration tests carry the `integration` build tag; run them with `make test-integration-local` if the session can start a database (see `TESTING.md`) and say in the report which ran and which did not.

**Usecase (unit, a value-return fake store in `fakes_test.go`)**
- Each of `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/x-icon` comes back with the same type and the same bytes.
- `image/vnd.microsoft.icon` comes back as `image/x-icon`, with the same bytes.
- `image/svg+xml`, `text/html`, `IMAGE/PNG` and the empty string each give `gorm.ErrRecordNotFound` (`require.ErrorIs`), and no favicon.
- The store receives the user id and the favicon id that the caller passed (one assertion on the fake's recorded arguments, with two different ids so a swap shows).
- A store error other than not-found comes back as that same error and is not turned into not-found. It tests the mapping's boundary (only a not-servable type becomes not-found), not a bare pass-through.

**Handler (unit, usecase spy)**
- For each of the five served types: `200`; `Content-Type` equal to the type; the body equal to the spy's bytes; `Content-Length` equal to their count; `Cache-Control` exactly `private, max-age=31536000`; `ETag` present.
- The `ETag` has the form `"` + 64 lower-case hex digits + `"`, and equals the one computed in the test from the rule in step 4 (compute it in the test from the type and bytes, with `crypto/sha256`; do not copy the handler's helper).
- Two responses with the same type and bytes have the same `ETag`; changing one byte gives a different one; changing the type but not the bytes gives a different one.
- The user id the spy receives is the one in the session (use a session for a known user id), and the id is the one in the path.
- A request with `If-None-Match` set to the response's own ETag, and one with `Range: bytes=0-0`, still answer `200` with the whole body.
- The spy returning `gorm.ErrRecordNotFound` answers `404` `application/problem+json` with `code: not_found`.
- The spy returning an unclassified error answers `500` with `code: internal_error`.
- The spy returning a type with no response (`image/svg+xml`) answers `500` with `code: internal_error`, and the body is not the image.
- Through the router with no cookie: `401 unauthenticated`, and the spy is not called.
- A malformed id (`/api/v1/favicons/not-a-uuid`) with a session: `400 validation_error`, and the spy is not called.
- Build the router and the session the way `handler/sync_test.go` does (reuse `authFor` and `callerID`, defined in `handler/bookmarks_test.go`); do not add a second helper for the same thing.

**Router test.** `TestRouter_APIRequiresASession` in `handler/router_test.go` (the subtest "valid session reaches the handler", around line 96) probes `GET /api/v1/favicons/<uuid>` and expects `501` to show that a valid session reaches the handler. That route is now real. Replace the probe with `DELETE /api/v1/account` sent with `withSession(goodSession)` and `withCSRF()`, expecting `501 not_implemented`, and update the comment above it to say account deletion is the stub it relies on. `TestRouter_WritesNeedCSRFProtection` keeps its rows. Search the tests for any other expectation that `/favicons/` answers `501` and replace it the same way. If `deleteAccount` is no longer a stub when you build this, pick any stub still in `stubs.go`; if there is none, stop and ask.

**Repository (integration, in a new `repository/favicon_integration_test.go`; of this project's packages it imports only `domain`, `repository` and `testutil`, never `usecase` or `handler`)**

Create users with the `newUser` helper and pending bookmarks with `newBookmark` (both in `schema_integration_test.go`), and store icons through `BookmarkRepository.RecordFetchSuccess`, as the `RecordFetchSuccess` tests in `bookmark_integration_test.go` do. Read the favicon id from the bookmark's `FaviconID` after the fetch. Construct no service.

- `Find` returns the stored `ContentType` and `Data` byte for byte (use bytes that are not valid UTF-8, for example `0x00 0xFF 0x89`).
- Another user's favicon id is `gorm.ErrRecordNotFound` (NFR-7), and the owner can still read it afterwards. A random id is `gorm.ErrRecordNotFound`.
- After a second fetch from the same host stores different bytes (`ON CONFLICT` overwrite), `Find` on the same id returns the new bytes. This pins the "bytes can change" fact the task relies on.
- `Find` does not change `users.version`: read the user's version before and after with the existing `userVersion` helper (`bookmark_integration_test.go`) or `UserRepository.Version`.

**Repo-wide**
- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt:

- `Find` filters by both `id` and `user_id`. There is no `FOR UPDATE`, no write and no second query in the read path, and no call to `bumpUserVersion`.
- The usecase is the only place that decides which stored types are servable and that maps the `vnd.microsoft.icon` alias. The handler only switches on the five already-normalized types to pick a generated response, and fails with a `500` on anything else; it never maps or rejects a type itself with a `404`.
- Another user's id and an unknown id cannot be told apart: the repository returns the same `gorm.ErrRecordNotFound` for both (its integration test proves it), and no code in the usecase or handler looks at whether the row exists under another user. Confirm by reading that no branch, message or log line distinguishes them in the response.
- `handler/` is the only package that imports `internal/api`. No new dependency; `go.mod`, `go.sum`, `openapi.yaml`, `oapi-codegen.yaml`, `api.gen.go` and migrations are untouched. `RecordFetchSuccess` is untouched.
- Every `NewServer(` call site compiles with the new argument; none passes a value that hides a nil dereference on the favicon path in a test that uses it.
- To confirm the tests discriminate (break the behavior, see them fail, revert): drop the `user_id` condition from `Find` and check the isolation test fails; delete the `image/vnd.microsoft.icon` mapping and check the usecase test fails; change the `Cache-Control` string or leave the type out of the ETag and check the handler tests fail; make the handler answer `304` on a matching `If-None-Match` and check the handler test fails; replace the probe in `router_test.go` with the old favicon route and check it fails. Revert each.
- Try to break it with: another user's id; a uuid that was never stored; a favicon whose row was changed straight in the database to `image/svg+xml`; `If-None-Match: *`; two bookmarks from one host with different icons fetched in turn.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement or this file conflict with each other.
- You think you need a migration, a dependency, a change to the contract, to the generated code or its config, or a new `pkg/` package.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.
- The generated response types or their field names differ from "Operations used" above.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), which integration tests ran and which did not (and the Postgres version if they ran), and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
