# Task: Proxy shared secret

Backend only. One builder agent on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Prerequisite

`rate-limiting` is merged: `handler/middleware/ratelimit.go` and `clientip.go` exist, `config.Config` has `ClientIPHeader`, and `handler.Deps` has `Limits`. If they are missing, stop and ask.

## Goal

In production the server runs behind a Cloudflare Worker that forwards `/api/*`, `/auth/*` and `/healthz` to Cloud Run, but the Cloud Run address is public. A caller who goes to that address directly skips the Worker, and can send any value in the `CLIENT_IP_HEADER` header to dodge the per-IP login limit. After this task the server answers only requests that carry the Worker's secret: every request, except `GET /healthz`, must have the header `X-Proxy-Secret` with the exact value of the new setting `PROXY_SHARED_SECRET`. Anything else is answered `404 not_found`, before sessions, CSRF, the body limit and rate limiting, so a forged client IP is never used and the service looks like it has no such address.

Requirements covered: none numbered. It supports NFR-16 (the per-IP login limit is only meaningful if the client-IP header comes from the proxy) and the deployment in `STACK.md`. The verifier reports against this file and against `STACK.md`, Deployment, and says that no requirement ID covers it.

Out of scope, with the reason for each:
- The Worker itself, which adds the header (`deploy/`; a separate backlog item, "Later").
- Setting the secret anywhere: Cloud Run's secret store and the Worker secret are the user's deployment steps.
- A second, "previous" secret for rotation without downtime. One secret; rotating it means a short window of `404`s while both sides are updated.
- Making `/healthz` secret-checked: Cloud Run's startup probe cannot send the header.
- Any change to `openapi.yaml`: see "The refused answer".
- `docs/**` and `STACK.md`: the user keeps them current.

## Role and ownership

Role: Backend, see `AGENTS.md`.

You may change `backend/**` except `backend/migration/` and `backend/internal/api/` (generated), and `.env.example` (one commented block, below) and `handler/middleware/doc.go`. You may not change `openapi.yaml`, `oapi-codegen.yaml`, `docs/**` (except your own plan file, `docs/tasks/proxy-secret.plan.md`, see `AGENTS.md`), `STACK.md`, `CONVENTIONS.md`, the frontend, migrations or the Makefile.

Shared files: this task changes `handler/router.go`, `cmd/server/main.go`, `internal/platform/config/config.go` and `config_test.go`, and adds files in `handler/middleware/`. It does not change `handler/problem.go`, `go.mod` or `go.sum`. `login-binding` also changes `handler/router.go` (one line, in the `OperationMiddlewares` map), so the two do not run together: the one that starts second starts after the first has merged. Either may go first. Any other backend task that changes `router.go`, `config.go` or `main.go` is in the same position. Frontend tasks and the Dockerfile task can run alongside.

## Operations used

None. No operation changes, and the contract is not edited. This is a check in front of every route, like the request body limit.

## Behavior

### The check

A global Echo middleware, registered with `e.Use` as the **first** middleware in `NewRouter`, before `echomw.BodyLimit` and before the `deps.Server == nil` early return, so it also guards the operational routes of a router built without a server. (An `e.Use` middleware also wraps the answer for an unknown route, so an unknown path without the header is the same `404`.) Registered only when the setting is non-empty; with an empty secret nothing is added and the router behaves exactly as today.

For each request:
1. If the method is `GET` and `Request.URL.Path` is exactly `/healthz` and `Request.URL.RawPath` is empty (a path written with percent-escapes, such as `/%68ealthz`, is not exempt, because Echo routes on the raw path): pass, whatever header the request carries. Every other method on `/healthz`, `/healthz/`, `/healthz2` and any other path are not exempt.
2. Otherwise read the first value of `X-Proxy-Secret` (`Header.Get`; if the header is repeated, only the first value counts). If the header is absent, empty, or not equal to the setting: refuse.
3. Otherwise pass to the next middleware, with nothing recorded in the context.

Equality is constant time: compare the SHA-256 digests of the two values with `crypto/subtle.ConstantTimeCompare`, so neither the value nor its length is leaked by timing. No trimming and no case folding: the value must match byte for byte (Go has already removed the surrounding spaces of a header value).

### The refused answer

The middleware returns `echo.ErrNotFound`. The existing error handler turns it into the same answer an unknown route gets today: status `404`, content type `application/problem+json`, `type` `/errors/not-found`, `title` "Not found", `status` 404, `code` `not_found`, no `detail`. The refused answer must therefore be byte-for-byte what a request to an unknown path with the correct header gets (a test compares them). No `Retry-After`, no `WWW-Authenticate`, no hint that a secret exists. The contract already has `404 not_found` (`NotFound` response) and a request is refused before it reaches any operation, so no operation gains a status and `openapi.yaml` does not change; say so in the plan file.

