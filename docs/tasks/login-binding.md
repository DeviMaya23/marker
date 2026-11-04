# Task: Login binding

Backend only. One builder agent on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Prerequisite

The contract change is already on `main`: `openapi.yaml` and `docs/api.md` describe the `login_binding` cookie on `authLogin`, the failure redirect on `authCallback` (optional `code`, `state` and `error`; no `400`), and the cookie clearing on `authLogout`, and `make generate` has been run. If `openapi.yaml` does not say so, stop and ask.

## Goal

Close login CSRF. Today the login `state` is signed, so the server knows it issued it, but nothing ties it to the browser that asked for it. An attacker can start a login with their own account, stop before the callback, and get a victim to open the callback URL: the victim's browser is then signed in as the attacker, and what they save lands in the attacker's account. After this task, `/auth/login` sets a short-lived cookie that only the browser that started the attempt holds, and `/auth/callback` refuses any attempt whose cookie does not match its `state`.

Requirements covered: FR-1 (a user logs in through the identity provider; it must keep working). No numbered requirement states login CSRF protection: NFR-7 is about data isolation between users and NFR-13 about state-changing API requests, and neither describes a login `GET`. The authority for this task is the contract text of `authLogin` and `authCallback` in `openapi.yaml` (and `docs/api.md`); the verifier reports against that text and against FR-1, and says that no requirement ID covers the binding. (The user may add a requirement.)

Out of scope, with the reason for each:
- The message on the `/login` screen for `?error=login_failed` and `?error=access_denied`: a separate frontend task.
- A different account switch rule, "remember me", or a login state kept on the server (a table): the cookie needs no storage.
- Cookie tossing from a sibling subdomain (see Known gaps).
- Callback answers that are not redirects: a query key sent twice (`?state=a&state=b`, rejected by the generated parameter binding with a problem `400` before the handler), a `429` from the rate limiter, and a `501` when OIDC is not configured. They do not clear the cookie. See Known gaps.
- Rate limiting of the login routes: the `rate-limiting` task.
- The dev login (`GET /auth/dev-login`): it has no identity provider round trip and is not in the contract.

## What is already on `main`

Another agent committed these parts together with the contract change. They are not reviewed. Do not rewrite them; make them hold under the acceptance criteria below, and fix them where a test shows they do not. The verifier checks all of them, not only your diff.

- `AuthCallback` (`handler/auth.go`): every failure redirects to `/login?error=<code>` (`access_denied` when the request's `error` is `access_denied`, otherwise `login_failed`), logs a non-`ErrInvalidLogin` failure with `slog`, adds `&return_to=` when `Complete` returned one, and sets no session cookie. Success sets the `session` and `csrf_token` cookies and redirects to the validated `return_to`.
- Every callback outcome clears the `login_binding` cookie (`MaxAge` -1, `Path=/auth/callback`).
- `LoginService.Complete` returns the state's return-to on failure once the state verified, and nothing for an unverified state.
- `AuthLogout` clears the `session` and `csrf_token` cookies with a custom response (`authLogoutResponse`) and returns `{logout_url}`.
- Their tests in `handler/auth_test.go`, `handler/auth_flow_test.go` and `usecase/login_test.go`.

What is **not** there: nothing sets the `login_binding` cookie, and nothing checks it.

## Role and ownership

Role: Backend, see `AGENTS.md`.

You may change `backend/**` except `backend/migration/` and `backend/internal/api/` (generated). You may not change `openapi.yaml`, `oapi-codegen.yaml`, `docs/**` (except your own plan file, `docs/tasks/login-binding.plan.md`, see `AGENTS.md`), `STACK.md`, `CONVENTIONS.md`, the frontend, migrations or the Makefile.

Shared files: you change `usecase/login.go`, `usecase/login_state.go`, `handler/auth.go`, `handler/cookies.go`, `handler/router.go` (one line, the per-operation middleware for `authCallback`) and the auth tests, and add a small file in `handler/`. `rate-limiting` also changes `handler/router.go`, so the two do not run together: the one that starts second starts after the first has merged. Frontend tasks can run alongside.

## Operations used

`authLogin` (`GET /auth/login`) and `authCallback` (`GET /auth/callback`), real on the server. Types come from the generated code. Nothing in the contract changes. Note what the contract says: `authLogin`'s `302` carries `Set-Cookie`; `authCallback` has only a `302` and a `429`; on failure it redirects, never returns JSON.

## Behavior

### 1. `/auth/login` sets the binding cookie

- Begin makes a random binding value: 32 bytes from `crypto/rand`, base64url without padding (43 characters), a fresh one per call.
- The signed state gets a new field, JSON key `b`, holding `base64url(HMAC-SHA256(StateSecret, "bind:" + binding))` (43 characters). Both states `Begin` can mint (the normal one and the fallback with return path `/`) carry the hash of the same binding value, since one cookie is set per call. The binding value itself is never put in the state or in any URL.
- The `302` to the identity provider carries one `Set-Cookie`, built with `http.Cookie.String()` and set through the generated response's `SetCookie` header: name `login_binding`, the binding value, `Path=/auth/callback`, `Max-Age` 600 (the state's 10 minutes), `HttpOnly`, `SameSite=Lax`, and `Secure` exactly when the other auth cookies are (`s.secureCookies`; the contract text writes `Secure` plainly, but like the session cookies it is off for local `http`).
- `maxStateLen` (12,288 bytes) still holds: with the new field the longest state Begin can mint (a `return_to` of the maximum length) is still below it, and the existing fallback (replace a too-long return path with `/`) still applies. Keep the test that proves it; extend it if it measured the old size.
- A second `/auth/login` in another tab replaces the cookie (same name and path). The first attempt's callback then fails (below): the later attempt wins.
- `AuthLogin` never sets a cookie from an empty `Binding` or a `MaxAge` of 0 (a `MaxAge` of 0 would omit `Max-Age` and make a session cookie): it treats that as a fault (`500` through the error handler, no cookie), with a test.
- Begin keeps failing exactly as before for a bad secret, random failure or IdP URL failure (`500` through the error handler, no cookie set).

