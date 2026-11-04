# Task: Rate limiting

Backend only. One builder agent on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Prerequisite

`STACK.md` already adopts `golang.org/x/time/rate` at `golang.org/x/time v0.15.0`, which `backend/go.mod` lists as an indirect requirement. Use that version; do not change it. If `STACK.md` does not say so, stop and ask.

## Goal

The server refuses a client that sends too much, and tells it when to try again (NFR-16):

- Saving a bookmark is limited to **30 per minute per user**.
- The two login routes, `GET /auth/login` and `GET /auth/callback`, are limited to **10 per minute per client IP address**.
- Every other authenticated call has a ceiling of **300 per minute per user**.
- `GET /api/v1/sync/version` (the poll) is exempt from all of it.

A refused request answers `429` with the problem code `rate_limited` and a `Retry-After` header. The front end already reads `Retry-After` on a `429` (`lib/api/request.ts`, `ApiError`), and the features that call `rateLimitMessage` show "Too many requests. Try again in about N seconds."; the others show their own wording (for example the add field's "Too many saves…"). No front-end change is part of this task. The two login routes are plain browser navigations, so a `429` there shows the raw problem JSON in the browser (a known gap, below).

Requirements covered: NFR-16.

Out of scope, with the reason for each:
- The layer in front of the app (a reverse proxy or edge limiting overall volume per IP). `STACK.md` makes it a deployment concern; nothing here replaces it.
- Docs that say login routes are limited at the proxy (`docs/requirements.md` line 133, `docs/api.md` around lines 196 to 203, and its Deferred list of exact numbers). The user decided to put the login limit in the app as well, with the numbers above, and updates those docs; `STACK.md` already says so. Do not edit them, and do not stop for this difference.
- Making the numbers configurable. They are constants in the code (exported, so tests use them). Revisit when the numbers change.
- A limit shared across several server instances. This one is in process: with more than one instance each keeps its own count.
- `GET /healthz` and `GET /auth/dev-login` (development only): not limited.
- Login hardening and the callback failure page (separate backlog items).
- Any change to `openapi.yaml`: it already lists `429 rate_limited` with `Retry-After` on every operation except `getSyncVersion`.

## Role and ownership

Role: Backend, see `AGENTS.md`.

You may change `backend/**` except `backend/migration/` and `backend/internal/api/` (generated), and `.env.example` (one commented line, below). You may not change `openapi.yaml`, `oapi-codegen.yaml`, `docs/**` (except your own plan file, `docs/tasks/rate-limiting.plan.md`, see `AGENTS.md`), `STACK.md`, `CONVENTIONS.md`, the frontend, migrations or the Makefile.

Shared files: this task changes `handler/router.go`, `handler/problem.go`, `cmd/server/main.go`, `internal/platform/config/config.go` and `config_test.go`, `go.mod` and `go.sum`, and adds files in `handler/middleware/`. The frontend tasks do not touch these, so they can run alongside. Do not run it together with `login-binding` (it adds a per-operation middleware in `router.go`) or any other backend task that changes `router.go`, `problem.go` or `go.mod`: start the second one after the first has merged. Either may go first.

## Operations used

No operation changes. The contract lists `429` with `Retry-After` (an integer, minimum 0) and the code `rate_limited` in `ErrorCode`; the generated `api.ErrorCodeRateLimited` exists. Use it; do not write the string.

## Behavior

### The limits

Each limit is a token bucket from `x/time/rate`: the bucket holds N tokens (starts full), a request takes one, and one token comes back every 60/N seconds. A request that finds no token is refused. Mechanism: reserve one token at the current time (`ReserveN`); if the delay (`DelayFrom`) is zero the request passes; otherwise cancel the reservation (`CancelAt`) so nothing is spent, and refuse with that delay.

| Limit | Applies to | Key | N per minute |
|---|---|---|---|
| Saves | `createBookmark` (`POST /api/v1/bookmarks`) | user id | 30 |
| Login | `authLogin` (`GET /auth/login`), `authCallback` (`GET /auth/callback`) | client IP | 10 |
| Ceiling | every authenticated operation except `getSyncVersion`: all of `/api/v1` (favicons included) and `authLogout` (`POST /auth/logout`) | user id | 300 |

Exact boundaries: from a full bucket the first N requests in one instant pass and request N+1 is refused; after 60/N seconds one more passes. A different key has its own bucket (user A being refused never affects user B; one IP never affects another). A refused request takes no token.

A save takes a token from the ceiling first, then from the saves bucket. If the ceiling refuses, the saves bucket is untouched; if the saves bucket refuses, the ceiling token is spent (accepted).

### Order of answers

First match wins. Echo's global body limit stays where it is (`413` for a body whose declared size is over 64 KiB, before the route's middleware, as today; a body that is only found too large while it is read, such as a chunked one, is still refused later, after the limiters). Then, for authenticated operations: `401` (no session), `403` (CSRF), `429` (ceiling, then saves for `createBookmark`), then what already follows (`415`, malformed or unknown fields, `422`, and so on). The limiters are appended **before** the operation-specific middleware (`requireJSON`, `recordBodyKeys`) in `policyRouter.add`, so an over-limit save with a non-JSON body answers `429`, not `415`. So a request that fails authentication or CSRF takes no token, and a forged cross-site request cannot use up a victim's allowance. For the two login routes (no session, no CSRF) the login limit is the first check.

