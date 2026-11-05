# Verification report: worker-proxy

Branch: `claude/worker-proxy-task-hewbu9-r74o1r` (the builder's work from `claude/worker-proxy-task-hewbu9`, plus this report).
No requirement ID covers this task (task file: "none numbered"); it supports `STACK.md` Deployment and NFR-16.
**Nothing was verified on Cloudflare or Pages.** The Worker was tested only against a stubbed `fetch`; `_redirects` only by checking that the build copies it.

## Runs

- `make check`: first run **failed** in `EmptyTrash.test.tsx` "focuses the field on open" (frontend, unrelated). Re-run with `make -k check`: exit 0. The test fails alone 3 of 3 times and in the full run only sometimes, and it also fails on the base commit `599a60b` with none of this branch's files, so it is a pre-existing flake (finding N1). Go tests, lint, build and openapi-lint all passed.
- `node --test "deploy/*.test.mjs"`: 21 of 21 passed, Node v22.23.4.
- `node --test deploy/` (the form the task file had): fails on Node 22 with `MODULE_NOT_FOUND`, because Node 22 treats `deploy/` as a module path. `origin/main` already fixes the task file to the glob form (commit 580bd29), so this is not a finding against the builder.
- `make build-frontend`: ran; `frontend/dist/_redirects` exists and holds the same rule as `frontend/public/_redirects` (two comment lines, then `/*  /index.html  200`).
- Integration tests: not run, no `backend/` change (the task file says the step does not apply).

## Criteria

"Real" means I mutated a temp copy of `worker.mjs` (outside the repo) and the test failed, or I read the assertion.

| Criterion | Test | Real? | Status |
|---|---|---|---|
| GET path and query unchanged, method GET | forwards path and query unchanged | Yes, exact URL and method asserted | Met |
| POST body, method, Content-Type | forwards POST body, method and Content-Type | Yes, body read from the stub's Request | Met |
| `/auth/login?…`, `POST /auth/logout`, `/healthz` (+ query) | forwards auth and healthz calls | Yes, exact method and URL list | Met |
| `redirect` is `manual` | redirect of the forwarded request is manual | Yes, `"follow"` mutant fails | Met |
| Client `X-Proxy-Secret` replaced, one value | replaces a client…; two client… collapse | Yes, "keep the client's value" mutant fails 2 tests. Dropping only the `delete` survives, but it is equivalent (`Headers.set` replaces all values) | Met |
| No CF IP + client `X-Client-IP` → none | drops a client X-Client-IP…; empty CF-Connecting-IP… | Yes, "don't delete X-Client-IP" mutant fails both | Met |
| CF IP + client `X-Client-IP` → CF value only | sets X-Client-IP from CF-Connecting-IP only | Yes (asserts `get`; a `get` returns one combined value, so a second value would show as `"a, b"`) | Met |
| Origin, Cookie, Content-Type, X-CSRF-Token, User-Agent unchanged | passes other headers unchanged | Yes, deleting `Origin` mutant fails | Met |
| 302 with Location and two Set-Cookie intact | a 302 keeps Location and both Set-Cookie headers | Partly real: it asserts status, Location and the ordered `getSetCookie()`, but a mutant that rebuilds the response through a copied `Headers` still passes it. That mutant is caught only by the `===` test | Met |
| 200 JSON, 204, 404 problem, 429 Retry-After unchanged | upstream answers come back unchanged | Yes for status, body and headers | Met |
| Returned response `===` the stub's | returns the very object fetch gave it | Yes, "rebuild the Response" mutant fails | Met |
| fetch rejects → 502 `Bad gateway`, exact type | answers 502 when fetch rejects | Yes | Met |
| Listed paths → 404 `Not found`, no fetch | paths outside the three… | Yes: `/api` without the slash and an added `/login` rule each fail it; type and body checked for all 13 paths, `calls.length === 0` | Met |
| `/api//x` → `https://run.example/api//x` | a path starting /api// is concatenated | Partly real: the exact URL is asserted, but a `new URL(path, origin)` mutant passes (finding N2) | Met |
| 503 for bad or missing settings, `/` too, no fetch | a misconfigured Worker answers 503… | Yes: all 9 settings × `/api/v1/x` and `/`; dropping the `https:` check fails it | Met |
| Trailing slash and port work | origin with a trailing slash or a port works | Yes, port kept | Met |
| Secret not in the 404/502/503 answers | the secret is not in the Worker's own answers | Real only as far as the stub: the `fetch` rejection message contains the secret, and the 502 body is still clean. Body and headers checked | Met |
| `_redirects` file and `dist/_redirects` | none (checked by hand, above) | Checked by hand: file present, one rule, copied by the build | Met |
| `node --test deploy/` and `make check` pass | none | The glob form passes; the literal form fails on Node 22 (task-file bug, fixed on main). `make check` passes on re-run (N1) | Met |
| Nothing outside the four files and the plan changed | none | `git diff --stat 599a60b..HEAD`: only `deploy/worker.mjs`, `worker.test.mjs`, `README.md`, `frontend/public/_redirects`, the plan and the report. `frontend/package.json` and the lockfile unchanged | Met |

## Plan check (`docs/tasks/worker-proxy.plan.md`)

- Every acceptance criterion in the task file appears in the plan. None is missing.
- Every ticked item has a test that exists and checks the behavior. The plan names tests loosely (for example "double slash concatenation") but each maps to one real test.
- Differences between plan and diff:
  - The plan ticks the run as `node --test "deploy/*.test.mjs"`, not the task's `node --test deploy/`. This was a real Node 22 incompatibility, since fixed in the task file.
  - The plan ticks `make check` on the last target having run, "judged from the pipe". My first run failed on a flake (N1), so that judgment was loose, not wrong.
  - `deploy/README.md` has a "Tests" section the task did not ask for ("the only written instructions" are the eight steps). Harmless.
  - `_redirects` has two comment lines where the task said one comment line. The plan declares it.
  - The plan lists four extra tests (two `X-Proxy-Secret` values, empty `CF-Connecting-IP`, `/api/`, `HEAD`); they exist.

## Rule checks

- Only `handler/` imports `internal/api`: no `backend/` change; not applicable.
- Every repository query filters by `user_id`; `users.version` incremented in every write transaction: no `backend/` change; not applicable.
- `go.mod` go/toolchain lines unchanged; no dependency added: `go.mod` is not in the diff; no `package.json` in `deploy/`; the worker has no imports; the tests import only `node:test` and `node:assert/strict`.
- Verifier checks from the task file:
  - Diff touches only the four files and the plan: yes.
  - Read against Behavior: the secret and `X-Client-IP` are deleted, then the secret is set; `Origin` is never touched; `redirect: "manual"`; the response is returned as `fetch` gave it; no `console.*` anywhere; secret and address never appear in a response or log. `fetch` is called with one argument, as the task says.
  - Mutations on a temp copy: `redirect: "follow"`, copy-client-secret, forward client `X-Client-IP`, `/api` without the slash, forward `/login`, rebuild the response, accept `http:`: all fail at least one test. Extra mutants: delete `Origin` (caught), non-empty check relaxed to `!== null` (caught), `new URL(path, origin)` (survives, N2).
  - Inputs tried by hand: `//evil.example/api/x` (404); `/api/%2e%2e/login` (404); `/api/` (forwarded); empty and whitespace-only `CF-Connecting-IP` (no `X-Client-IP`); two `X-Proxy-Secret` values (one, the secret); a 100,000-character query (forwarded whole); `HEAD`, `PUT` forwarded as is; streamed `ReadableStream` body arrives intact; `/API/x` (404, case-sensitive); `/api/%2e/x` → `/api/x` forwarded; `/api/x#f` and `/api/x?` forwarded without the fragment; lower-case or upper-case origin and a trailing slash accepted; `env` undefined, secret not a string → `503`.

## Findings

### Blocking

None.

### Non-blocking

- **N1. `EmptyTrash.test.tsx` "focuses the field on open" is flaky, on this branch and on the base commit.** `cd frontend && npx vitest run src/features/bookmark-list/components/EmptyTrash.test.tsx` failed 3 of 3 times; it failed once in a full `make check` and passed in the next. Not caused by this task (no frontend source in the diff; same failure on `599a60b`). It needs its own backlog entry. If you disagree, treat the first `make check` failure as Blocking.
- **N2. The `/api//x` test cannot tell concatenation from `new URL(path, origin)`.** Because the path filter only lets `/api/`, `/auth/` and `/healthz` through, a path cannot begin with `//` once forwarded, so the two forms give the same result for every reachable input. The code is correct; the test just doesn't prove the choice.
- **N3.** A whitespace-only `PROXY_SHARED_SECRET` (`" "`) counts as configured. The task says "non-empty string", so this meets it; the backend would reject or accept the same value anyway.
- **N4.** The README's Tests section and the glob form of the command are not in the task file; the task file on `main` already uses the glob.
- **N5.** The branch is behind `origin/main` (the task-file fix, 580bd29). Not a conflict: no shared files.
