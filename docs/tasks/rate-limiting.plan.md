# Plan: rate limiting (NFR-16)

Branch: `claude/rate-limiting-rmtoh7`. Backend only. All tests are unit/router-level with a fake clock; none is an integration test.

## Acceptance criteria

### Limiter (`backend/internal/handler/middleware/ratelimit.go`, test `ratelimit_test.go`)
- [ ] N pass at one instant, N+1 refused, for N = 30, 10, 300: `TestLimiter_Boundary`
- [ ] After 60/N s + 1 ms one passes; after 60/N s - 1 ms none: `TestLimiter_Refill`
- [ ] Two keys have separate buckets: `TestLimiter_SeparateKeys`
- [ ] A refused call takes no token: `TestLimiter_RefusalSpendsNothing`
- [ ] Retry-After is the ceiling in seconds, at least 1 (0.2 -> 1, 1.5 -> 2): `TestRetryAfterSeconds`
- [ ] Sweep: entry unused >10 min gone, 9 min kept, at most one sweep per minute: `TestLimiter_Sweep`
- [ ] Concurrent calls on one key under `-race` pass exactly N of N+k: `TestLimiter_Concurrent`

### Client IP (`middleware/clientip.go`, test `clientip_test.go`)
- [ ] Empty setting uses the peer, ignores X-Forwarded-For / CF-Connecting-IP: `TestClientIP_NoHeaderSetting`
- [ ] `CF-Connecting-IP`: valid (also with spaces) used; missing, `not-an-ip`, empty, `1.2.3.4, 5.6.7.8` fall back: `TestClientIP_Header`
- [ ] `::ffff:1.2.3.4` equals `1.2.3.4`; unparsable RemoteAddr used as is; zoned address, 65-byte value, two headers: `TestClientIP_Normalisation`, `TestClientIP_Fallbacks`

### Router (`backend/internal/handler/ratelimit_router_test.go`)
- [ ] 31st save is 429 (problem JSON, code, Retry-After >= 1), 30th passes: `TestRateLimit_Saves`
- [ ] 11th login and callback 429, shared bucket (9 logins + 2 callbacks): `TestRateLimit_LoginRoutes`
- [ ] 301st authenticated call 429; a save counts toward the ceiling: `TestRateLimit_Ceiling`
- [ ] Refused save does not stop other calls; user B unaffected: `TestRateLimit_Isolation`
- [ ] sync/version exempt after 1000 calls, spends no ceiling: `TestRateLimit_SyncExempt`
- [ ] Order: 401 and 403 take no token: `TestRateLimit_Order`
- [ ] Over-limit save with non-JSON content type is 429 not 415: `TestRateLimit_BeforeRequireJSON`
- [ ] `Deps.Limits` nil refuses nothing: `TestRateLimit_NilLimits`
- [ ] Logout counts toward ceiling, not login bucket: `TestRateLimit_LogoutCounts`
- [ ] A spending the ceiling does not stop B's logout; A's next logout 429: `TestRateLimit_LogoutPerUser`
- [ ] User-keyed limiter without an authenticated user answers 500 (middleware test, `ratelimit_test.go`): `TestUserLimit_NoAuthIs500`

### Problem mapping (`backend/internal/handler/problem.go`, test `problem_test.go`)
- [ ] `RateLimitedError` -> 429 `rate_limited` with `Retry-After`: `TestProblemFor` / `TestErrorHandler_RateLimited`

### Config (`backend/internal/platform/config/config.go`, test `config_test.go`)
- [ ] `CLIENT_IP_HEADER` read into `ClientIPHeader`; empty and `CF-Connecting-IP` valid; `bad header`, `a:b` rejected naming the variable, not the value; dev-login-only and OIDC: `TestLoad_ClientIPHeader`, `TestConfig_Validate_ClientIPHeader`

### Wiring and docs
- [ ] `Deps.Limits`, `policyRouter.add` (`handler/router.go`), `cmd/server/main.go` wiring and production warning, `.env.example` line

### Repo-wide
- [ ] `make check` passes: not run yet
- [ ] `make test-integration-local`: not run yet
- [ ] `go.mod`: `golang.org/x/time v0.15.0` direct, nothing else changed: not checked yet

## Judgment calls
(none yet)
