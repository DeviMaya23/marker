# Plan: auth-backend

Branch: `claude/auth-backend-task-fdmh8o`. One item per acceptance criterion in `docs/tasks/auth-backend.md`.
Format: `[ ] criterion — file — test`.

## Config (`backend/internal/platform/config/config_test.go`)
- [ ] Validate accepts OIDC fully set in production; OIDC + dev login in development; no OIDC + dev login in development — `platform/config/config.go` — `TestValidate` accept rows
- [ ] Validate rejects (named variable, value never in error): each of the four other variables missing; state secret 31 bytes (32 ok); issuer / logout URL / APP_BASE_URL not absolute http(s); APP_BASE_URL not https in production with OIDC; required variable without issuer; neither OIDC nor dev login; dev login in production — `config.go` — `TestValidate` reject rows
- [ ] Old row "no dev login in production" replaced by "production with OIDC fully set"; `OIDC_LOGOUT_REDIRECT_PARAM` alone is valid; OIDC + dev login in development valid — `config_test.go` — `TestValidate`
- [ ] `Load` reads the six variables, redirect param defaults to `redirect` — `config.go` — `TestLoad`

## Return to (`backend/internal/handler/returnto_test.go`)
- [ ] 8192 bytes kept, 8193 becomes `/`; existing cases pass — `handler/returnto.go` — `TestSafeReturnTo`

## Usecase (`backend/internal/usecase/login_test.go`, `auth_test.go`)
- [ ] Begin then Complete: verifier and nonce match, StartSession gets only the sub, returnTo round-trips (also the save URL), grant returned — `usecase/login.go` (+ `login_state.go`) — `TestLoginService_RoundTrip`
- [ ] Two Begin calls give different states and nonces — `login.go` — `TestLoginService_BeginUnique`
- [ ] Complete rejects bad states / empty code with ErrInvalidLogin, no Exchange, no StartSession — `login_state.go` — `TestLoginService_CompleteRejects`
- [ ] State 12289 bytes rejected undecoded (12288 decoded and rejected for signature); code 2049 rejected, 2048 reaches Exchange — `login_state.go` — `TestLoginService_Limits`
- [ ] State expiry boundaries with controlled clock — `login_state.go` — `TestLoginService_StateExpiry`
- [ ] Non-ErrInvalidLogin Exchange error stays a fault — `login.go` — `TestLoginService_ExchangeFault`
- [ ] Empty sub is ErrInvalidLogin, no session — `login.go` — `TestLoginService_EmptySub`
- [ ] Logout: EndSession with id, URL built (encoding, existing query, custom param, error returns empty URL) — `login.go` — `TestLoginService_Logout`
- [ ] `AuthService.EndSession` calls DeleteSession — `usecase/auth.go` — `auth_test.go` `TestAuthService_EndSession`

## Adaptor (`backend/internal/adaptor/oidc_test.go`, against `testutil.FakeIDP`)
- [ ] AuthorizeURL parameters and S256 challenge — `adaptor/oidc.go` — `TestOIDCClient_AuthorizeURL`
- [ ] Exchange returns the sub; fake saw client id/secret, redirect_uri, verifier — `oidc.go` — `TestOIDCClient_Exchange`
- [ ] Each rejection (invalid_grant, code reuse, aud, iss, expired, nonce, other key, alg=none, HS256, no id_token, no sub) is ErrInvalidLogin — `oidc.go` — `TestOIDCClient_Rejections`
- [ ] Faults (invalid_client, 500, JWKS 500, discovery 500, closed server) are not ErrInvalidLogin — `oidc.go` — `TestOIDCClient_Faults`
- [ ] Error text never contains the secret or the code — `oidc.go` — same tests
- [ ] Lazy discovery, no poisoning after failure — `oidc.go` — `TestOIDCClient_LazyDiscovery`
- [ ] Fake IdP (`testutil/fakeidp.go`, `testutil/doc.go` updated) — exercised by the adaptor and flow tests

## Handler (`backend/internal/handler/auth_test.go`)
- [ ] authLogin: 302, Location, no cookie, return_to validation and cap, spy error 500 — `handler/auth.go` — `TestAuthLogin`
- [ ] authCallback: 302, two cookies and attributes, Secure on/off, evil return path becomes `/` — `auth.go`, `cookies.go` — `TestAuthCallback`
- [ ] authCallback errors: ErrInvalidLogin 400, other 500 with no leak, missing code/state/error-only 400 without spy call, works with and without session cookie — `auth.go`, `problem.go` — `TestAuthCallback_Errors`
- [ ] authLogout: 200 body exact and no cookie, spy gets the session id, 401, 403 (missing/wrong token), spy error 500 — `auth.go` — `TestAuthLogout`
- [ ] login nil answers 501 on all three — `auth.go` — `TestAuth_NotConfigured`

## Flow (`backend/internal/handler/auth_flow_test.go`)
- [ ] Login → fake authorize → callback → cookies, save URL kept, manager holds session — `TestAuthFlow_LoginRoundTrip`
- [ ] Callback replay 400 — `TestAuthFlow_ReplayRejected`
- [ ] Denied login 400 — `TestAuthFlow_Denied`
- [ ] State signed with other secret 400, token endpoint untouched — `TestAuthFlow_ForeignState`
- [ ] Logout URL, fake `/logout` redirect, session removed — `TestAuthFlow_Logout`
- [ ] Same sub twice — `TestAuthFlow_SameSub`

## Router test (`handler/router_test.go`)
- [ ] Comments updated to say 501 because no login service; no rows removed — `router_test.go`

## Repo-wide
- [ ] `make check` passes
- [ ] `make test-integration-local`: not yet run
- [ ] Only allowed paths changed; `go.mod` `go` directive unchanged; `go.mod`/`go.sum` changed only by the two dependencies

## Judgment calls
(filled in at the end)
