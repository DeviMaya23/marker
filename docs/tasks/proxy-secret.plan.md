# Plan: proxy shared secret

Branch: `claude/proxy-secret-e3yiag`. Paths are under `backend/internal/` unless noted. No requirement ID covers this task (supports NFR-16 and `STACK.md` Deployment).
Contract: no operation changes and no operation gains a status; the refused answer is the existing `404 not_found` (`NotFound` response), produced before any operation runs. `openapi.yaml` is not edited.
All tests are unit and router-level tests; none needs a database and none is an integration test.

## Acceptance criteria

### Middleware (`handler/middleware/proxysecret.go`, test `handler/middleware/proxysecret_test.go`)
- [ ] Correct value passes
- [ ] Refused, next handler not run: no header, empty, one byte shorter, one byte longer, correct + appended byte, lower-cased mixed-case secret, two headers (first wrong)
- [ ] `GET /healthz` passes with no, wrong, correct header; `/healthz/`, `/healthz2`, `/%68ealthz` (RawPath) refused
- [ ] POST and OPTIONS to `/api/v1/bookmarks`, POST and HEAD to `/healthz` refused
- [ ] Lower-case header name `x-proxy-secret` accepted
- [ ] Refusal error is `echo.ErrNotFound`; body contains neither secret nor supplied value

### Router (`handler/proxysecret_router_test.go`, next to `router_test.go`)
- [ ] Valid session, no header: 404 problem, handler not run; correct header reaches handler
- [ ] Refused response bytes equal `GET /no/such/path` with the header
- [ ] Order: 404 not 401; 404 not 403 (bad CSRF); 404 not 413
- [ ] Rate limiting: 20 no-header `GET /auth/login` are 404 and take no token
- [ ] Forged client IP never used (`CF-Connecting-IP`): 20 forged 404, then 10 pass, 11th 429
- [ ] `GET /healthz` 200 without header; `GET /auth/callback` without header 404
- [ ] Refused body has neither secret nor supplied value
- [ ] `Deps.ProxySecret` empty: nothing refused (existing router tests pass unchanged)
- [ ] `Server` nil with secret: unknown path refused, `/healthz` answers

### Config (`platform/config/config.go`, test `config_test.go`)
- [ ] `PROXY_SHARED_SECRET` read into `ProxySharedSecret`; empty valid in development
- [ ] Production with it empty rejected, naming the variable; production with valid value accepted
- [ ] 31 bytes rejected (dev and production); 32 accepted; error names variable, not value
- [ ] Space, trailing `\n`, tab, non-ASCII (each >= 32 bytes) rejected; error names variable, not value
- [ ] Checks run for dev-login-only and OIDC configurations

### Wiring and docs
- [ ] `handler/router.go` `Deps.ProxySecret`, first `e.Use`; `cmd/server/main.go` passes it; `.env.example` block; `handler/middleware/doc.go` updated

### Repo-wide
- [ ] `make check` passes: not run yet
- [ ] Only allowed paths changed; `go.mod` and `go.sum` unchanged
- [ ] `make test-integration-local`: not run yet

## Judgment calls

(filled in at the end)
