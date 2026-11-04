# Plan: rate limiting (NFR-16)

Branch: `claude/rate-limiting-rmtoh7`. Backend only. All tests are unit/router-level with a fake clock; none is an integration test.

## Acceptance criteria

### Limiter (`backend/internal/handler/middleware/ratelimit.go`, test `ratelimit_test.go`)
- [x] N pass at one instant, N+1 refused, for N = 30, 10, 300: `TestLimiter_Boundary`
- [x] After 60/N s + 1 ms one passes; after 60/N s - 1 ms none: `TestLimiter_Refill`
- [x] Two keys have separate buckets: `TestLimiter_SeparateKeys`
- [x] A refused call takes no token: `TestLimiter_RefusalSpendsNothing`
- [x] Retry-After is the ceiling in seconds, at least 1 (0.2 -> 1, 1.5 -> 2): `TestRetryAfterSeconds`
- [x] Sweep: entry unused >10 min gone, 9 min kept, at most one sweep per minute: `TestLimiter_Sweep`
- [x] Concurrent calls on one key under `-race` pass exactly N of N+k: `TestLimiter_Concurrent`

### Client IP (`middleware/clientip.go`, test `clientip_test.go`)
- [x] Empty setting uses the peer, ignores X-Forwarded-For / CF-Connecting-IP: `TestClientIP_NoHeaderSetting`
- [x] `CF-Connecting-IP`: valid (also with spaces) used; missing, `not-an-ip`, empty, `1.2.3.4, 5.6.7.8` fall back: `TestClientIP_Header`
- [x] `::ffff:1.2.3.4` equals `1.2.3.4`; unparsable RemoteAddr used as is; zoned address, 65-byte value, two headers: `TestClientIP_Normalisation`, `TestClientIP_Fallbacks`

### Router (`backend/internal/handler/ratelimit_router_test.go`)
- [x] 31st save is 429 (problem JSON, code, Retry-After >= 1), 30th passes: `TestRateLimit_Saves`
- [x] 11th login and callback 429, shared bucket (9 logins + 2 callbacks): `TestRateLimit_LoginRoutes`
- [x] 301st authenticated call 429; a save counts toward the ceiling: `TestRateLimit_Ceiling`
- [x] Refused save does not stop other calls; user B unaffected: `TestRateLimit_Isolation`
- [x] sync/version exempt after 1000 calls, spends no ceiling: `TestRateLimit_SyncExempt`
- [x] Order: 401 and 403 take no token: `TestRateLimit_Order`
- [x] Over-limit save with non-JSON content type is 429 not 415: `TestRateLimit_BeforeRequireJSON`
- [x] `Deps.Limits` nil refuses nothing: `TestRateLimit_NilLimits`
- [x] Logout counts toward ceiling, not login bucket: `TestRateLimit_LogoutCounts`
- [x] A spending the ceiling does not stop B's logout; A's next logout 429: `TestRateLimit_LogoutPerUser`
- [x] User-keyed limiter without an authenticated user answers 500 (middleware test, `ratelimit_test.go`): `TestUserLimit_NoAuthIs500`

### Problem mapping (`backend/internal/handler/problem.go`, test `problem_test.go`)
- [x] `RateLimitedError` -> 429 `rate_limited` with `Retry-After`: `TestProblemFor` / `TestErrorHandler_RateLimited`

### Config (`backend/internal/platform/config/config.go`, test `config_test.go`)
- [x] `CLIENT_IP_HEADER` read into `ClientIPHeader`; empty and `CF-Connecting-IP` valid; `bad header`, `a:b` rejected naming the variable, not the value; dev-login-only and OIDC: `TestLoad_ClientIPHeader`, `TestConfig_Validate_ClientIPHeader`

### Wiring and docs
- [x] `Deps.Limits`, `policyRouter.add` (`handler/router.go`), `cmd/server/main.go` wiring and production warning, `.env.example` line

### Repo-wide
- [x] `make check` passes: run, passed (first run: one unrelated frontend test, `EmptyTrash.test.tsx` "focuses the field on open", failed under load and passes alone and on a full rerun; no frontend file was touched)
- [x] `make test-integration-local`: run, passed (PostgreSQL 16)
- [x] `go.mod`: `golang.org/x/time v0.15.0` direct, nothing else changed: checked: `x/time v0.15.0` moved to the direct block by `go mod tidy`, nothing else changed, `go.sum` unchanged

## Judgment calls
- `Limiter` sets `lastSweep` to the clock reading at construction, so the first sweep can run a minute after creation.
- A peer address with an IPv6 zone has the zone dropped before use as a key (the task only covers zones in the header).
- The 65-byte header test uses an input that is invalid for another reason too (a valid IP cannot be 65 bytes), so the length cap is a defensive check that no test isolates.
- Extra exported helpers beyond the task text: `NewLimiter`, `UserLimit`, `IPLimit` and `RateLimitedError.RetryAfterSeconds`; `UserLimit` is exported so the no-session 500 test can build it directly.
- The no-authenticated-user case returns a plain error that the existing handler maps to a generic 500 (logged), not a dedicated error type.
- Test names for the config and problem tests are my own: `TestLoad_ClientIPHeader`, `TestConfig_Validate_ClientIPHeader`, `TestErrorHandler_RateLimited`.
