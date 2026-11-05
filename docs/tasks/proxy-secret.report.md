# Verification report: proxy shared secret

Branch: `claude/proxy-secret-verifier-1kfmq8` (the builder's work, `claude/proxy-secret-e3yiag` at 24753c7, plus one added test row).
No requirement ID covers this task; it supports NFR-16 and `STACK.md` Deployment. Reported against `docs/tasks/proxy-secret.md`.

**Result: no Blocking findings.**

## make check

Passed. The first run failed once in `frontend` (`EmptyTrash.test.tsx` "focuses the field on open", a jsdom focus flake). That file is untouched by the diff; it passed alone and the full `make check` passed on rerun. A fresh checkout needed `npm ci` in `frontend/` first.
`go test -race -count=5` on `internal/handler/...` and `internal/platform/config`: passed.

## Integration tests

`make test-integration-local`: **run, passed** (PostgreSQL 16, `/usr/lib/postgresql/16/bin`). This task adds no integration tests and no criterion depends on one; all criteria are unit or router-level tests, as the task file says.

## Acceptance criteria

All tests below are in `handler/middleware/proxysecret_test.go` (M), `handler/proxysecret_router_test.go` (R) or `platform/config/config_test.go` (C). "Mutation" = I broke the code and the test failed.

| Criterion | Test | Real? | Status |
|---|---|---|---|
| Correct value passes | M `CorrectValuePasses` | yes (asserts next ran, no error) | met |
| Refused: none, empty, -1, +1 byte, appended, lower case, two headers | M `RefusesAnythingElse` rows | yes; asserts `echo.ErrNotFound` and next not run. EqualFold mutation fails it | met |
| `GET /healthz` passes with no, wrong, right header; `/healthz/`, `/healthz2`, `/%68ealthz` refused | M `HealthzIsExemptOnlyForGET` | yes; mutations (no exemption, prefix, RawPath ignored) all fail it | met |
| POST/OPTIONS to bookmarks, POST/HEAD to `/healthz` refused | M `EveryMethodNeedsTheHeader` | yes; "any method exempt" mutation fails it | met |
| Lower-case header name accepted | M `HeaderNameIsCaseInsensitive` | yes; real server, map key written in lower case | met |
| Error is `ErrNotFound`; body has neither secret nor supplied value | M `RefusalBodyHas...`, `requireRefused` | yes (default Echo handler body here; router test covers the problem body) | met |
| Valid session, no header: 404 problem, handler not run; with header reaches handler | R `RouterRefusesWithoutTheHeader` | yes; counting server | met |
| Refused bytes equal unknown-route bytes | R `RefusedAnswerIsTheUnknownRouteAnswer` | yes; compares status, content type, bytes; also no Retry-After/WWW-Authenticate | met |
| Order: 404 not 401 / 403 / 413 | R `RunsBeforeEverythingElse` | yes; placing the middleware after `BodyLimit` fails the 413 subtest | met |
| 20 refused `/auth/login` take no token | R `RefusedRequestsTakeNoRateLimitToken` | yes; 10 then pass, 11th 429 | met |
| Forged client IP never used | R `AForgedClientIPIsNeverUsed` | yes | met |
| `/healthz` 200 without header; `/auth/callback` 404 | R `HealthzAndCallback` | yes | met |
| Refused body lacks secret / supplied value | R `RefusedAnswer...` | yes | met |
| Empty secret: nothing refused | R `EmptyMeansNothingIsRefused` | partly independent: relies on the existing router tests too | met |
| `Server` nil with secret | R `WithoutAServerOnly...` | yes | met |
| Setting read; empty valid in dev | C `TestLoad_ReadsTheProxySecret`, `Validate_ProxySecret/empty...` | yes | met |
| Production empty rejected naming variable; production valid accepted | C `production with it empty is rejected`, `32 bytes accepted` | yes | met |
| 31 bytes rejected (dev, production), 32 accepted, no value in error | C `31 bytes is rejected everywhere`, `32 bytes accepted` | yes | met |
| Space, `\n`, tab, non-ASCII rejected, no value in error | C `rejected` rows | yes | met |
| Checks run for dev-login-only and OIDC | C rows loop over "dev login", "OIDC in development", "OIDC in production" | yes; moving the checks after the OIDC branches fails it | met |
| `make check` passes | | see above | met |
| Only allowed paths changed; `go.mod`/`go.sum` unchanged | `git diff --stat` | | met |

## Plan check (read after the criteria)

- Every criterion above appears in the plan; none is missing.
- Every ticked item has a test that checks the behavior (table above). The tick for `make test-integration-local` agrees with my own run (PostgreSQL 16).
- The plan matches the diff. It states the contract is untouched, as required. The plan says the "forged IP" test builds IPs "with a simple two-digit suffix"; accurate.
- Minor: the plan says the first `make check` failure was the same flaky frontend test I saw.

## Rule checks

- Only `handler/` imports `internal/api`: yes (the new router test is in `handler`; nothing else changed).
- Repository queries filter by `user_id`: not applicable, no repository code changed.
- `users.version`: not applicable, no write transactions touched.
- `go.mod`/`go.sum`: unchanged; the `go`/`toolchain` lines unchanged; only `crypto/sha256` and `crypto/subtle` added.
- Allowed paths: diff is `.env.example`, `cmd/server/main.go`, `handler/router.go`, `handler/middleware/{doc,proxysecret,proxysecret_test}.go`, `handler/proxysecret_router_test.go`, `platform/config/{config,config_test}.go` and the plan. No migration, contract or doc change.
- Verifier checks:
  - Secret is the first `e.Use`, before `BodyLimit` and before the `Server == nil` return: yes (`router.go`).
  - Secret and header value appear in no log call or error: `grep` finds only the config doc comment and the length error, which names the variable and the constant, not the value. No log line for refusals.
  - Comparison is `subtle.ConstantTimeCompare` over SHA-256 digests, the secret hashed once at construction; no `==` or `EqualFold` on the secret.
  - Mutations: after `BodyLimit` (fails 413 test), drop exemption, prefix match, RawPath ignored, EqualFold, 403, any-method exempt, `Validate` checks after the OIDC branches: each made at least one test fail; each was reverted. "After the session check" cannot be built with `e.Use` because sessions are route-level middleware in `policyRouter`, so there is nothing to put it behind; the 401 test covers the order.
  - Inputs: 32 and 31 byte secrets, lower-case header name, `/healthz?x=1` (exempt), `//healthz`, `/%68ealthz` (refused), HEAD and POST `/healthz` (refused): covered. A 64 KiB header value was not covered; I added a row `64 KiB value` to `RefusesAnythingElse` in `proxysecret_test.go`; it passes (refused, 404), with `-race -count=5`.

## Findings

### Blocking

None.

### Non-blocking

1. The frontend test `EmptyTrash.test.tsx` "focuses the field on open" is flaky under the full parallel run (not part of this diff).
2. `TestProxySecret_RefusalBodyHas...` at middleware level uses Echo's default error handler, so its body is not the problem JSON; the router tests cover the real body. Fine as is.
3. `Deps.ProxySecret` is declared after a blank line and the `main.go` literal has a blank line before `ProxySecret:` — cosmetic.
