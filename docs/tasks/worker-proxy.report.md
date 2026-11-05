# Verification report: worker-proxy

Branch: `claude/worker-proxy-task-hewbu9` (verifier commit on top of the builder's `8980397`).
No requirement ID covers this task (task file: "none numbered"); it supports `STACK.md` Deployment and NFR-16.
**Nothing was verified on Cloudflare or Pages.** The Worker was tested only against a stubbed `fetch`; `_redirects` only by checking that the build copies it.

Runs: `make check` passed (after `npm ci` in `frontend/`). `node --test "deploy/*.test.mjs"` passed, 21 of 21, Node v22.23.4. `node --test deploy/` (the form in the task file) fails on Node 22 with `MODULE_NOT_FOUND`, see finding B1. `make build-frontend` ran; `frontend/dist/_redirects` exists with the same rule. Integration tests: not run, no `backend/` change (the task file says the step does not apply).

## Criteria

Tests are in `deploy/worker.test.mjs`. "Real" means a mutation of the Worker (in a temp copy) made it fail.

| Criterion | Test | Real? | Status |
|---|---|---|---|
| GET path and query unchanged, method GET | forwards path and query unchanged | Yes (URL-building mutant caught by other tests; exact URL asserted) | Met |
| POST body, method, Content-Type | forwards POST body, method and Content-Type | Yes, reads body from the stub request | Met |
| `/auth/login?...`, `POST /auth/logout`, `/healthz` (+query) forwarded | forwards auth and healthz calls | Yes | Met |
| `redirect` is `manual` | redirect of the forwarded request is manual | Yes, `"follow"` mutant fails | Met |
| Client `X-Proxy-Secret` replaced, one value | replaces a client X-Proxy-Secret...; two ... collapse | Yes, "copy client secret" mutant fails. A mutant that drops the `delete` survives, but it is equivalent: `Headers.set` replaces all values | Met |
| No CF IP + client `X-Client-IP` → none | drops a client X-Client-IP...; empty CF-Connecting-IP... | Yes, mutant that keeps the client header fails | Met |
| CF IP + client `X-Client-IP` → CF value only | sets X-Client-IP from CF-Connecting-IP only | Yes | Met |
| Origin, Cookie, Content-Type, X-CSRF-Token, User-Agent unchanged | passes other headers unchanged | Yes | Met |
| 302 + Location + two Set-Cookie intact | a 302 keeps Location and both Set-Cookie headers | Yes, rebuild mutant fails | Met |
| 200 / 204 / 404 / 429 unchanged | upstream answers come back unchanged | Yes | Met |
| Response is `===` the stub's | returns the very object fetch gave it | Yes (rebuild mutant fails) | Met |
| fetch rejects → 502, type, body | answers 502 when fetch rejects | Yes | Met |
| Not forwarded list, fetch never called | paths outside the three... | Yes, `/login` and "`/api` without slash" mutants fail | Met |
| `/api//x` concatenated | a path starting /api// is concatenated | Partly real: see N1 | Met |
| 503 for bad or missing settings, also for `/` | a misconfigured Worker answers 503... | Yes: `http:` mutant and "path check first" mutant fail | Met |
| Trailing slash and port origins | origin with a trailing slash or a port works | Yes | Met |
| Secret not in own answers | the secret is not in the Worker's own answers | Yes, though the Worker never has a code path that writes it | Met |
| `_redirects` file and `dist/_redirects` | none (checked by hand by building) | n/a | Met (file has two comment lines, one rule) |
| `node --test deploy/` passes, Node version reported | n/a | n/a | Partly met: Node v22.23.4 reported; the exact command fails, the glob form passes (B1) |
| `make check` passes | n/a | n/a | Met |
| Only the four files and the plan changed; `package.json` and lockfile unchanged | `git diff origin/main...HEAD --stat` | n/a | Met |

## Plan check

- Every acceptance criterion in the task file appears in the plan, and every ticked item has a test that exists and checks the behavior. The plan's test names are paraphrases of the real ones (for example "302 keeps Location and cookies" vs "a 302 keeps Location and both Set-Cookie headers"); not wrong, just not searchable.
- Plan says `make check` success was judged from the last target because it ran through a pipe. I re-ran it with the exit status: 0. The plan's header and the README disagree on the test command: the plan header still says `node --test deploy/`, the checklist and README say the glob.
- The plan lists the Node 22 command problem as a judgment call; it is the one real deviation from the task file.
- Diff vs plan: no difference found. The plan's claim "the other 26 failures came from a bare `node --test`" is not something I checked and does not affect the result.

## Rule checks

- Only `handler/` imports `internal/api`; repository queries filter by `user_id`; `users.version` is incremented in write transactions: not applicable, no `backend/` change.
- `go.mod`, `go.sum`, `frontend/package.json` and the lockfile are unchanged; no dependency added; no `package.json` in `deploy/`.
- The diff touches only `deploy/README.md`, `deploy/worker.mjs`, `deploy/worker.test.mjs`, `frontend/public/_redirects` and the plan file.
- `worker.mjs` read against Behavior: config check comes first; `X-Proxy-Secret` and `X-Client-IP` are deleted before being set; `Origin` is never touched; `redirect: "manual"`; response returned as `fetch` gave it, never read or rebuilt; no `console.*`; neither the secret nor an address is written to a response or log; `fetch` is called with one `Request`; body passed only when `request.body !== null`, with `duplex: "half"`.
- Mutations (temp copy outside the repo): `redirect: "follow"`, copy client secret, keep client `X-Client-IP`, `/api` without slash, forward `/login`, `http:` accepted, rebuilt response, path check removed: each made at least one test fail. Two survived, both equivalent (N1, and the dropped `delete`).
- Extra inputs tried: 100 000-character query (forwarded intact); `#frag` (not sent); `/API/...` (404, case-sensitive); `OPTIONS /auth/` (forwarded as is); `PUT` with body (body reaches the stub); `CF-Connecting-IP` of spaces (no `X-Client-IP`); two `X-Proxy-Secret` values, `HEAD`, `/api/`, empty `CF-Connecting-IP` (covered by existing tests). Concurrent writes do not apply (no state).

## Findings

### Blocking

**B1. The acceptance criterion's command does not work.** The task says `node --test deploy/` passes. On Node v22.23.4: `node --test deploy/` → `Error: Cannot find module '/home/user/marker/deploy'`, `# fail 1`. Reproduce: `node --test deploy/` from the repo root. The builder used `node --test "deploy/*.test.mjs"` (21 of 21 pass), documented it in the README and plan, and reported it honestly. Because the code is correct and the fault is in the command written in the task file, this is for the user to decide: either accept the glob form (and fix the task file's command, which only the Drafter may do), or have the builder add something that makes the directory form work, which would need a file outside the allowed four. I did not change anything. I am listing it as Blocking because it is a literal acceptance criterion that fails.

### Non-blocking

- N1. The task's `new URL(path, origin)` mistake is not caught by any test: that variant only differs for paths starting `//`, which the path check already answers 404, so the `/api//x` test passes either way. Behavior is correct; the test does not guard that design choice.
- N2. Plan header still says `node --test deploy/`; the plan's test names do not match the real ones.
- N3. The README says the Worker tests run with the glob; the task's Handing back and Structure sections say `node --test deploy/`. Task file and README disagree until B1 is settled.
