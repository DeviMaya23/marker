# Plan: auth-backend

Branch: `claude/auth-backend-task-fdmh8o`. One item per acceptance criterion in `docs/tasks/auth-backend.md`.
Format: `[ ] criterion — file — test`.

## Config (`backend/internal/platform/config/config_test.go`)
- [x] Validate accepts OIDC fully set in production; OIDC + dev login in development; no OIDC + dev login in development — `platform/config/config.go` — `TestValidate` accept rows
- [x] Validate rejects (named variable, value never in error): each of the four other variables missing; state secret 31 bytes (32 ok); issuer / logout URL / APP_BASE_URL not absolute http(s); APP_BASE_URL not https in production with OIDC; required variable without issuer; neither OIDC nor dev login; dev login in production — `config.go` — `TestValidate` reject rows
- [x] Old row "no dev login in production" replaced by "production with OIDC fully set"; `OIDC_LOGOUT_REDIRECT_PARAM` alone is valid; OIDC + dev login in development valid — `config_test.go` — `TestValidate`
- [x] `Load` reads the six variables, redirect param defaults to `redirect` — `config.go` — `TestLoad`

## Return to (`backend/internal/handler/returnto_test.go`)
- [x] 8192 bytes kept, 8193 becomes `/`; existing cases pass — `handler/returnto.go` — `TestSafeReturnTo`

## Usecase (`backend/internal/usecase/login_test.go`, `auth_test.go`)
- [x] Begin then Complete: verifier and nonce match, StartSession gets only the sub, returnTo round-trips (also the save URL), grant returned — `usecase/login.go` (+ `login_state.go`) — `TestLoginService_RoundTrip`
- [x] Two Begin calls give different states and nonces — `login.go` — `TestLoginService_BeginUnique`
- [x] Complete rejects bad states / empty code with ErrInvalidLogin, no Exchange, no StartSession — `login_state.go` — `TestLoginService_CompleteRejects`
- [x] State 12289 bytes rejected undecoded (12288 decoded and rejected for signature); code 2049 rejected, 2048 reaches Exchange — `login_state.go` — `TestLoginService_Limits`
- [x] State expiry boundaries with controlled clock — `login_state.go` — `TestLoginService_StateExpiry`
- [x] Non-ErrInvalidLogin Exchange error stays a fault — `login.go` — `TestLoginService_ExchangeFault`
- [x] Empty sub is ErrInvalidLogin, no session — `login.go` — `TestLoginService_EmptySub`
- [x] Logout: EndSession with id, URL built (encoding, existing query, custom param, error returns empty URL) — `login.go` — `TestLoginService_Logout`
- [x] `AuthService.EndSession` calls DeleteSession — `usecase/auth.go` — `auth_test.go` `TestAuthService_EndSession`

## Adaptor (`backend/internal/adaptor/oidc_test.go`, against `testutil.FakeIDP`)
- [x] AuthorizeURL parameters and S256 challenge — `adaptor/oidc.go` — `TestOIDCClient_AuthorizeURL`
- [x] Exchange returns the sub; fake saw client id/secret, redirect_uri, verifier — `oidc.go` — `TestOIDCClient_Exchange`
- [x] Each rejection (invalid_grant, code reuse, aud, iss, expired, nonce, other key, alg=none, HS256, no id_token, no sub) is ErrInvalidLogin — `oidc.go` — `TestOIDCClient_Rejections`
- [x] Faults (invalid_client, 500, JWKS 500, discovery 500, closed server) are not ErrInvalidLogin — `oidc.go` — `TestOIDCClient_Faults`
- [x] Error text never contains the secret or the code — `oidc.go` — same tests
- [x] Lazy discovery, no poisoning after failure — `oidc.go` — `TestOIDCClient_LazyDiscovery`
- [x] Fake IdP (`testutil/fakeidp.go`, `testutil/doc.go` updated) — exercised by the adaptor and flow tests

## Handler (`backend/internal/handler/auth_test.go`)
- [x] authLogin: 302, Location, no cookie, return_to validation and cap, spy error 500 — `handler/auth.go` — `TestAuthLogin`
- [x] authCallback: 302, two cookies and attributes, Secure on/off, evil return path becomes `/` — `auth.go`, `cookies.go` — `TestAuthCallback`
- [x] authCallback errors: ErrInvalidLogin 400, other 500 with no leak, missing code/state/error-only 400 without spy call, works with and without session cookie — `auth.go`, `problem.go` — `TestAuthCallback_Errors`
- [x] authLogout: 200 body exact and no cookie, spy gets the session id, 401, 403 (missing/wrong token), spy error 500 — `auth.go` — `TestAuthLogout`
- [x] login nil answers 501 on all three — `auth.go` — `TestAuth_NotConfigured`

## Flow (`backend/internal/handler/auth_flow_test.go`)
- [x] Login → fake authorize → callback → cookies, save URL kept, manager holds session — `TestAuthFlow_LoginRoundTrip`
- [x] Callback replay 400 — `TestAuthFlow_ReplayRejected`
- [x] Denied login 400 — `TestAuthFlow_Denied`
- [x] State signed with other secret 400, token endpoint untouched — `TestAuthFlow_ForeignState`
- [x] Logout URL, fake `/logout` redirect, session removed — `TestAuthFlow_Logout`
- [x] Same sub twice — `TestAuthFlow_SameSub`

## Router test (`handler/router_test.go`)
- [x] Comments updated to say 501 because no login service; no rows removed — `router_test.go`

## Repo-wide
- [x] `make check` passes (run, exit 0)
- [x] `make test-integration-local`: run, passed (PostgreSQL 16)
- [x] Only allowed paths changed; `go.mod` `go` directive unchanged; `go.mod`/`go.sum` changed only by the two dependencies

## Judgment calls
- `Config.Validate` checks dev login first, then the OIDC rules. With OIDC off and dev login on, the other four OIDC variables must be empty (a half-configured login is an error even in development).
- `APP_BASE_URL` is checked as an origin only when OIDC is enabled; `Load` already strips a trailing slash, so `Validate` accepts an empty or `/` path.
- `.env.example` ships the four required OIDC variables as empty `NAME=` lines; the config treats an empty value as unset, so a fresh checkout still starts with dev login.
- `LoginService.Begin` takes a `returnTo` already validated by the handler; it only guards the state length (falls back to `/`). A state is "valid" only with a non-empty nonce, non-empty `return_to` and non-zero expiry.
- Fake IdP: knobs are set through `Configure(func(*FakeIDPKnobs))` under a lock. "Stop answering" for JWKS/discovery is covered by closing the whole server (`FakeIDP.Server.Close()`) and by 500 knobs; there is no per-endpoint hang. The fake's RSA keys are generated once per test process.
- Adaptor: a failed key fetch is told apart from a bad signature by a counting `http.RoundTripper` around the IdP HTTP client (go-oidc gives no error type). A failed JWKS request during a verification makes it a fault; concurrent unrelated JWKS failures could turn a bad token into a 500, never the reverse. A transport error from the token endpoint becomes the fixed text "token exchange failed: request error".
- `AuthService.EndSession` wraps the store error as `delete session: %w` (like its other methods).
- Mutation spot checks run by hand (expiry boundary, state signature, nonce, callback `return_to` revalidation, `HttpOnly`, `Secure`, `invalid_grant` mapping): all turned a test red. Restricting `SupportedSigningAlgs` to RS256 alone is not covered by a test of its own (go-oidc's JOSE parsing already rejects `alg=none` and HS256 for an RSA key); the two token tests still pass.
- Nothing was run against real Kinde.
