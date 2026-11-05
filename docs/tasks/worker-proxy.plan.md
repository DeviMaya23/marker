# Plan: worker-proxy

Branch: `claude/worker-proxy-task-hewbu9`. Prerequisite checked: `backend/internal/handler/middleware/proxysecret.go` and `clientip.go` exist.
Tests: `node --test deploy/` (tests in `deploy/worker.test.mjs`, source `deploy/worker.mjs`).

## Acceptance criteria

### Forwarding
- [x] GET `/api/v1/bookmarks?q=a%20b` forwarded with path and query unchanged, method GET — `deploy/worker.mjs`, test "forwards path and query"
- [x] POST with JSON body: method, body text and Content-Type unchanged — `worker.test.mjs`, test "forwards POST body"
- [x] `/auth/login?return_to=%2Ftrash`, `POST /auth/logout`, `GET /healthz` (also with query) forwarded — test "forwards auth and healthz"
- [x] `redirect` is `manual` — test "redirect is manual"

### Headers
- [x] Client `X-Proxy-Secret: evil` replaced by one secret value — test "replaces client X-Proxy-Secret"
- [x] No `CF-Connecting-IP` + client `X-Client-IP` → no `X-Client-IP` — test "drops client X-Client-IP without CF-Connecting-IP"
- [x] `CF-Connecting-IP` set + client `X-Client-IP` → only the CF value — test "sets X-Client-IP from CF-Connecting-IP"
- [x] Origin, Cookie, Content-Type, X-CSRF-Token, User-Agent unchanged — test "passes other headers unchanged"

### Answers
- [x] Upstream 302 with Location and two Set-Cookie returned intact — test "302 keeps Location and cookies"
- [x] 200 JSON, 204, 404 problem, 429 Retry-After unchanged — test "upstream answers unchanged"
- [x] Returned response is `===` the stub's — test "returns upstream object"
- [x] fetch rejects → 502 `Bad gateway`, exact content type — test "502 on upstream failure"

### Not forwarded
- [x] The listed paths answer 404 `Not found`, fetch never called — test "not forwarded paths"
- [x] `/api//x` forwarded to `https://run.example/api//x` — test "double slash concatenation"

### Configuration
- [x] Bad/missing `CLOUD_RUN_ORIGIN` or secret → 503 `Proxy is not configured`, no fetch; also for `/` — test "misconfigured gives 503"
- [x] Trailing slash and port origins work — test "valid origin forms"
- [x] Secret absent from 404/502/503 answers — test "secret not leaked"

### `_redirects`
- [x] `frontend/public/_redirects` with the one rule; `frontend/dist/_redirects` exists after the build with the same rule — checked, present

### Repo-wide
- [x] `node --test "deploy/*.test.mjs"` passes: 21 of 21, Node v22.23.4 (plain `node --test deploy/` fails on Node 22, see judgment calls)
- [x] `make check` passes (openapi-lint, the last target, ran after lint, test and build)
- [x] Only allowed files changed; `frontend/package.json` and lockfile unchanged
- [x] `deploy/README.md` written per the task's eight steps
- [x] `make test-integration-local`: not run: no `backend/` change (task file says it does not apply)

## Judgment calls
- Node 22.23.4 treats the argument `deploy/` as a module path (`MODULE_NOT_FOUND`); the other 26 failures came from a bare `node --test` picking up unrelated test files. I used `node --test "deploy/*.test.mjs"`, and the README says so. The task's `node --test deploy/` form does not work on this Node.
- `make check` was run through a pipe, so I judged success from its last target (openapi-lint) having run; make stops at the first failing target.
- The task says the middleware is at `handler/middleware/`; it is at `backend/internal/handler/middleware/`. The prerequisite is present.
- Added tests beyond the list: two `X-Proxy-Secret` values, empty `CF-Connecting-IP`, `/api/` forwarded, `HEAD` forwarded (all from the verifier inputs).
- `_redirects` has two comment lines (the task asked for a comment line that says why).
- The `_redirects` comment says "(/trash, /login, ...)" only as examples.
- Nothing was run on Cloudflare or Pages.
