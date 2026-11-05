# Task: Cloudflare Worker proxy and Pages fallback

Tooling and deployment files. One builder agent on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them. Nothing here runs in the app: the files are copied by hand to Cloudflare, so nothing the builder writes has been run against Cloudflare. Say so in the report.

## Prerequisite

`proxy-secret` is merged: the backend answers `404 not_found` to any request without the header `X-Proxy-Secret` (value `PROXY_SHARED_SECRET`), except `GET /healthz`, and it reads the client address from the header named by `CLIENT_IP_HEADER` (`handler/middleware/proxysecret.go`, `clientip.go`). `STACK.md`, Deployment, describes the arrangement and names `deploy/`. If the backend check is missing, stop and ask.

## Goal

Two files that the user copies to Cloudflare so the deployed app has one origin, as in development (Vite proxies `/api`, `/auth` and `/healthz` to the Go server):

1. **The Worker** (`deploy/worker.mjs`) forwards `/api/*`, `/auth/*` and `/healthz` to the Cloud Run address. It adds the shared secret the backend now requires, passes the client's IP address in a header the backend trusts, and does not follow redirects, so the login and callback redirects reach the browser.
2. **`frontend/public/_redirects`** makes the Pages site answer every path that is not a built file with `index.html`, so a reload on `/folder/…`, `/trash`, `/save`, `/bookmarks/…`, `/account` or `/login` shows the app (the router then draws the screen). This closes the `login-screen` known gap that production serving of `/login` was unscoped.

Requirements covered: none numbered. It supports the deployment in `STACK.md` and NFR-16 (the per-IP login limit needs a client address that the proxy, not the client, supplies). The verifier reports against this file and `STACK.md`, and says that no requirement ID covers it.

Out of scope, with the reason for each:
- Deploying: creating the Pages project, the Worker, its routes, the variable and secret in Cloudflare, and Cloud Run. The user does these (steps in `deploy/README.md`).
- The Dockerfile (`backend-dockerfile`) and any backend change: the backend side exists.
- Rate limiting, caching, compression, CORS or header rewriting beyond what is written below. The Worker is a thin forwarder.
- A deploy script, `wrangler` configuration or `package.json` for `deploy/`: the file is pasted into the dashboard. No dependency.
- Hooking the Worker's test into `make check` (the `Makefile` is off limits; see the backlog line).
- `docs/**` and `STACK.md`: the user updates them (the client-address choice below changes the `CLIENT_IP_HEADER` wording in `STACK.md`).

## Role and ownership

Role: Integrator (see `AGENTS.md`), limited by this file. The files belong to no single side: `deploy/` is outside both `backend/**` and `frontend/**`. The user approved the new top-level directory `deploy/` by naming it in `STACK.md`, Deployment.

You may add these files and no others: `deploy/worker.mjs`, `deploy/worker.test.mjs`, `deploy/README.md` and `frontend/public/_redirects`. You may not change any other file: no application code, no `frontend/package.json` or lockfile, `vite.config.ts`, the `Makefile`, `docs/**` (except your own plan file, `docs/tasks/worker-proxy.plan.md`, see `AGENTS.md`), `STACK.md`, the contract, or anything under `backend/`.

Shared files: none. `frontend/public/` currently holds only `favicon.svg`; no other task touches it. This task can run alongside any other task.

## Operations used

None. The Worker is not part of `openapi.yaml`.

## Behavior

### The Worker (`deploy/worker.mjs`)