### The refused answer

- Status `429`, content type `application/problem+json`, body from the existing problem builder: `type` `/errors/rate-limited`, `title` "Too many requests", `status` 429, `code` `rate_limited`. No `detail`, and no internal text.
- Header `Retry-After`: whole seconds until a token is back, rounded up, never less than 1. (The contract allows 0; a client told 0 retries at once and is refused again.)
- Where it is rendered: a typed error from the middleware (it carries the delay), which `problemFor` maps in the existing error handler, so every error path stays in one place. The handler sets the header; `problemFor` stays a pure mapping, so give the header-setting a small function `ErrorHandler` calls.

### Who is the caller

- **User:** the user id the Session middleware puts in the request context (`middleware.AuthFrom`). The limiter middleware sits after the Session middleware, so it can always read it; if it cannot, treat that as a programming error and answer `500` (never skip the limit silently).
- **Client IP** (login routes only): a new optional setting `CLIENT_IP_HEADER` in `config.Config` (`ClientIPHeader`), read by `config.Load`.
  - Empty (the default; tests and local development): the IP of the TCP peer, from `Request.RemoteAddr` without the port.
  - Set (production behind Cloudflare would set `CF-Connecting-IP`): the request header with that name, trimmed, parsed as one IP address. A value that is missing, or does not parse as a single IP, falls back to the TCP peer's IP. A comma-separated list is not a single IP, so it falls back; so does an address with a zone (`fe80::1%eth0`), and so does a value longer than 64 bytes. With several headers of that name only the first value (`Header.Get`) is read.
  - Both forms are normalised before use as a key (parsed with `net/netip`, IPv4-mapped IPv6 unmapped, printed in its canonical form), so `1.2.3.4` and `::ffff:1.2.3.4` share one bucket. If `RemoteAddr` itself does not parse, use it as the literal key.
  - `Config.Validate` rejects a non-empty `ClientIPHeader` that is not a header name: letters, digits and hyphens only (stricter than the HTTP token rule on purpose), at least one character. The error names the variable, not its value (as the other checks do). `Validate` returns early inside its OIDC branches, so put this check **before** them, where it runs for dev-login-only and OIDC configurations alike.
  - `cmd/server/main.go` logs one warning at startup when `APP_ENV=production` and `ClientIPHeader` is empty: `CLIENT_IP_HEADER is empty: login limits use the connection address, which behind a proxy is the proxy's address (all users share one bucket)`. It does not stop startup. No test is needed for the log line.
  - `.env.example` gets a commented example line for the variable with a sentence on when to set it.

### Memory

Each key holds one bucket and the time it was last used. On a call, if more than a minute has passed since the last sweep, delete every entry unused for more than 10 minutes (by then its bucket is full again, so dropping it changes no answer). No background goroutine: the sweep runs inside the call, under the same lock. Safe for concurrent use: the whole map and its sweep behind one mutex is fine at this scale.

### Known gaps

- The limits are per process, not shared between instances.
- With `CLIENT_IP_HEADER` empty behind a proxy every user shares one login bucket (10 a minute in total); only the startup warning tells you. A whole office or school behind one address shares a bucket too.
- A `429` on a login route is a browser navigation, so the browser shows the raw problem JSON (the same class of problem as the backlog item about the callback failure page).
- The header named by `CLIENT_IP_HEADER` is trusted as sent. It is only safe when the server is reachable through the proxy alone (for example, the `run.app` address restricted so Cloudflare is the only way in). Otherwise a caller can send any value and escape the login limit. Restricting access is deployment, not this task.
- IPv6 clients are keyed by the full address, so one network with a /64 can use many keys.
- There is no cap on the number of keys between sweeps.
- An unauthenticated flood is not limited by the app (the login limit covers only the login routes); that is the proxy's job.
- `/auth/logout` counts toward the ceiling, not the login limit (`docs/api.md` calls all of `/auth/*` per IP; the logout is session-gated and the user decided as written here).
- Favicon requests count toward the ceiling. Browsers cache them for a long time, so only a first view of a long list spends many tokens.