The request is not logged, and the header value is never logged, echoed or put in an error. Do not add a log line for refused requests (a flood of them would flood the log).

### The setting

New in `config.Config`: `ProxySharedSecret`, read by `config.Load` from `PROXY_SHARED_SECRET`, default empty. Its value is never logged or returned by any function (`Config` has no `String` method today; do not add one that prints it).

`Config.Validate` gets three checks, placed **before** its OIDC branches (which return early), directly after the `ClientIPHeader` check (so the existing `AUTH_DEV_LOGIN` check still comes first, then `CLIENT_IP_HEADER`, then these), so they run for dev-login-only and for OIDC configurations alike. Each error names the variable and never the value:
1. `Env == "production"` and the secret is empty: `PROXY_SHARED_SECRET must be set when APP_ENV=production`.
2. The secret is non-empty and shorter than 32 bytes (a named constant, `minProxySecretLen`, beside `minStateSecretLen`): `PROXY_SHARED_SECRET must be at least 32 bytes`. This applies in every environment, so a weak value cannot be tested into place.
3. The secret is non-empty and contains any byte outside `0x21` to `0x7E` (visible ASCII: no space, no control character, no non-ASCII): `PROXY_SHARED_SECRET must be visible ASCII with no spaces or line breaks`. Such a value could never be sent in a header, and a trailing newline from a secret store is the likeliest cause. Check the length first, then the characters, so one value gets one error.

The existing tests in `config_test.go` build a production configuration through the `oidcConfig` helper and expect it valid; check 1 would reject them. Give the helper a valid 32-byte secret by default, so those cases keep testing what they test (a case that expects an error must still fail for its own reason, not for the missing secret; the cases that expect `PROXY_SHARED_SECRET` errors set it themselves), and do not weaken or delete any case.

With the setting empty in development (the default) the check is off and local development, the Vite proxy and every existing test run unchanged. A non-empty value is enforced in any environment, so it can be tried locally.

### Wiring

`handler.Deps` gains `ProxySecret string` (empty: no check). `cmd/server/main.go` passes `cfg.ProxySharedSecret`. `.env.example` gets a commented block: the variable (`# PROXY_SHARED_SECRET=`), one sentence that it is the value the Cloudflare Worker sends in `X-Proxy-Secret`, required in production, at least 32 visible ASCII characters (for example `openssl rand -hex 32`), and that it is set in the secret store, never committed.

### Known gaps

- `GET /healthz` answers `200` to anyone who finds the address, so the address's existence is visible. Cloud Run's startup probe cannot send the header.
- One secret: rotating it gives a window in which the Worker and the server disagree and every request is `404` (except `/healthz`).
- The secret is a bearer value: it protects against callers who do not have it, not against anyone who can read the Worker's configuration or the traffic between the Worker and Cloud Run (that traffic is TLS).
- The check proves a request came through something that holds the secret, not through Cloudflare's own network; `CLIENT_IP_HEADER` is still trusted as the Worker sends it.
- A Cloud Run address that is called directly still reaches the process (the body limit and TLS handling happen before and after it); only the app's answer is a `404`.
- Limits are per process; the deployment runs one instance (`STACK.md`, Deployment).
- `docs/requirements.md` and `docs/api.md` do not mention the check; the user updates them.

## Structure

By `ARCHITECTURE.md`:

- `handler/middleware/proxysecret.go`: `ProxySecret(secret string) echo.MiddlewareFunc` (new, exported) and an exported or unexported constant for the header name `X-Proxy-Secret` and for the exempt path `/healthz`. It hashes the configured secret once, when the middleware is built, not per request. A doc comment says what it protects and that it must run first.
- `handler/router.go`: `Deps.ProxySecret`; in `NewRouter`, `if deps.ProxySecret != "" { e.Use(middleware.ProxySecret(deps.ProxySecret)) }` as the first `e.Use`, with a comment that the order matters.
- `internal/platform/config/config.go`: the field, its `Load` line, `minProxySecretLen` and the three `Validate` checks.
- `cmd/server/main.go`: one line in the `Deps` literal.
- `.env.example`: the commented block.
- `handler/middleware/doc.go`: its package comment lists what the package holds; add the proxy secret check.

## Dependencies

None beyond the standard library (`crypto/sha256`, `crypto/subtle`). Do not touch `go.mod` or `go.sum`.

## Acceptance criteria

All unit and router-level tests; none needs a database and none is an integration test (say so in the report).

