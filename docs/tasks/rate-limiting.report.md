# Verification report: rate limiting (NFR-16)

Branch: `claude/rate-limiting-rmtoh7-fqpxpm` (verifier). Builder branch: `claude/rate-limiting-rmtoh7`, commit `ef410aa`.

**Result: no Blocking findings.**

- `make check`: passed (after `npm ci` in `frontend/`; the first attempt failed only because `node_modules` was missing). Re-run after my added tests: passed.
- `make test-integration-local`: **run, passed** (PostgreSQL 16). None of this task's criteria depends on it: all are unit or router-level tests with a fake clock, none needs a database. The existing repository and worker integration tests are unaffected.
- New tests also run with `go test ./internal/handler/... -race -count=20`: passed.

## Criteria

| Criterion | Test | Verdict | Evidence |
|---|---|---|---|
| N pass, N+1 refused (30, 10, 300) | `TestLimiter_Boundary` | Met | Loops all three constants; fails if the burst is wrong |
| Refill after 60/N ±1 ms | `TestLimiter_Refill` | Met | Checks 1 ms early (refused) and 1 ms late (one passes, next refused) for each N |
| Separate keys | `TestLimiter_SeparateKeys` | Met | |
| Refusal takes no token | `TestLimiter_RefusalSpendsNothing` | Met | Five refusals, then one refill gives exactly one pass |
| Retry-After is the ceiling, at least 1 | `TestRetryAfterSeconds`, `TestErrorHandler_RateLimited` | Met | 0.2 s gives 1, 1.5 s gives 2; header checked through `ErrorHandler`. Mutation (value minus 1) fails both |
| Sweep: >10 min dropped, 9 min kept, one sweep per minute | `TestLimiter_Sweep` | Met | Entry count checked. Removing the sweep call fails it |
| Concurrent, exactly N of N+k, `-race` | `TestLimiter_Concurrent` | Met | 350 goroutines, 300 pass. The frozen clock means no refill muddies it |
| Client IP, empty setting | `TestClientIP_NoHeaderSetting` | Met | IPv4 with port, `[::1]:1234`, ignores XFF and CF headers |
| Client IP, header set | `TestClientIP_Header` | Met | Valid, spaces, missing, `not-an-ip`, empty, list, zone, 65 bytes, two headers; also `1.2.3.4:80` and ` ::1 ` |
| IPv4-mapped shares a key; unparsable RemoteAddr as is | `TestClientIP_Normalisation`, `TestClientIP_UnparsableRemoteAddr` | Met | Dropping `Unmap` (header or peer) fails the test |
| 31st save is 429, 30th passes | `TestRateLimit_Saves` | Met | `requireRateLimited` checks content type, code, status, integer `Retry-After` of at least 1, no `detail` |
| 11th login / callback; shared bucket | `TestRateLimit_LoginRoutes` | Met | Includes 9 logins + 2 callbacks, and a second IP. Keying by user instead fails it |
| 301st call; a save counts | `TestRateLimit_Ceiling` | Met | |
| Refused save leaves other calls; user B unaffected | `TestRateLimit_Isolation` | Met | |
| Sync exempt after 1000 calls, spends no ceiling | `TestRateLimit_SyncExempt` | Met | Dropping the exemption fails it |
| 401 and 403 take no token | `TestRateLimit_Order` | Met | N+1 bad requests, then a good one passes |
| Over-limit save with non-JSON is 429 | `TestRateLimit_BeforeRequireJSON` | Met | |
| `Deps.Limits` nil refuses nothing | `TestRateLimit_NilLimits` | Met | |
| Logout counts toward ceiling, not login bucket | `TestRateLimit_LogoutCounts` | Met | |
| A's spent ceiling does not stop B's logout; A's next is 429 | `TestRateLimit_LogoutCounts` (second subtest) | Met | The plan calls it `TestRateLimit_LogoutPerUser`, which does not exist |
| No user in context answers 500 | `TestUserLimit` (subtest) checks only an error that is not a `RateLimitedError`; **added** `TestRateLimit_NoUserIs500` | Met (after my added test) | The builder's test never checked the status. Mine goes through `ErrorHandler` and asserts 500 and no `Retry-After` |
| Problem mapping | `TestErrorHandler_RateLimited` | Met | |
| Config | `TestLoad_ClientIPHeader`, `TestConfig_Validate_ClientIPHeader` | Met | Dev-login-only and OIDC; the error names the variable and not the value |
| `make check` | | Met | |
| Allowed paths; go.mod | | Met | See rule checks |