A single ES module with no imports and no dependencies, in plain JavaScript (Cloudflare Workers' module syntax). The file is `.mjs` so that Node treats it as an ES module with no `package.json` (the dashboard accepts any file name): `export default { async fetch(request, env) { … } }`. It uses only what the Workers runtime and Node 22 both provide: `fetch`, `Request`, `Response`, `Headers` and `URL`.

**Settings** (not constants in the file, so the file is never edited per environment):
- `env.CLOUD_RUN_ORIGIN`: a Worker variable, the Cloud Run address such as `https://marker-xxxx-uc.a.run.app`. It must parse (with `new URL`) as an `https:` URL whose `pathname` is `/`, with an empty `search` and `hash` and no username or password. A port is allowed. Use its `origin` property, so a trailing slash does not matter.
- `env.PROXY_SHARED_SECRET`: a Worker secret, the same value as the backend setting. It must be a non-empty string.

If either is missing or invalid, the Worker answers `503` with the plain text body `Proxy is not configured` (no trailing newline; content type exactly `text/plain; charset=utf-8`), forwards nothing, and does not say which setting is wrong. This check comes first: a misconfigured Worker answers `503` for every path, `/` included, before the path check below. All the Worker's own plain text answers (`503`, `404`, `502`) use that exact content type and have no trailing newline.

**Which requests it forwards.** Let `path` be `new URL(request.url).pathname`. It forwards when `path` is exactly `/healthz`, or starts with `/api/`, or starts with `/auth/`. The comparison is on the pathname as the URL parser gives it, case-sensitive: the parser resolves dot segments, including the escaped forms `%2e` and `%2E`, so `/api/%2e%2e/login` becomes `/login` and is not forwarded; other percent-escapes stay as written (`/%61pi/x` stays and does not match). Anything else (`/`, `/login`, `/api`, `/apix`, `/authx`, `/healthz/`, `/healthz/x`, `/%61pi/x`) is answered `404` with the plain text body `Not found` and is not forwarded. Every method is forwarded as is, with no special case for `HEAD`, `OPTIONS` or `TRACE` (`HEAD /healthz` therefore reaches the backend, which only serves `GET /healthz`; whatever it answers is returned). The Cloudflare route patterns are exactly the three that match (see the README); this check only keeps a wrong route pattern from turning the Worker into an open relay.

**The forwarded request:**
- URL: the origin string from the settings (`CLOUD_RUN_ORIGIN`'s `origin` property) followed by the request's `pathname + search`, joined by plain string concatenation, not by resolving the path against the origin with `new URL(path, origin)` (a path that began with `//` would then change the host). The fragment is never sent.
- Method and body: the request's own, unchanged and streamed (not read into memory). The Worker calls `fetch` with one argument, `new Request(url, { method, headers, body, redirect: "manual", duplex: "half" })`; the body is passed only when the request has one (`request.body` is not null), and `duplex: "half"` is required for a streamed body in Node and is accepted and ignored by Workers.
- Headers: a copy of the request's headers, then:
  - delete `X-Proxy-Secret` and `X-Client-IP` if the client sent them (so a client cannot choose either value);
  - set `X-Proxy-Secret` to `env.PROXY_SHARED_SECRET`;
  - if the request has a non-empty `CF-Connecting-IP` header (Cloudflare sets it at the edge), set `X-Client-IP` to its value; otherwise send no `X-Client-IP` at all;
  - leave `Host` to the runtime (the Worker neither sets nor copies it) and every other header exactly as received, in particular `Origin`, `Cookie`, `Content-Type`, `X-CSRF-Token`, `Accept` and `User-Agent`. The backend's CSRF check compares `Origin` with its `APP_BASE_URL`, so `Origin` must not be rewritten.
- `redirect: "manual"`. The backend answers `GET /auth/login` and `GET /auth/callback` with `302`s that the browser has to follow itself, and the callback's `Set-Cookie` headers must reach the browser with that response. (`POST /auth/logout` answers `200` with JSON and clears cookies; it is forwarded like any other call.)

**The answer:** the upstream response, returned unchanged: same status, same body (streamed), same headers, including every `Set-Cookie` (several of them) and `Location`. The Worker does not read, rebuild or copy the response (it returns the very object `fetch` gave it), and adds, removes and rewrites nothing, so cookies stay host-only on the public domain and a redirect `Location` is what the backend wrote.

**If the upstream call fails** (`fetch` rejects: DNS, connection refused, timeout): answer `502` with the plain text body `Bad gateway`. No timeout is set by the Worker. Nothing else is logged. The Worker never logs a request, a header, the secret or the client address (no `console.log` of any of them).

**The backend side of the client address** is not changed: the user sets `CLIENT_IP_HEADER=X-Client-IP` on Cloud Run. `X-Client-IP` is a header the Worker writes itself, so it does not depend on Cloudflare forwarding `CF-Connecting-IP` to the origin (`STACK.md` lists that as unconfirmed).

### `frontend/public/_redirects`

One rule, in Cloudflare Pages' format, with a comment line that says why:
`/*  /index.html  200`
(a status `200` rewrite, so the URL in the address bar stays). Vite copies `public/` into `dist/`, so the file reaches the root of the built site. Pages serves a real file when there is one (assets, `favicon.svg`) before it applies this rule. The Worker routes (`/api/*`, `/auth/*`, `/healthz`) take precedence over Pages on the same domain, so this rule never sees them.

### `deploy/README.md`

The only written instructions, short and in the order a person does them:
1. Cloudflare Pages: connect the repository (or upload `frontend/dist`), build command `npm run build` in `frontend/`, output `frontend/dist`, on the app's domain.
2. Worker: create a Worker and paste `deploy/worker.mjs` into the dashboard editor (the repository copy is the source; the dashboard does not update itself, so paste again after every change).
3. In the Worker's settings: the variable `CLOUD_RUN_ORIGIN` (the Cloud Run address) and the secret `PROXY_SHARED_SECRET` (generate it with `openssl rand -hex 32`; never commit or paste it anywhere else).
4. Worker routes on the same domain, exactly: `<domain>/api/*`, `<domain>/auth/*`, `<domain>/healthz`. Not `/*`.
5. Cloud Run: set the same value as `PROXY_SHARED_SECRET`, plus `CLIENT_IP_HEADER=X-Client-IP`, `APP_ENV=production` and `APP_BASE_URL` (the public https origin: no path, no trailing slash, because the CSRF check compares it with the browser's `Origin`); see `STACK.md`, Deployment.
6. Check, in order: `https://<domain>/healthz` answers `200` through the Worker; calling the Cloud Run address directly (not the domain) with no header answers `404` except `/healthz`; a full login from the domain returns to the app and keeps its session; reloading `/trash` and `/login` shows the app; last, wait a minute (login and callback share one allowance of 10 a minute per address, and a full login spent some), then send 12 quick `GET https://<domain>/auth/login` requests: at least one answers `429`. That also confirms the client address reaches the backend; if the limit seems to be shared by every user, `CLIENT_IP_HEADER` is wrong.
7. Rotating the secret: change it in both places; requests answer `404` between the two changes.
8. Provider facts still unconfirmed (from `STACK.md`): that `CF-Connecting-IP` is present on the request the Worker receives (the Worker copies it into `X-Client-IP`; it does not depend on Cloudflare forwarding the header on to Cloud Run), and that Pages applies `_redirects` as above.

### Known gaps

- The Worker is pasted by hand; a stale dashboard copy is not detected.
- A single shared secret and no rotation overlap.
- The Worker does not limit rates, request sizes or methods; Cloudflare's own limits apply to requests, and the app's body limit (64 KiB) to bodies.
- `CF-Connecting-IP` is trusted as Cloudflare sets it; behind another proxy or a direct call to the Worker's URL the value may be absent (then no `X-Client-IP` is sent and the backend uses the connection address).
- A browser that sends several `CF-Connecting-IP` headers is not a case (Cloudflare sets the header at the edge); the Worker takes the value `Headers.get` returns, and forwards a malformed value as is (the backend then falls back to the connection address).
- `_redirects` rewrites every unknown path, so a mistyped asset URL returns `index.html` with `200`, not a `404`. The app's own not-found screen handles unknown routes.
- No test runs against Cloudflare or Pages: the Worker is tested against a stubbed `fetch`, and `_redirects` by checking that the build copies it.

## Structure

`deploy/` at the repository root, four files as listed. Not linted or built by `make check`; the test runs with `node --test "deploy/*.test.mjs"` (Node's built-in runner and `node:assert`, no dependency), from the repository root.

## Dependencies

None. No `package.json` in `deploy/`, no `wrangler`, no test library: `node:test` and `node:assert` only. If Node's `Headers.getSetCookie()` is missing in the Node the builder has (Node 22 has it), stop and ask.

## Acceptance criteria

`deploy/worker.test.mjs`, run with `node --test "deploy/*.test.mjs"`. Each test stubs the global `fetch` with a function that records the request it receives and returns a canned response, so nothing touches a network. The stub receives the single `Request` argument the Worker passes; the test helper reads method, URL, headers and body text from it. Tests build an `env` with `CLOUD_RUN_ORIGIN` `https://run.example` and `PROXY_SHARED_SECRET` a fixed 32-character string.

**Forwarding**
- `GET https://app.example/api/v1/bookmarks?q=a%20b` reaches `fetch` as `https://run.example/api/v1/bookmarks?q=a%20b` (path and query unchanged), method `GET`.
- `POST /api/v1/bookmarks` with a JSON body: the stub receives method `POST` and the same body text and `Content-Type`.
- `GET /auth/login?return_to=%2Ftrash`, `POST /auth/logout` and `GET /healthz` are forwarded; `/healthz` with a query string too.
- `redirect` of the forwarded request is `manual`.

**Headers**
- `X-Proxy-Secret` the client sent (`evil`) is replaced by the Worker's secret; the stub sees exactly one value, the secret.
- A request with no `CF-Connecting-IP` and a client-sent `X-Client-IP: 6.6.6.6` forwards no `X-Client-IP`.
- A request with `CF-Connecting-IP: 203.0.113.9` and a client-sent `X-Client-IP: 6.6.6.6` forwards `X-Client-IP: 203.0.113.9` only.
- `Origin`, `Cookie`, `Content-Type`, `X-CSRF-Token` and `User-Agent` arrive unchanged.

**Answers**
- An upstream `302` with `Location: /login?error=login_failed` and two `Set-Cookie` headers is returned as status `302`, the same `Location`, and both cookies (`getSetCookie()` has two entries, in order).
- An upstream `200` JSON response, a `204` with no body, a `404` problem response and a `429` with `Retry-After` come back with the same status, headers and body.
- The returned response is the very object the stub returned (`===`), not a copy.
- If the stub's `fetch` rejects, the answer is `502`, content type `text/plain; charset=utf-8`, body `Bad gateway`.

**Not forwarded**
- `/`, `/login`, `/api`, `/apix`, `/authx`, `/auth`, `/healthz/`, `/healthz/x`, `/%61pi/x`, `/api/../login`, `/api/%2e%2e/login`, `/api/%2E%2e/x` and `//evil.example/api/x` answer `404` with body `Not found` (content type `text/plain; charset=utf-8`), and the stub's `fetch` is never called.
- A path that starts `/api//x` is forwarded to `https://run.example/api//x` (concatenation, so the host cannot change).

**Configuration**
- With `CLOUD_RUN_ORIGIN` missing, `http://run.example`, `https://run.example/path`, `https://run.example?x=1`, `https://run.example#f`, `https://u:p@run.example` or not a URL, or with `PROXY_SHARED_SECRET` missing or empty: `503`, body `Proxy is not configured`, and `fetch` is not called. With `CLOUD_RUN_ORIGIN` equal to `https://run.example/` (trailing slash) or `https://run.example:8443` it works (the port is kept). A misconfigured Worker answers `503` for `/` too (not `404`).
- The secret does not appear in any response body or header the Worker produces itself (the `404`, `502` and `503` answers).

**`_redirects`**
- The file is `frontend/public/_redirects` with the one rule above. After `make build-frontend`, `frontend/dist/_redirects` exists and contains the same rule (report the check).

**Repo-wide**
- `node --test "deploy/*.test.mjs"` passes (report the Node version) and `make check` passes.
- Nothing outside the four allowed files (and the plan file) changed. `frontend/package.json` and its lockfile are unchanged.

## Verifier checks

- Diff touches only the four files and the plan file.
- Read `worker.mjs` against the Behavior section: the secret and `X-Client-IP` are deleted before they are set; `Origin` is never touched; `redirect` is `manual`; the response is returned without being read or rebuilt; there is no `console.*` call and no place the secret or an address is written to a response or log.
- Break each behavior and see its test fail, then revert. Do it on a copy of `deploy/` in a temporary folder outside the repository (the verifier does not change source files in the checkout): `redirect: "follow"`; copy the client's `X-Proxy-Secret` instead of setting it; forward a client `X-Client-IP`; match `/api` without the trailing slash; forward `/login`; drop one `Set-Cookie` by rebuilding the response; forward when `CLOUD_RUN_ORIGIN` is `http:`.
- Re-run `node --test "deploy/*.test.mjs"` and `make build-frontend`, and confirm `dist/_redirects`.
- Inputs to try: `//evil.example/api/x` as a path, `/api/%2e%2e/login`, `/api/` with nothing after it (forwarded), a header value `CF-Connecting-IP: ` (empty: no `X-Client-IP`), two `X-Proxy-Secret` headers, a very long query, method `HEAD` (forwarded as is).
- The verifier cannot test Cloudflare or Pages: say so, and do not mark anything "verified on Cloudflare".

## Stop and ask when

- The contract, a requirement, or this file conflict with each other, or the backend's secret check is missing.
- You think you need a change outside the four files, a dependency, or an edit to a spec file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.
- `node --test` cannot run a `.mjs` file that uses `Request`, `Headers` and `fetch` in the Node you have.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check` and `node --test "deploy/*.test.mjs"`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, the Node version, requirement IDs covered (none; say so), dependency versions (none), that nothing was run on Cloudflare, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle. The `make test-integration-local` step does not apply (no `backend/` change).