**Middleware (`handler/middleware/proxysecret_test.go`)**
- The correct value passes (the next handler runs).
- Refused, and the next handler does not run, for: no header, an empty header, a value one byte shorter, a value one byte longer, the correct value with another byte appended, the correct value in lower case when it has upper case letters (use a mixed-case test secret), and two headers where the first is wrong and the second is correct.
- `GET /healthz` passes with no header, with a wrong header and with the correct header; `/healthz/`, `/healthz2` and `/%68ealthz` (set `RawPath`) are refused without the header.
- Any method needs the header: a `POST` and an `OPTIONS` to `/api/v1/bookmarks`, and a `POST` and a `HEAD` to `/healthz`, are refused without it.
- A header name in lower case (`x-proxy-secret`) is accepted (Go canonicalises header names): a test sets it through `Header` map keys the way a client would send it, via `httptest` and a real server request if needed.
- A refusal's error is `echo.ErrNotFound` and its response body contains neither the secret nor the supplied value (middleware level, with the error handler from `handler`'s tests, or checked at router level below).

**Router (a new test file next to `router_test.go`, with `Deps.ProxySecret` set)**
- An authenticated route (for example `GET /api/v1/bookmarks`) with a valid session but no header answers `404` with the problem body of an unknown route, and the handler does not run (use a fake server that fails the test if called); with the correct header it reaches the handler.
- The refused body, status and content type equal those of `GET /no/such/path` sent with the correct header (compare the bytes).
- Order: a request with no header and no session answers `404`, not `401`; with no header and a bad CSRF token on a `POST`, `404`, not `403`; with no header and a `Content-Length` over 64 KiB, `404`, not `413`.
- Rate limiting: with `Deps.Limits` set, 20 requests to `GET /auth/login` without the header answer `404` and take no token: the next request with the header still passes (10 a minute per IP is the limit).
- A forged client IP is never used: build `Limits` with `middleware.NewRateLimits("CF-Connecting-IP", clock)`; 20 requests to `GET /auth/login` without the secret header, each with a different `CF-Connecting-IP` value, answer `404`; then 10 requests with the secret header and one fixed `CF-Connecting-IP` value pass and the 11th answers `429` (the earlier requests spent nothing).
- `GET /healthz` answers `200` with no header, and a `GET /auth/callback` without the header answers `404`.
- The refused body does not contain the secret or the supplied header value.
- `Deps.ProxySecret` empty: nothing is refused (every existing router test relies on this and must pass unchanged).
- A router built with `Server` nil and a secret set still refuses an unknown path without the header and answers `/healthz`.

**Config (`config_test.go`)**
- `PROXY_SHARED_SECRET` is read into `ProxySharedSecret`; empty is valid in development.
- `APP_ENV=production` with it empty is rejected with an error naming `PROXY_SHARED_SECRET`; production with a valid value is accepted (the rest of the configuration valid).
- A 31-byte value is rejected in development and in production; a 32-byte value is accepted; the error names the variable and does not contain the value.
- Values containing a space, a trailing `\n`, a tab and a non-ASCII character (each 32 bytes or more) are rejected, with an error that names the variable and does not contain the value.
- These checks run for a dev-login-only configuration and for an OIDC one (the early return in `Validate` must not skip them).

**Repo-wide**
- `make check` passes.
- Nothing outside the allowed paths changed. `go.mod` and `go.sum` are unchanged.

## Verifier checks

- Diff touches only the allowed paths; `go.mod` and `go.sum` unchanged.
- Read `NewRouter`: the secret middleware is the first `e.Use`, before `BodyLimit`, and before the `Server == nil` return.
- The secret appears in no log call, error, test failure message or response body: `git grep` the field and the header-reading code.
- Compare digests with `subtle.ConstantTimeCompare`; no `==` or `strings.EqualFold` on the secret.
- Break each behavior and see its test fail, then revert: register the middleware after `BodyLimit` (the `413` test), after the session check (the `401` test), drop the `/healthz` exemption, make the exemption a prefix match, use `EqualFold`, return `403` instead of `404`, skip the `Validate` checks in the OIDC branch.
- Run the new tests with `-race` and `-count=5`.
- Inputs to try: a secret of exactly 32 and 31 bytes; a header value of 64 KiB; the header name in lower case (`x-proxy-secret`); `//healthz` and `/healthz?x=1` (the query is not part of the path, so it is exempt) and `/%68ealthz` (not exempt, by the `RawPath` rule above); `HEAD /healthz` and `POST /healthz` (not exempt); a 64 KiB header value (refused, `404`).

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, or an edit to a spec file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.
- Echo does not run an `e.Use` middleware for an unknown route in the version in `go.mod` (the first router test would show it): report this rather than registering the check with `e.Pre`, which runs before routing.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, run `make test-integration-local` (it should be unaffected; report whether it ran and the Postgres version), commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, what the plan file says about the contract, requirement IDs covered (none; say so), dependency versions (none changed), and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
