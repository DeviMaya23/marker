# Plan: Login binding

Branch: `claude/login-binding-qffp6d`. Backend only, no database in the tests, no new dependency.
Authority: contract text of `authLogin` / `authCallback` in `openapi.yaml`, plus FR-1. No requirement ID covers the binding.

## Acceptance criteria

### State and usecase (`backend/internal/usecase/login_test.go`, code in `login.go`, `login_state.go`)
- [ ] `Begin` returns a 43-char base64url binding and `MaxAge` 600; two calls differ; state holds the hash in `b`, never the binding. Test: `TestLoginService_BeginReturnsABinding`.
- [ ] `Complete` with the right binding succeeds; none, empty, wrong: `ErrInvalidLogin`, return-to returned, `Exchange` count 0. Test: `TestLoginService_CompleteRequiresTheBinding`.
- [ ] 128-byte cap: hash for a 129-byte value with that value is refused, 128 succeeds. Test: `TestLoginService_CompleteSizeLimits` (new sub-test).
- [ ] State with `b` missing / empty / not base64url / not 32 bytes: refused with no return-to. Test: `TestLoginService_CompleteRejectsAStateMissingAField` (extended).
- [ ] Bad state with the right binding: refused, no return-to. Test: `TestLoginService_CompleteRejectsABadAttempt` (binding passed in the table).
- [ ] Maximum-length `return_to` still gives a state under 12,288 bytes. Test: `TestLoginService_BeginKeepsTheLongestAllowedReturnTo` and `...FallsBackWhenStateWouldBeTooLong` (extended).

### Handler (`backend/internal/handler/auth_test.go`, `body_keys`-style `login_binding.go` + `login_binding_test.go`, `cookies.go`)
- [ ] Empty binding or `MaxAge` 0 from `Begin`: `/auth/login` is 500, no cookie. Test: `TestAuthLogin` sub-tests.
- [ ] `/auth/login` 302 with exactly one `login_binding` cookie (HttpOnly, Lax, Path, Max-Age 600, Secure iff configured, value from `Begin`); `Begin` failure sets none. Test: `TestAuthLogin`.
- [ ] Callback passes the cookie value to `Complete`; none gives ""; two cookies: first wins. Test: `TestAuthCallback_Binding`.
- [ ] Middleware does not fail on an absent cookie; records nothing on other operations. Test: `login_binding_test.go`.

### Round trip (`backend/internal/handler/auth_flow_test.go`)
- [ ] Login + callback with cookie succeeds (302, session, csrf, binding cleared, one session). Test: `TestAuthFlow_LoginRoundTrip`.
- [ ] Login CSRF: no cookie and a different valid cookie both fail, no session, token endpoint never called. Test: `TestAuthFlow_LoginCSRFIsRefused`.
- [ ] Second tab wins. Test: `TestAuthFlow_SecondTabWins`.
- [ ] Replay after success refused (code single use, no record on our side; commented). Test: `TestAuthFlow_ReplayedCallbackIsRefused`.
- [ ] Cancelled login: `access_denied` with and without cookie. Test: `TestAuthFlow_DeniedLoginIsRefused`, `TestAuthFlow_CancelledLoginWithoutCookie`.
- [ ] Empty/long code with valid binding: `login_failed`, no token call. Test: `TestAuthFlow_EmptyCodeIsRefusedWithoutCallingTheIdP`, `TestAuthFlow_LongCodeIsRefused...`.
- [ ] Failure redirects carry only `error` and validated `return_to`. Test: `requireLoginFailure` helper plus `TestAuthFlow_FailureRedirectCarriesNoBindingOrState`.
- [ ] Logout clears `session`/`csrf_token` (Max-Age -1), returns `{logout_url}`; every callback outcome clears `login_binding`. Tests: `TestAuthLogout`, `TestAuthCallback_*`.

### Repo-wide
- [ ] `make check` passes. Outcome: (to fill)
- [ ] Nothing outside allowed paths changed. Outcome: (to fill)
- [ ] `make test-integration-local`. Outcome: (to fill)

## Judgment calls
(to fill)