Added by me: `TestRateLimit_RefusedSaveSpendsCeiling` in `ratelimit_router_test.go` (the task says that a save refused by the saves bucket has still spent the ceiling token; no builder test pinned it) and `TestRateLimit_NoUserIs500`. The converse (ceiling refuses, saves bucket untouched) is not observable with a frozen clock and has no test; it follows from the code order in `policyRouter.add`.

## Plan check

- Every task-file criterion appears in the plan.
- Two ticked items name tests that do not exist: `TestRateLimit_LogoutPerUser` and `TestUserLimit_NoAuthIs500`. The behavior is covered by a `TestRateLimit_LogoutCounts` subtest, and (weakly, before my addition) by a `TestUserLimit` subtest. The 500 status was not asserted. Non-blocking.
- The plan says "run, passed" for `make check` after a flaky frontend test. I did not see that failure; my run passed.
- The plan's judgment call that the 65-byte case does not isolate the length cap is correct: a valid single IP cannot be 65 bytes, and a long zoned value is rejected for the zone anyway. The cap is a defensive check only.
- The diff matches the plan otherwise. Test names for config and problem tests match the plan.

## Rule checks

- Only `handler/` imports `internal/api`: the diff adds no new import of it outside `handler/` (`ratelimit.go` and `clientip.go` do not import it). Met.
- Repository queries and `users.version`: no repository or migration file is touched. Not applicable.
- Paths: diff touches `.env.example`, `backend/cmd/server/main.go`, `backend/go.mod`, `backend/internal/handler/**`, `backend/internal/platform/config/**` and the plan file. All allowed. No `go.sum` change, no `docs/` change other than the plan.
- `go.mod`: the `go` and `toolchain` lines are unchanged; `golang.org/x/time v0.15.0` moved from indirect to direct and nothing else changed.
- `git grep x/time`: only `handler/middleware/ratelimit.go`.
- `policyRouter.add`: limiters are appended after Session and CSRF; the two login routes get the login limiter only (no Session, no CSRF); `/sync/version` gets none; `POST /bookmarks` gets ceiling then saves; everything else gets the ceiling, including logout and favicons. The task file's order is followed.
- No `time.Sleep` in the new tests; all use an injected or frozen clock.
- The refused body carries no `detail`, key or IP (`requireRateLimited` asserts no `detail`; the body comes from `newProblem`).
- Mutations (each reverted afterwards, tree clean): drop the sync exemption (fails `TestRateLimit_SyncExempt`); `Retry-After` value minus 1 (fails five tests); no IPv4 unmapping (fails `TestClientIP_Normalisation`); drop the sweep (fails `TestLimiter_Sweep`); key login by user (fails login and logout tests). The "ceiling before session" mutation was not run as such; I read the code instead (a user-keyed limiter before Session would hit the no-user 500 path, which the tests above would catch).

## Findings

**Blocking:** none.

**Non-blocking**

1. The plan names two tests that do not exist (see above). The behavior is covered.
2. `TestUserLimit`'s no-user subtest did not assert the 500 status (fixed by my added test).
3. The `maxClientIPHeaderLen` check is unreachable in practice and untested; harmless.
4. Not tested, only read: "ceiling refuses, so the saves bucket is untouched" and the backward clock jump. A backward jump is handled by `x/time` (no negative tokens) and I did not find a wrong result.
5. The startup warning in `main.go` is prefixed `WARNING: `; the task gives the message without a prefix. Cosmetic.
