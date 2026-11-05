# Verification report: Login binding

Branch: `claude/login-binding-qffp6d-n84qva` (reset onto the builder's `claude/login-binding-qffp6d` at `3e3f047`, plus this report and three test rows).

**Result: no Blocking findings.**

- `make check`: passed. It needed `npm ci` in `frontend/` first, as `AGENTS.md` says.
- `make test-integration-local`: **run, passed** (PostgreSQL 16, `/usr/lib/postgresql/16/bin`). No criterion depends only on it: all acceptance criteria are unit and handler tests with no database, as the task file says.
- Authority: the contract text of `authLogin` / `authCallback` in `openapi.yaml` and FR-1. **No requirement ID covers the login binding** (NFR-7 and NFR-13 do not describe a login `GET`). FR-1 (login keeps working) is covered by `TestAuthFlow_LoginRoundTrip`.

## Criteria

All paths are under `backend/internal/`. "Real" means I broke the behavior and the test failed (see Mutation checks).

| # | Criterion | Test | Real? | Verdict |
|---|---|---|---|---|
| U1 | `Begin`: 43-char binding, `MaxAge` 600, calls differ, `b` holds the hash, binding not a substring of the state | `usecase` `TestLoginService_BeginReturnsABinding` | Yes (asserts values directly) | Met |
| U2 | Right binding succeeds; none, empty, wrong: `ErrInvalidLogin`, return-to returned, `Exchange` count 0 | `TestLoginService_CompleteRequiresTheBinding` | Yes (fails with the check skipped) | Met |
| U3 | 128-byte cap: 129-byte value refused although it matches, 128 accepted | `TestLoginService_CompleteSizeLimits` (binding sub-test) | Yes (fails with the cap removed) | Met |
| U4 | State `b` missing, empty, not base64url, not 32 bytes: refused, no return-to | `TestLoginService_CompleteRejectsAStateMissingAField` | Yes (fails with the length check weakened) | Met |
| U5 | Bad state with the right binding: refused, no return-to | `TestLoginService_CompleteRejectsABadAttempt` | Yes | Met |
| U6 | Maximum-length `return_to` gives a state under 12,288 bytes | `TestLoginService_BeginKeepsTheLongestAllowedReturnTo`, `...BeginFallsBackWhenStateWouldBeTooLong` | Yes: both assert `len(state) <= maxStateLen` and a working `Complete`. The fallback test uses only `"` (2 bytes escaped); `<` (6 bytes) takes the same path | Met |
| H1 | Empty binding or `MaxAge` 0: 500, no cookie | `handler` `TestAuthLogin` ("an empty binding", "a zero MaxAge", plus negative) | Yes | Met |
| H2 | 302 with exactly one cookie, all attributes, `Secure` iff configured; `Begin` failure sets none | `TestAuthLogin` (secure true and false), the `beginErr` case at `auth_test.go:170` | Yes (fails with `HttpOnly` or `Path` dropped) | Met |
| H3 | Callback passes the cookie value; none gives ""; two cookies use the first | `TestAuthCallback_Binding` | Yes | Met |
| H4 | Middleware does not fail when the cookie is absent; records nothing for other operations | `login_binding_test.go` `TestRecordLoginBinding`, `TestRecordLoginBinding_OnlyForTheCallback` | First half yes. Second half is weak: it only shows `Complete` is not called on `/auth/login`. The real guarantee is that `router.go` registers the middleware only under `authCallback` (read, confirmed) | Met (weak test, Non-blocking) |
| R1 | Login then callback with cookie: 302, `session`, `csrf_token`, binding cleared, one session | `TestAuthFlow_LoginRoundTrip` | Yes | Met |
| R2 | Login CSRF: no cookie and a different valid cookie both refused, no session, token endpoint never called | `TestAuthFlow_LoginCSRFIsRefused` | Yes (fails with the check skipped) | Met |
| R3 | Second tab wins | `TestAuthFlow_SecondTabWins` | Yes (fails with the check skipped) | Met |
| R4 | Replay after success refused, comment says the IdP's single-use code does it | `TestAuthFlow_ReplayedCallbackIsRefused` (comment at line 195) | Yes | Met |
| R5 | Cancelled login: `access_denied` with and without cookie | `TestAuthFlow_DeniedLoginIsRefused`, `TestAuthFlow_CancelledLoginWithoutACookieIsStillAccessDenied` (also `error=access_denied` with no state and no cookie) | Yes | Met |
| R6 | Empty or long code with a valid binding: `login_failed`, no token call | `TestAuthFlow_EmptyCodeIsRefusedWithoutCallingTheIdP`, `TestAuthFlow_LongCodeIsRefusedWithoutCallingTheIdP` | Yes | Met |
| R7 | Failure redirects carry only `error` and the validated `return_to` | `TestAuthFlow_FailureRedirectCarriesNoBindingOrState` and `requireLoginFailure` | Yes (asserts exactly 2 query keys, no state, no cookie value, empty body) | Met |
| R8 | Replay is refused by the IdP's single-use code, not by a record of ours | Comment in the replay test | n/a (documentation) | Met |
| R9 | Logout clears `session` and `csrf_token` with Max-Age -1 and returns `{logout_url}`; every callback outcome clears `login_binding` | `TestAuthLogout`, `TestAuthCallback_Redirects`, `TestAuthCallback_Binding` | Yes | Met |
| W1 | `make check` passes | I ran it | n/a | Met |
| W2 | Nothing outside the allowed paths changed | `git diff --name-only origin/main...HEAD`: only `backend/internal/{handler,usecase}/**` and the plan. `openapi.yaml`, generated code, migrations, `go.mod`, docs untouched | n/a | Met |

## Plan check (`login-binding.plan.md`, read after the above)

- Every acceptance criterion appears in the plan. None is missing.
- Every ticked item has a test that exists and checks the behavior, with one naming slip: the plan says `TestAuthFlow_CancelledLoginWithoutCookie`, but the test is `TestAuthFlow_CancelledLoginWithoutACookieIsStillAccessDenied`. Same for "`...LongCodeIsRefused...`" (an abbreviation). Cosmetic.
- The plan says only the skip-the-check mutation was run. I ran the rest (below).
- The plan's judgment calls match the diff: `randomToken()` reused (32 bytes, base64url, same as the task asks), `MaxAge <= 0` treated as a fault, and padding in `b` rejected. It also admits the weak "other operations" test, which agrees with H4.
- Differences between plan and diff: none that matter. The plan says the `login_binding.go` is "`body_keys`-style"; it is.
- The plan's "run, passed (PostgreSQL 16)" matches my run.

## Rule checks

- Only `handler/` imports `internal/api`: yes (grep found no other importer).
- Repository queries filter by `user_id`: not applicable, no repository code changed.
- `users.version` incremented in every write transaction: not applicable, no write path changed.
- `go.mod` `go` and `toolchain` lines unchanged and no dependency added: yes (`git diff` of `go.mod` is empty).
- Order in `Complete`: `verifyState` (size, signature, payload, expiry, `b` shape) then `bindingMatches` then code check then `Exchange` then `StartSession`. The IdP is not called before the binding is verified. A state failure returns no return-to; a binding or code failure returns the verified return-to. Met.
- `bindingMatches` uses `hmac.Equal` on decoded bytes, rejects empty and over-128-byte values, and fails closed on a decode error. Met.
- Middleware (`handler/login_binding.go`): uses `Request.Cookie`, so an absent or malformed header does not fail or panic, and only the first parseable cookie is recorded. Registered only for `authCallback`. Met.
- `Begin` uses one binding for both states (normal and fallback), a fresh `crypto/rand` value per call, and never puts the binding in the state or URL. Met.
- Clearing cookies: `clearLoginBindingCookie` is `loginBindingCookie("", -1, secure)`, so name, path, `HttpOnly`, `Secure` and `SameSite` are the same as the cookie it clears. The logout clears (`authLogoutResponse`) match `authCookies` on name, path, `HttpOnly` (session yes, csrf no), `Secure` and `SameSite`. Met.
- Logging: the only `slog` call in the login path is `handler/auth.go:72`, which logs the error value for non-`ErrInvalidLogin` failures. It logs no binding, state, code or cookie. `adaptor/oidc.go:97` wraps `status` and the IdP's `error` code string (`%q`) only, not the request code or a token. The IdP's own error code is third-party text, so it could in theory carry anything; it is not a secret we hold. Met.
- Cookie writing: `AuthLogin` builds the cookie with `http.Cookie.String()` through the generated `SetCookie` header, as the task asks.

## Mutation checks (each reverted; `git status` clean after)

| Mutation | Result |
|---|---|
| Skip the binding check in `Complete` | Fails: `TestLoginService_CompleteRequiresTheBinding`, `...CompleteSizeLimits`, `TestAuthFlow_LoginCSRFIsRefused`, `TestAuthFlow_SecondTabWins`, `TestAuthFlow_FailureRedirectCarriesNoBindingOrState` |
| Drop the 128-byte cap | Fails: `TestLoginService_CompleteSizeLimits` |
| Let a state without `b` pass (weaken the check to `&&`) | Fails: `...CompleteRejectsAStateMissingAField` (no binding, 31 bytes, 33 bytes) |
| Drop `HttpOnly` from the binding cookie | Fails: `TestAuthLogin`, `TestAuthCallback_Binding`, `TestAuthCallback_Redirects` |
| Change `Path` | Fails: the same three |
| Stop clearing the cookie on failure | Fails: `TestAuthCallback_Binding` (only this one; the round-trip tests do not look at the clearing on failure) |
| `==` instead of `hmac.Equal` | No test fails, as expected: it is a timing property. Read instead: the code uses `hmac.Equal` |

## Inputs tried

- Cookie of 0, 128 and 129 bytes: covered by `CompleteRequiresTheBinding` and `CompleteSizeLimits`. 0 and 129 are refused, 128 succeeds.
- Cookie with a space, with non-ASCII bytes, an invalid first cookie then a good one, two `Cookie` headers: I added three rows to `TestRecordLoginBinding` in `login_binding_test.go` (space is passed through as Go parsed it; non-ASCII is dropped by Go and counts as absent; an invalid first cookie is skipped and the next parseable one is used). They pass.
- State `b` empty, missing, not base64url, padded: covered (`CompleteRejectsAStateMissingAField`), all refused with no return-to.
- Expired state with its own valid cookie: refused (`TestLoginService_StateExpiry` uses the real binding, so the expiry is what fails).
- `error=access_denied` with no state and no cookie: `access_denied` redirect, no session, no token call.
- `return_to` full of JSON-escaped characters: falls back to `/` and the login still works (`BeginFallsBackWhenStateWouldBeTooLong`).
- Concurrent callbacks: `TestAuthFlow_ConcurrentCallbacksStartOneSession` still passes with the cookie.

## Findings

### Blocking

None.

### Non-blocking

1. `TestRecordLoginBinding_OnlyForTheCallback` cannot show that other operations record nothing; only the `router.go` registration does. Fine as is.
2. The round-trip tests do not check that a failure clears `login_binding`; only the handler-level `TestAuthCallback_Binding` does (mutation "stop clearing on failure" fails only that test). Enough for the criterion.
3. The fallback test uses `"` (2 bytes escaped), not `<` (6 bytes). Same code path, so no gap in behavior.
4. The `Complete` doc comment in `usecase/login.go` has one overlong line after the rewrite (cosmetic).
5. Plan names two tests slightly differently from the code (see Plan check).

Test files touched by me: `backend/internal/handler/login_binding_test.go` (three table rows). No source changed.