### 2. `/auth/callback` requires the binding

Checks run in this order, and the first failure decides; every failure is `domain.ErrInvalidLogin` and the existing failure redirect (`login_failed`, or `access_denied` when the request's `error` is `access_denied`):

1. The `state`: size, signature, payload and expiry, as today, and now also the binding field: absent, empty, not base64url, or not 32 bytes after decoding is invalid, like a missing nonce. No return-to is known after this failure.
2. **The binding:** the request's `login_binding` cookie must be present and at most 128 bytes, and its `HMAC(StateSecret, "bind:" + cookie value)` must equal the state's hash (compare the decoded bytes with `hmac.Equal`). A missing, empty, over-long or mismatched cookie fails here, with the verified state's return-to returned for the redirect. A state minted before the deploy has no binding field and fails in step 1.
3. The `code` (empty or longer than 2,048 bytes), as today.
4. The code exchange with the identity provider, as today. **Steps 1 and 2 run before the identity provider is called**: a request without a matching binding never reaches the token endpoint.
5. Starting the session, as today.

The cookie reaches the handler through an operation middleware for `authCallback` in `handler/`, in the style of `recordBodyKeys`: it reads the `login_binding` cookie from the request (absent is not an error there; it uses `Request.Cookie(name)`, so a cookie Go's parser drops, for example one with invalid bytes, counts as absent, the first cookie of that name that parses is used, and surrounding quotes on a value are stripped by Go) and puts its value in the request context; the handler reads it from the context. Register it in the existing per-operation middleware map in `router.go`. The cookie is cleared on every outcome (already done).

### 3. What the browser sees

- Success: `302` to the validated `return_to`, with `session`, `csrf_token` set and `login_binding` cleared.
- Any failure, including a missing or wrong binding: `302` to `/login?error=login_failed[&return_to=<path>]` and `login_binding` cleared; no session cookie. No JSON, no text, nothing about the binding in the answer, and no difference the caller can read between "no cookie" and "wrong cookie".
- The `Location` of a failure never carries anything but the code and a re-validated `return_to`.

### Known gaps

- Cookie tossing: a script on a sibling subdomain of the app's domain could set a `login_binding` cookie in the victim's browser (cookies are not isolated by subdomain). An attacker who knows their own binding could then pair it with their own state. A `__Host-` prefix would stop that but needs `Path=/`, which the contract fixes to `/auth/callback`; leave it. It matters only if the app shares a parent domain with untrusted sites.
- Two logins in two tabs: the first one fails and the user logs in again. The failure redirect preserves `return_to` when the state was valid.
- The app keeps no record of used states: the contract's "reused `state`" fails only because the identity provider's code is single use, and the replay is refused at the code exchange, after the binding passes.
- The check is stateless: a callback that carries both a state and its own cookie works until the state expires, however many other logins started since. Only a browser that holds a different cookie is refused.
- The answers listed under Out of scope (a repeated query key, `429`, `501`) are not redirects and do not clear the cookie; the cookie expires by itself in 10 minutes.
- A user whose browser blocks cookies fails every login with `login_failed`; the login screen will say "Login didn't complete. Please try again." (frontend task).
- An attack on the identity provider side (the attacker's account must exist) is not addressed here.

## Structure

By `ARCHITECTURE.md`:
- `usecase/login_state.go`: the new state field and its check; a helper that derives the binding hash from the secret and the value. `loginState` stays the only thing the state carries (add the one field; do not add anything else).
- `usecase/login.go`: `Begin` returns `usecase.LoginAttempt{AuthorizeURL string; Binding string; MaxAge int}` (`MaxAge` in seconds, derived from the state's lifetime, which stays unexported); `Complete` takes the binding value as one more argument and runs steps 1 to 5 in order. The tests that follow the new signatures and the required field: every `Complete(...)` call and the `begin` helper in `usecase/login_test.go`; `CompleteRejectsAStateMissingAField`, the `CompleteSizeLimits` sub-tests that hand-sign a state at exactly the size cap, and any test that builds a `loginState` literal (they need the new field); `TestAuthFlow_StateSignedWithAnotherSecretIsRefused` (it calls `Begin` on a second service); `TestAuthFlow_LoginRoundTrip` and `TestAuthFlow_LogoutDoesNotDependOnTheIdPBeingUp` (they call the callback without a cookie); the `loginSpy` also gains a field that records the binding `Complete` received, which the handler criteria below use; the `loginSpy` and the test "redirects to the identity provider and sets nothing else" in `handler/auth_test.go` (it asserts no `Set-Cookie` and one header, and the `AuthLogin` comment says it sets no cookie: invert both); and every `auth_flow_test.go` test that sends a callback without a cookie (replay, denied, logout, same subject twice, concurrent, return-to and empty-code tests), which must now carry the cookie from their login so they keep testing what they test. The `LoginFlow` interface in `handler/auth.go` changes with them.
- `handler/cookies.go`: a function that builds the binding cookie, and the clearing one (the callback builds it inline now; move it here), next to `authCookies`, so the attributes live in one place. The logout clearing cookies stay where they are, in `authLogoutResponse`.
- `handler/auth.go`: `AuthLogin` sets the cookie; `AuthCallback` reads the binding from the context.
- A new file in `handler/` for the small middleware that records the cookie, with its test.
- `handler/router.go`: one entry in the existing per-operation middleware map.
- `handler/middleware/context.go`: the cookie name constant may live next to `SessionCookie` and `CSRFCookie`; the existing `loginBindingCookie` constant in `auth.go` may move there.

## Dependencies

None. Add nothing to `go.mod`.

## Acceptance criteria

All unit and handler-level tests; no database. State this in the report. Tests use the fake identity provider that `auth_flow_test.go` already uses for the round trip.

**State and usecase (`usecase/login_test.go`)**
- `Begin` returns a binding of 43 base64url characters and a `MaxAge` of 600; two calls return different values; the state (base64url-decoded to its JSON payload) holds the hash in `b` and does not contain the binding value as a substring.
- `Complete` with the right binding succeeds. With no binding, an empty one, a wrong one: `ErrInvalidLogin`, the verified state's return-to returned, and the identity provider never called (the spy's `Exchange` count stays 0). Each of these fails without the check.
- The 128-byte cap: a hand-signed state whose binding hash is for a 129-byte value, sent with that 129-byte value, is refused (it would match without the cap); the same with a 128-byte value succeeds.
- A state with the binding field missing, empty, not base64url or not 32 bytes after decoding is refused with no return-to (the same step as a missing nonce).
- A bad state with the right binding is refused with no return-to. (The order of the binding check and the code check cannot be seen from outside, since both return the same error and call nothing; the verifier checks it by reading `Complete`.)
- A `return_to` of the maximum length still produces a state under 12,288 bytes with the new field (extend the existing size test).

**Handler (`handler/auth_test.go`)**
- `Begin` returning an empty binding or a `MaxAge` of 0 makes `/auth/login` answer `500` and set no cookie.
- `GET /auth/login` answers `302` and sets exactly one cookie: `login_binding`, `HttpOnly`, `SameSite=Lax`, `Path=/auth/callback`, `Max-Age` 600, `Secure` when secure cookies are on and not otherwise, with the value `Begin` returned. `Begin` failing sets no cookie.
- The callback hands the cookie's value to `Complete`: a request with the cookie passes the value, one without passes an empty string, one with two cookies of that name uses the first.
- The cookie middleware does not fail the request when the cookie is absent (the handler decides); it records nothing for other operations.

**Round trip (`handler/auth_flow_test.go`)** (the existing tests keep their intent; their helper `startLogin` now returns the binding cookie too, and callback requests send it)
- Login then callback with the cookie succeeds: the `302` to `return_to`, `session`, `csrf_token` set, `login_binding` cleared, one session.
- **Login CSRF:** start a login as one browser (cookie A), take the callback URL, and send it as another browser with no cookie, and with a different valid cookie B (from a second login): both answer `302` to `/login?error=login_failed`, set no session cookie, create no session, and the fake token endpoint is never called.
- Second tab wins: start login A, then login B (the second `Set-Cookie` replaces the first in the browser). A's callback with B's cookie, which is what the browser then sends, is refused; B's callback with B's cookie succeeds.
- A callback replayed after a success, with the cookie sent again: refused (the code is single use, and the existing replay test keeps passing).
- A cancelled login (`?error=access_denied&state=…`) with a valid binding redirects with `access_denied`; with no cookie it also redirects with `access_denied` (the code comes from the request, not from the binding check).
- An empty or long code with a valid binding still fails with `login_failed` without calling the token endpoint.
- The failure redirects carry only `error` and the validated `return_to`, never the binding or the state.
- Replay of a used state is refused by the identity provider's single-use code, not by any record on our side (the app keeps no list of used states); the replay test says so in a comment.
- The already-present behavior holds: logout clears the `session` and `csrf_token` cookies with `Max-Age` -1 and still returns `{logout_url}`; every callback outcome clears `login_binding`.

**Repo-wide**
- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

- `git diff --stat`: only the allowed paths; `openapi.yaml` and generated code unchanged.
- Read `AuthCallback` and `Complete`: the order is state, binding, code, exchange, session; the identity provider is never called before the binding is verified.
- Break each behavior and see its test fail, then revert exactly (leave the branch as you found it): skip the binding check in `Complete`; compare with `==` instead of `hmac.Equal` (a timing review, not a test); drop `HttpOnly` or `Path`; stop clearing the cookie on failure; let a state without the field pass.
- Read the middleware: it cannot panic on a missing or malformed `Cookie` header, and it records only the first cookie of that name.
- Inputs to try: a cookie value of 0, 128 and 129 bytes; a cookie with spaces or non-ASCII; the state's binding field empty, missing, or not base64url; two `Cookie` headers; the state from one login with the cookie from the same login but after it expired (the state expiry fails first); `error=access_denied` with no `state` and no cookie; a `return_to` full of characters JSON escapes (the fallback to `/` still yields a state under the cap and a working login).
- Confirm no log line includes the binding, the state, the code or any cookie value: read every `slog` call in the login path, and read `adaptor/oidc.go` for an error it wraps that could embed the code or a token (report what you found).
- Confirm the clearing cookies (the callback's, now in `cookies.go`, and the logout ones in `authLogoutResponse`) have the same name, path, `HttpOnly`, `Secure` and `SameSite` as the cookies they clear, differing only in `MaxAge`.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, or an edit to a spec file (for example a contract change so the callback declares the cookie as a parameter).
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.
- The generated types do not allow what this file asks (for example the `authLogin` `302` cannot carry `Set-Cookie`).

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, run `make test-integration-local` (it should be unaffected; report whether it ran and the Postgres version), commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), what you changed in the already-present code and why, dependency versions, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
