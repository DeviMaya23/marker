# Plan: worker-proxy

Branch: `claude/worker-proxy-task-hewbu9`. Prerequisite checked: `backend/internal/handler/middleware/proxysecret.go` and `clientip.go` exist.
Tests: `node --test deploy/` (tests in `deploy/worker.test.mjs`, source `deploy/worker.mjs`).

## Acceptance criteria

### Forwarding
- [ ] GET `/api/v1/bookmarks?q=a%20b` forwarded with path and query unchanged, method GET — `deploy/worker.mjs`, test "forwards path and query"
- [ ] POST with JSON body: method, body text and Content-Type unchanged — `worker.test.mjs`, test "forwards POST body"
- [ ] `/auth/login?return_to=%2Ftrash`, `POST /auth/logout`, `GET /healthz` (also with query) forwarded — test "forwards auth and healthz"
- [ ] `redirect` is `manual` — test "redirect is manual"

### Headers
- [ ] Client `X-Proxy-Secret: evil` replaced by one secret value — test "replaces client X-Proxy-Secret"
- [ ] No `CF-Connecting-IP` + client `X-Client-IP` → no `X-Client-IP` — test "drops client X-Client-IP without CF-Connecting-IP"
- [ ] `CF-Connecting-IP` set + client `X-Client-IP` → only the CF value — test "sets X-Client-IP from CF-Connecting-IP"
- [ ] Origin, Cookie, Content-Type, X-CSRF-Token, User-Agent unchanged — test "passes other headers unchanged"

### Answers
- [ ] Upstream 302 with Location and two Set-Cookie returned intact — test "302 keeps Location and cookies"
- [ ] 200 JSON, 204, 404 problem, 429 Retry-After unchanged — test "upstream answers unchanged"
- [ ] Returned response is `===` the stub's — test "returns upstream object"
- [ ] fetch rejects → 502 `Bad gateway`, exact content type — test "502 on upstream failure"

### Not forwarded
- [ ] The listed paths answer 404 `Not found`, fetch never called — test "not forwarded paths"
- [ ] `/api//x` forwarded to `https://run.example/api//x` — test "double slash concatenation"

### Configuration
- [ ] Bad/missing `CLOUD_RUN_ORIGIN` or secret → 503 `Proxy is not configured`, no fetch; also for `/` — test "misconfigured gives 503"
- [ ] Trailing slash and port origins work — test "valid origin forms"
- [ ] Secret absent from 404/502/503 answers — test "secret not leaked"

### `_redirects`
- [ ] `frontend/public/_redirects` with the one rule; `frontend/dist/_redirects` exists after `make build-frontend` — checked manually

### Repo-wide
- [ ] `node --test deploy/` passes (Node version reported)
- [ ] `make check` passes
- [ ] Only allowed files changed; `frontend/package.json` and lockfile unchanged
- [ ] `deploy/README.md` written per the task's eight steps
- [ ] `make test-integration-local`: not run: no `backend/` change (task file says it does not apply)

## Judgment calls
(filled in at the end)