## Structure

By `ARCHITECTURE.md` (HTTP concerns in `handler/`, cross-cutting rules in `handler/middleware/`):

- `handler/middleware/ratelimit.go`: the limiter type (an unexported `len()` helper reports its number of entries, for the sweep test) (a map of keyed buckets, one rule each: its N per minute, its sweep state, an injectable clock `func() time.Time` defaulting to `time.Now`), its `Allow(key)` returning whether the request may pass and, if not, how long to wait; a typed error `RateLimitedError` carrying the delay (exported, so `problem.go` can map it); and the three Echo middlewares for user-keyed and IP-keyed use. Exported constants for the three numbers.
- `handler/middleware/clientip.go`: the client-IP function described above, taking the header name.
- `handler/router.go`: `Deps` gains an optional `Limits *middleware.RateLimits` (the three limiters and the IP function). `nil` means no limiting, so every existing router test keeps passing without a change. `policyRouter.add` appends, after the CSRF middleware: the ceiling for authenticated routes except `GET /sync/version`; the saves limiter for `POST /bookmarks`; and the login limiter, as the only middleware, for the two public login routes. `NewRateLimits(clientIPHeader string, now func() time.Time)` builds the set; `nil` for `now` means the real clock (production passes `nil`), and router tests pass a fake clock that stands still, so a refill never changes a count mid-test.
- `handler/problem.go`: map `RateLimitedError` to the `429` problem and set `Retry-After`. `domainProblems` matches fixed sentinels with `errors.Is`, so `RateLimitedError` (it carries a delay) gets its own `errors.As` branch beside the table, in the existing `problemFor` and `ErrorHandler`; do not add a second error handler.
- `cmd/server/main.go`: build the limits from `cfg.ClientIPHeader` and pass them in `Deps`.
- `internal/platform/config`: `ClientIPHeader`, its `Load` line and its `Validate` check.
- `go.mod`: `golang.org/x/time` moves from indirect to direct (run `go mod tidy`); the version must stay `v0.15.0` and `go.sum` must not gain a new version of it. If `tidy` changes anything else, undo those other changes, keep only the `x/time` line, and say so in the report.

## Dependencies

`golang.org/x/time` at `v0.15.0`, already in `STACK.md` and already resolved in `go.mod`. Nothing else. Only the rate-limit middleware imports it. Only this task changes `go.mod` and `go.sum`.

## Acceptance criteria

All unit and router-level tests, with a fake clock; none needs a database. None is an integration test; say so in the report.

**Limiter (`middleware/ratelimit_test.go`)**
- From a full bucket, N requests pass at one instant and N+1 is refused; for each of the three N values (30, 10, 300).
- After 60/N seconds plus 1 ms on the fake clock one more passes, and after 60/N seconds minus 1 ms it does not (floating-point token counts make an exact-instant test fragile).
- Two keys have separate buckets.
- A refused call takes no token (refuse, advance by 60/N, one passes, the next is refused).
- `Retry-After` for a refusal is the ceiling of the wait in seconds, and at least 1 (a wait of 0.2 seconds gives 1; 1.5 gives 2).
- Sweep (checked through the entry count): an entry unused for more than 10 minutes is gone after the next call that runs a sweep, and an entry used 9 minutes ago is kept; two calls less than a minute apart on the fake clock run at most one sweep (an old entry still present after the second). Concurrent calls from many goroutines on one key, run with `-race`, pass exactly N of N+k.

**Client IP (`middleware/clientip_test.go`)**
- Empty header setting: the peer's IP (IPv4 with port, IPv6 `[::1]:1234`), ignoring any `X-Forwarded-For` or `CF-Connecting-IP` header the request carries.
- Set to `CF-Connecting-IP`: a valid value is used (also with surrounding spaces); a missing header, `not-an-ip`, an empty value and `1.2.3.4, 5.6.7.8` fall back to the peer.
- `::ffff:1.2.3.4` and `1.2.3.4` give the same key; an unparsable `RemoteAddr` is used as is. A zoned address, a 65-byte value and two headers of that name (first value used) behave as written above.

