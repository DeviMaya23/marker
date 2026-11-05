# Plan: Login binding

Branch: `claude/login-binding-qffp6d`. Backend only, no database in the tests, no new dependency.
Authority: contract text of `authLogin` / `authCallback` in `openapi.yaml`, plus FR-1. No requirement ID covers the binding.

## Acceptance criteria

### State and usecase (`backend/internal/usecase/login_test.go`, code in `login.go`, `login_state.go`)
- [x] `Begin` returns a 43-char base64url binding and `MaxAge` 600; two calls differ; state holds the hash in `b`, never the binding. Test: `TestLoginService_BeginReturnsABinding`.
- [x] `Complete` with the right binding succeeds; none, empty, wrong: `ErrInvalidLogin`, return-to returned, `Exchange` count 0. Test: `TestLoginService_CompleteRequiresTheBinding`.
- [x] 128-byte cap: hash for a 129-byte value with that value is refused, 128 succeeds. Test: `TestLoginService_CompleteSizeLimits` (new sub-test).
- [x] State with `b` missing / empty / not base64url / not 32 bytes: refused with no return-to. Test: `TestLoginService_CompleteRejectsAStateMissingAField` (extended).
- [x] Bad state with the right binding: refused, no return-to. Test: `TestLoginService_CompleteRejectsABadAttempt` (binding passed in the table).
- [x] Maximum-length `return_to` still gives a state under 12,288 bytes. Test: `TestLoginService_BeginKeepsTheLongestAllowedReturnTo` and `...FallsBackWhenStateWouldBeTooLong` (extended).

### Handler (`backend/internal/handler/auth_test.go`, `body_keys`-style `login_binding.go` + `login_binding_test.go`, `cookies.go`)
- [x] Empty binding or `MaxAge` 0 from `Begin`: `/auth/login` is 500, no cookie. Test: `TestAuthLogin` sub-tests.
- [x] `/auth/login` 302 with exactly one `login_binding` cookie (HttpOnly, Lax, Path, Max-Age 600, Secure iff configured, value from `Begin`); `Begin` failure sets none. Test: `TestAuthLogin`.
- [x] Callback passes the cookie value to `Complete`; none gives ""; two cookies: first wins. Test: `TestAuthCallback_Binding`.
- [x] Middleware does not fail on an absent cookie; records nothing on other operations. Test: `login_binding_test.go`.

### Round trip (`backend/internal/handler/auth_flow_test.go`)
- [x] Login + callback with cookie succeeds (302, session, csrf, binding cleared, one session). Test: `TestAuthFlow_LoginRoundTrip`.
- [x] Login CSRF: no cookie and a different valid cookie both fail, no session, token endpoint never called. Test: `TestAuthFlow_LoginCSRFIsRefused`.
- [x] Second tab wins. Test: `TestAuthFlow_SecondTabWins`.
- [x] Replay after success refused (code single use, no record on our side; commented). Test: `TestAuthFlow_ReplayedCallbackIsRefused`.
- [x] Cancelled login: `access_denied` with and without cookie. Test: `TestAuthFlow_DeniedLoginIsRefused`, `TestAuthFlow_CancelledLoginWithoutCookie`.
- [x] Empty/long code with valid binding: `login_failed`, no token call. Test: `TestAuthFlow_EmptyCodeIsRefusedWithoutCallingTheIdP`, `TestAuthFlow_LongCodeIsRefused...`.
- [x] Failure redirects carry only `error` and validated `return_to`. Test: `requireLoginFailure` helper plus `TestAuthFlow_FailureRedirectCarriesNoBindingOrState`.
- [x] Logout clears `session`/`csrf_token` (Max-Age -1), returns `{logout_url}`; every callback outcome clears `login_binding`. Tests: `TestAuthLogout`, `TestAuthCallback_*`.

### Repo-wide
- [x] `make check` passes. Outcome: run, passed (frontend deps installed with `npm ci` first)
- [x] Nothing outside allowed paths changed. Outcome: only `backend/internal/{usecase,handler}` and this plan changed; `openapi.yaml` and generated code untouched
- [x] `make test-integration-local`. Outcome: run, passed (PostgreSQL 16)

## Judgment calls
- The "cookie middleware records nothing for other operations" criterion: only `authCallback` is registered, so the test sends a login request with the cookie and checks `Complete` is not called; it cannot observe another handler's context, so it is weak.
- Reused the existing `randomToken()` in `usecase/auth.go` for the binding (32 bytes, base64url, same as the task asks) instead of adding a second helper.
- `AuthLogin` treats an empty binding or `MaxAge <= 0` (not only 0) as a fault.
- The `b` check in `verifyState` (step 1) decodes with `RawURLEncoding`, so a trailing `=` is rejected as not base64url.
- Extra tests beyond the list: long-code and 129-byte-cookie cases, fallback state carries the same binding, cookie parsing cases (quotes, two headers, malformed header).
- Mutation check done for skipping the binding check (16 test failures, reverted); the other mutations in the verifier list were not run.
