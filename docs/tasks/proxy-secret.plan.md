# Plan: proxy shared secret

Branch: `claude/proxy-secret-e3yiag`. Paths are under `backend/internal/` unless noted. No requirement ID covers this task (supports NFR-16 and `STACK.md` Deployment).
Contract: no operation changes and no operation gains a status; the refused answer is the existing `404 not_found` (`NotFound` response), produced before any operation runs. `openapi.yaml` is not edited.
All tests are unit and router-level tests; none needs a database and none is an integration test.

## Acceptance criteria

### Middleware (`handler/middleware/proxysecret.go`, test `handler/middleware/proxysecret_test.go`)
- [x] Correct value passes
- [x] Refused, next handler not run: no header, empty, one byte shorter, one byte longer, correct + appended byte, lower-cased mixed-case secret, two headers (first wrong)
- [x] `GET /healthz` passes with no, wrong, correct header; `/healthz/`, `/healthz2`, `/%68ealthz` (RawPath) refused
- [x] POST and OPTIONS to `/api/v1/bookmarks`, POST and HEAD to `/healthz` refused
- [x] Lower-case header name `x-proxy-secret` accepted
- [x] Refusal error is `echo.ErrNotFound`; body contains neither secret nor supplied value

### Router (`handler/proxysecret_router_test.go`, next to `router_test.go`)
- [x] Valid session, no header: 404 problem, handler not run; correct header reaches handler
- [x] Refused response bytes equal `GET /no/such/path` with the header
- [x] Order: 404 not 401; 404 not 403 (bad CSRF); 404 not 413
- [x] Rate limiting: 20 no-header `GET /auth/login` are 404 and take no token
- [x] Forged client IP never used (`CF-Connecting-IP`): 20 forged 404, then 10 pass, 11th 429
- [x] `GET /healthz` 200 without header; `GET /auth/callback` without header 404
- [x] Refused body has neither secret nor supplied value
- [x] `Deps.ProxySecret` empty: nothing refused (existing router tests pass unchanged)
- [x] `Server` nil with secret: unknown path refused, `/healthz` answers

### Config (`platform/config/config.go`, test `config_test.go`)
- [x] `PROXY_SHARED_SECRET` read into `ProxySharedSecret`; empty valid in development
- [x] Production with it empty rejected, naming the variable; production with valid value accepted
- [x] 31 bytes rejected (dev and production); 32 accepted; error names variable, not value
- [x] Space, trailing `\n`, tab, non-ASCII (each >= 32 bytes) rejected; error names variable, not value
- [x] Checks run for dev-login-only and OIDC configurations

### Wiring and docs
- [x] `handler/router.go` `Deps.ProxySecret`, first `e.Use`; `cmd/server/main.go` passes it; `.env.example` block; `handler/middleware/doc.go` updated

### Repo-wide
- [x] `make check` passes: run, passed (second run; the first run failed once on the unrelated frontend test `EmptyTrash.test.tsx` "focuses the field on open", which passed on rerun with no change)
- [x] Only allowed paths changed; `go.mod` and `go.sum` unchanged
- [x] `make test-integration-local`: run, passed (PostgreSQL 16)

## Judgment calls

- The Worker-sent header is read with `Header.Get`, so a repeated header counts only by its first value, as the task says.
- `ProxySecretHeader` is exported (used by the router tests); the exempt path constant `healthPath` is unexported.
- The `/healthz?x=1` and `//healthz` cases are in the middleware test: the query is exempt, `//healthz` is not (path differs).
- `Config.Validate` runs the `PROXY_SHARED_SECRET` checks for every `Env`; a non-"production" unrecognised Env with an empty secret stays valid.
- The router "forged IP" test builds its 20 distinct IPs in a loop with a simple two-digit suffix.
- `npm ci` was needed in `frontend/` before `make check` could run, per AGENTS.md.