**Router (a new test file next to `router_test.go`)**
Requests made with `httptest` all come from `192.0.2.1:1234`; tests that need two IPs set `req.RemoteAddr` by hand. The callback needs both query parameters `code` and `state` (the generated wrapper answers `400` without them), so every callback request in the tests carries them.
The existing `stubAuth` gives every request a new random user, so it cannot trigger a per-user limit; leave it alone and add a new test authenticator that maps a session token to a fixed user id (two tokens, two users). The existing test server is built with nil services, which panic when a handler runs; the new tests build their router with a small fake server instead: a struct that embeds `api.StrictServerInterface` (left nil) and implements only the operations the tests call (`CreateBookmark`, `ListBookmarks`, `GetSyncVersion`, `AuthLogin`, `AuthCallback`, `AuthLogout`), each returning that operation's plain success response. "Passes" below means the answer is that success response, not `429`, `401` or `403`.
- The 31st `POST /api/v1/bookmarks` from one user (with session and CSRF) answers `429` with content type `application/problem+json`, `code` `rate_limited`, `status` 429 and a `Retry-After` header that is an integer of at least 1; the 30th passes.
- The 11th `GET /auth/login` from one IP answers `429` (same checks); the 11th `GET /auth/callback` too, sharing the same bucket as `/auth/login` (nine logins and two callbacks refuse the last).
- 301 mixed authenticated calls (for example `GET /api/v1/bookmarks`) from one user: the 301st is `429`. A save counts toward that ceiling too (299 reads plus the 300th, a save, pass; the next read is refused).
- A refused save does not stop the same user's other calls until the ceiling is spent, and user B is never affected by user A.
- `GET /api/v1/sync/version` still passes after 1,000 calls from one user, and does not use up that user's ceiling (the ceiling still allows 300 other calls afterwards).
- Order: a request with no session answers `401` and takes no token; one with a bad CSRF token answers `403` and takes no token (check by sending N+1 of them and then one good request that passes).
- An over-limit save sent with a non-JSON `Content-Type` answers `429`, not `415`.
- With `Deps.Limits` nil no request is refused, however many are sent (the existing tests rely on it).
- `POST /auth/logout` counts toward the ceiling and not the login bucket: after 10 logins refuse, a logout still passes.

- User A spending the whole ceiling does not stop user B's `POST /auth/logout`, and A's own next logout is `429` (the user-keyed limiter runs after the Session middleware on that route).
- A user-keyed limiter reached with no authenticated user in the context answers `500` and does not let the request through (a middleware-level test with no Session in front).

**Problem mapping (`handler/problem_test.go`)**
- `RateLimitedError` maps to `429` with `api.ErrorCodeRateLimited`, and the response carries `Retry-After`.

**Config (`config_test.go`)**
- `CLIENT_IP_HEADER` is read into `ClientIPHeader`; empty is valid; `CF-Connecting-IP` is valid; `bad header` (a space) and `a:b` are rejected with an error that names `CLIENT_IP_HEADER` and does not contain the value. The rejection happens for a dev-login-only configuration and for an OIDC one.

**Repo-wide**
- `make check` passes.
- Nothing outside the allowed paths changed. `go.mod` has `golang.org/x/time v0.15.0` as a direct requirement and no other version change.

## Verifier checks

- Diff touches only the allowed paths (including `.env.example`, which the Role section allows); `go.mod`/`go.sum` show only `x/time` moving to direct, same version.
- `git grep "x/time"`: imported only in `handler/middleware/ratelimit.go` (and its test, if it uses it).
- Read `policyRouter.add`: the limiters are appended after Session and CSRF, never before; `getSyncVersion` has none; the two login routes have the login limiter and no Session or CSRF.
- Break each behavior and see its test fail, then revert: move the ceiling before the session check (a `401` flood spends tokens); drop the sync exemption; return `Retry-After: 0`; key the login limit by user instead of IP; stop normalising IPv4-mapped addresses; drop the sweep.
- Run the new tests with `-race` and `-count=20`.
- Inputs to try: header values `1.2.3.4:80`, ` ::1 `, `1.2.3.4,5.6.7.8`, a very long value (65,536 bytes), two `CF-Connecting-IP` headers; `RemoteAddr` of `@` (a unix socket); a user id that appears in two requests at the same instant from different goroutines; fake-clock jumps backward.
- Confirm the new tests use the injected clock and call `time.Sleep` nowhere.
- Confirm the refused answer leaks nothing: no `detail`, no key, no IP in the body.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency beyond `x/time v0.15.0`, a migration, or an edit to a spec file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.
- `x/time v0.15.0` does not compile with the `go` directive in `go.mod`.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, run `make test-integration-local` (it should be unaffected; report whether it ran and the Postgres version), commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
