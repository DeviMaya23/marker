# Task: Kinde login and logout (back end)

> One backend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> **This task is built and tested against a fake identity provider only.** The cloud session that builds it cannot reach Kinde and never sees the Kinde client secret. Everything that depends on how real Kinde behaves is written below as an assumption (see "Assumptions to verify against real Kinde"), and the user checks each one by hand afterwards (see "Manual checks against real Kinde"). Do not try to reach Kinde, do not ask for the secret, and do not put any Kinde value in a file.
>
> **Prerequisite:** `STACK.md` lists `go-oidc` (`github.com/coreos/go-oidc/v3`) and `golang.org/x/oauth2` as adopted, each with a version (the "Suggested, not yet adopted" line no longer names them). Check it before you start. If it does not, stop and ask; do not add them yourself. Also check that `NewServer` takes five arguments (`bookmarks, folders, sync, favicons, account`) and that `handler/account.go` exists (`delete-account` is merged). If either is missing, stop and ask.
>
> The contract needs no change: `authLogin`, `authCallback` and `authLogout` exist in `openapi.yaml` with the statuses, headers and cookies this file uses and no more. If something here contradicts `openapi.yaml`, stop and ask; do not edit it.

## Goal

A person can sign in through Kinde and sign out again, through the three auth operations: `authLogin` starts the Kinde login and remembers where to return to, `authCallback` completes it, creates the user on first login and the app session, sets the two cookies and sends the browser on, and `authLogout` ends the app session and hands back the Kinde logout URL. The login screen, the log out button and the account menu are separate front-end tasks.

Requirements covered:

- FR-1 (login through the external IdP; the app stores no credentials; anyone can sign up): the round trip is proven by the flow test below. That a first-time `sub` creates a user is not re-tested here: it relies on the existing `usecase/auth_test.go` and `repository/user_integration_test.go`, which must still pass.
- FR-2 (logout ends the app session, and the response carries the IdP logout URL with a redirect back to the app so the IdP session can end too). The IdP side is checked by hand (manual check 5).
- FR-3c (a login started from the save page returns to the same page with the same parameters), proven by the return-to tests.
- NFR-7, the part this task owns (the user is keyed on the IdP subject, not an email; no password or email is stored or read), proven by the usecase test that `StartSession` receives the `sub` and nothing else. Data isolation itself is built and tested elsewhere.
- NFR-13 (the login sets the `HttpOnly` session cookie and the readable `csrf_token` cookie, both `SameSite=Lax`, proven by the handler tests; logout is CSRF-protected by the router, token and `Origin` check, whose existing router tests already cover `POST /auth/logout` and must still pass).
- NFR-15 (a login starts a session with the existing 30-day sliding and 90-day absolute limits), already built in `AuthService.StartSession`; this task calls it and a test proves the cookie lifetime follows `Grant.ExpiresAt`. The part "an expired session sends the user through login and then back" is the front end's job (it calls `/auth/login?return_to=…` on a 401); this task proves only that `return_to` survives the round trip.

Out of scope, and why:

- The login screen (screen 1), the log out button, the sidebar account menu (screen 6) and "a way to learn you are signed out without waiting for a 401" (a who-am-I endpoint): front-end tasks, and the backlog already lists them. A who-am-I endpoint is not in `openapi.yaml`, so it is a contract change for the user to decide, not part of this task.
- Rate limiting of the login routes (NFR-16): not built at all. The contract lists `429` for these operations and this task does not produce it; the limiter task does.
- Reaching real Kinde, and any file or log line that holds the client secret. The user does the manual checks.
- Clearing the `session` and `csrf_token` cookies on logout: the contract's `200` lists no `Set-Cookie`, so a response cannot carry it. The cookies stay in the browser, dead (the session row is gone, so the next request is `401`), as in `delete-account`. See "Known gaps".
- Binding a login attempt to the browser that started it (a cookie on the `/auth/login` redirect): the contract's login `302` lists only `Location`, and the user chose a signed `state` instead. See "Known gaps".
- Storing an email, a name or the ID token: only `sub` is used. A logout that needs `id_token_hint` would need the ID token stored with the session, which is a migration; the user's assumption is that Kinde does not need it.
- A migration, a change to `sessions` or `users`, a change to `openapi.yaml`, the generated code, `docs/**` or the frontend.
- Deleting the Kinde account (FR-25 says it is untouched), IdP-initiated or back-channel logout, a second IdP.

## Role and ownership

Role: Backend (see `AGENTS.md`).

You may change `backend/**` except `backend/migration/` and `backend/internal/api/` (generated). You may also change `.env.example` at the repository root, to document the new variables (see "Configuration"). You may not change `openapi.yaml`, `oapi-codegen.yaml`, `STACK.md`, `docs/**` (except your own plan file, `docs/tasks/auth-backend.plan.md`, see `AGENTS.md`), `CONVENTIONS.md`, the frontend, migrations or the Makefile.

**Shared files.** No other backend task may run at the same time: this task changes `handler/server.go`, `handler/router_test.go`, `handler/problem.go`, `cmd/server/main.go`, `platform/config/config.go`, `go.mod` and `go.sum`. A front-end task may run at the same time; it touches only `frontend/**` (`account-area` is a front-end task and does not overlap). `NewServer(` gets two new last arguments, so you change every call site: find them with `grep -rn "NewServer(" backend` (at least `handler/account_test.go`, `handler/folders_test.go`, `handler/devlogin_test.go`, `handler/favicon_test.go`, `handler/bookmarks_test.go`, `handler/sync_test.go`, `handler/router_test.go` and `cmd/server/main.go`) and pass `nil, false` in tests that do not use the login service. You are the only agent that may change `go.mod` and `go.sum` now.

## Operations used

- `authLogin` (`GET /auth/login`, query `return_to` optional), a 501 stub today. Real response: `302` with a `Location` header (generated `api.AuthLogin302Response`). Public (`security: []`).
- `authCallback` (`GET /auth/callback`, queries `code` and `state`, both required), a 501 stub today. Real responses: `302` with `Location` and `Set-Cookie`, and `400` `application/problem+json` (the contract's "Invalid or expired login attempt"). Public.
- `authLogout` (`POST /auth/logout`, header parameter `X-CSRF-Token`), a 501 stub today. Real responses: `200` with `{"logout_url": "<uri>"}` (generated `api.AuthLogout200JSONResponse`), `401`, `403`. The session and CSRF checks are applied by the router (`policyRouter`), as for every other write.

The routes are served at the root (`/auth/...`), not under `/api/v1`, and `publicPaths` in `router.go` already exempts login and callback from the session check. No router change is needed. Only `handler/` imports `internal/api`. `429` is in the contract for all three and is not produced here.

The contract lists no `Set-Cookie` on the login `302` and on the logout `200`, no `Cache-Control` or other header on any of them, and no status besides those above. Do not add one. If you think one is needed, stop and ask.

## Stated facts

From the user, for this task. Do not change them and do not add others.

- The identity provider is Kinde, through the standard OIDC authorization-code flow, with this backend as a confidential client (`STACK.md`).
- The issuer URL is configuration, not code. Endpoints are found by OIDC discovery from the issuer (`go-oidc` `NewProvider`).
- Scope: `openid` only. The only claim used is `sub`. `users.idp_id` stores it.
- Local development callback URL: `http://localhost:5175/auth/callback`. Local development logout redirect: `http://localhost:5175/`. Both are `APP_BASE_URL` plus a fixed path; do not add separate settings for them.
- Production URLs are not decided. Nothing in the code may hold a production URL.
- The Kinde client secret is never in a file, a test, a log or the chat: it comes from the environment only.

## Assumptions to verify against real Kinde

The code is written for these. Each is untested against real Kinde and appears in the manual checks. Each configurable one is an environment variable, so a wrong guess is a configuration change, not a code change. Do not "fix" one by guessing differently.

1. `sub` is stable and unique per user: the same person always gets the same `sub`, whatever sign-in method they use, and two people never share one.
2. Logout needs no `id_token_hint`: the logout URL is the configured logout endpoint plus one query parameter holding the URL to return to. The user's best guess is `https://<kinde-domain>/logout` with a parameter named `redirect`. Unverified; both are settings (`OIDC_LOGOUT_URL`, `OIDC_LOGOUT_REDIRECT_PARAM`).
3. The Kinde logout endpoint accepts the app's own origin URL (`APP_BASE_URL` + `/`) as the return address, which may need registering in Kinde, and still redirects when the Kinde session is already gone.
4. Kinde accepts PKCE `S256` from a confidential client, signs ID tokens with `RS256`, and accepts the full callback URL as `redirect_uri` by exact match.
5. Kinde's discovery document `issuer` equals the configured issuer URL exactly (including no trailing slash). `go-oidc` refuses a mismatch.
6. Kinde accepts a `state` value of about 11 KB (see "Behavior", the longest `return_to`). If it has a shorter limit, `maxReturnToLen` has to come down.
7. The token endpoint authenticates the client by whichever style `x/oauth2` detects (`AuthStyleAutoDetect`); no setting is needed.
8. `openid` alone puts `sub` in the ID token, so no call to the userinfo endpoint is needed.

## Configuration

All from environment variables, read in `platform/config` (`Load`). The fake IdP needs none of them: tests build the values directly.

| Variable | Meaning | Default |
|---|---|---|
| `OIDC_ISSUER_URL` | The issuer, as Kinde publishes it. No trailing-slash handling: used exactly as given | none |
| `OIDC_CLIENT_ID` | The application's client ID | none |
| `OIDC_CLIENT_SECRET` | The client secret. Never logged, never in `.env.example` with a value | none |
| `OIDC_LOGOUT_URL` | The IdP logout endpoint, a full URL | none |
| `OIDC_LOGOUT_REDIRECT_PARAM` | The name of the query parameter that carries the return address | `redirect` |
| `AUTH_STATE_SECRET` | Key that signs the login `state` and derives the PKCE verifier. The string's own bytes are the key (no base64 or hex decoding); at least 32 bytes | none |

These names are new (the task chose them); `APP_BASE_URL` already exists. The redirect URI sent to Kinde is `APP_BASE_URL` + `/auth/callback`; the logout return address is `APP_BASE_URL` + `/`.

`Config.Validate` (extend it; keep the existing dev-login rule):

- OIDC login is **enabled** when `OIDC_ISSUER_URL` is set. When enabled, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_LOGOUT_URL` and `AUTH_STATE_SECRET` must all be set, `OIDC_ISSUER_URL` and `OIDC_LOGOUT_URL` must be absolute `http` or `https` URLs with a host, and `AUTH_STATE_SECRET` must be at least 32 bytes. The error names the variable, never its value.
- Any of the other four required variables set while `OIDC_ISSUER_URL` is empty is an error ("`OIDC_CLIENT_ID` is set but `OIDC_ISSUER_URL` is not"): a half-configured login must not look like a working dev setup.
- When OIDC is enabled, `APP_BASE_URL` must be an absolute `http` or `https` URL with a host and no path, query or fragment, and must be `https` when `APP_ENV=production` (other environments may use `http`). It is the source of the redirect URI and the logout return address.
- Neither OIDC enabled nor `AUTH_DEV_LOGIN=true` is an error: the server cannot sign anyone in. (`.env.example` ships with `AUTH_DEV_LOGIN=true`, so a fresh checkout still starts.)
- OIDC not enabled and `AUTH_DEV_LOGIN=true` (development only, as today) is valid. In that case `main` passes no login service, and the three operations answer `501 not_implemented` as stubs do today.

`.env.example`: add the six variables with a short comment each, `OIDC_CLIENT_SECRET` and `AUTH_STATE_SECRET` with no value, and `OIDC_LOGOUT_REDIRECT_PARAM=redirect` commented out as the default. State in the comment that the logout values are unverified guesses.

## Behavior

### authLogin

1. `return_to` is validated with `safeReturnTo` (`handler/returnto.go`): a same-origin relative path, else `/`. Extend `safeReturnTo` with one more rule: a value longer than `maxReturnToLen` = 8192 bytes becomes `/`. Exactly 8192 is kept; 8193 is `/`. (8192 covers the longest save-page path NFR-14 allows, about 7 KB when a 2,048-character URL and a 300-character title are percent-encoded; the user chose it over 4096 so FR-3c is not lost for valid saves.) `devlogin.go` uses `safeReturnTo` too and gets the cap with it; that is intended.
2. The handler asks the login service to begin: it returns the IdP authorize URL for this attempt (below).
3. Respond `302` with `Location` set to that URL. No cookie, no other header.

The authorize URL has the issuer's `authorization_endpoint` from discovery and these query parameters: `client_id`, `redirect_uri` (`APP_BASE_URL` + `/auth/callback`), `response_type=code`, `scope=openid`, `state`, `nonce`, `code_challenge`, `code_challenge_method=S256`. No `prompt`, no other scope.

**The signed state** (the user chose this over a cookie, a store or a table). `state` is `base64url(payload) + "." + base64url(HMAC-SHA256(AUTH_STATE_SECRET, payload))`, no padding. The payload is JSON with three fields: a random 32-byte nonce (base64url), the `return_to`, and the expiry as Unix seconds. Its lifetime is 10 minutes (`loginStateTTL`, a constant). The PKCE verifier is not in the state: it is `base64url(HMAC-SHA256(AUTH_STATE_SECRET, "pkce:" + nonce))`, 43 characters, derived again at the callback. The `nonce` parameter sent to Kinde is the same random nonce. Encode the JSON with HTML escaping off (`SetEscapeHTML(false)`), so `&` stays one byte. The longest `state` is then about 11 KB (an 8192-byte `return_to` whose `"` and `\` characters, if any, take two bytes in JSON, base64url expanded by a third, plus the signature). A random-number failure while making the nonce is a `500 internal_error`. If the encoded state would still be longer than `maxStateLen` (a `return_to` full of `"` or control characters), `Begin` uses `/` as the `return_to` instead, so it never mints a state that `Complete` would refuse.

Failure: if the IdP cannot be reached for discovery, `500 internal_error`. Nothing else can fail here.

### authCallback

Order of checks (stop at the first failure):

1. Missing `code` or `state`: the generated wrapper answers `400 validation_error`. This includes the user cancelling at Kinde (Kinde redirects with `error=access_denied` and no `code`). The service is not called.
2. Verify `state`: not longer than `maxStateLen` = 12288 bytes (checked first, before any decoding), well-formed (exactly one `.`, both halves valid base64url, payload valid JSON with all three fields), the signature matches (`hmac.Equal`, constant time), and the expiry is in the future (compare whole seconds: `now.Unix() < expiry`; at exactly the expiry second it is expired, one second before it is valid). Any failure: `domain.ErrInvalidLogin`. No call to the IdP is made for a bad state.
3. An empty `code` string, or one longer than 2048 bytes: `domain.ErrInvalidLogin`, no call to the IdP.
4. Exchange the code at the token endpoint with the derived PKCE verifier and `redirect_uri`, then verify the ID token: signature against the JWKS from discovery (RS256 only, `go-oidc`'s default), `iss` equals the issuer, `aud` contains the client ID, not expired, and its `nonce` claim equals the state's nonce. A missing ID token, a missing or empty `sub`, or any check failing: `domain.ErrInvalidLogin`.
5. `AuthService.StartSession(ctx, sub)` (existing): finds or creates the user by `idp_id` = `sub`, creates the session, returns the `Grant`.
6. Respond `302`, `Location` = `safeReturnTo` of the state's `return_to` (validated again here; the state is signed, but the check is cheap and keeps the open-redirect rule in one place), and two `Set-Cookie` headers: `session` (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `APP_BASE_URL` is https) and `csrf_token` (same, not `HttpOnly`). Both `Max-Age` follow `Grant.ExpiresAt`, as `setAuthCookies` does for dev login.

The generated `AuthCallback302Response` can carry one `Set-Cookie` string only, and a header cannot hold two cookies. So the handler returns its own response type that implements `api.AuthCallbackResponseObject` (`VisitAuthCallbackResponse(w http.ResponseWriter) error`) and writes the two cookies with `http.SetCookie`. The cookie construction is shared with `setAuthCookies` in `handler/cookies.go`: pull the two `http.Cookie` values into one function that both use, and do not copy the attributes.

**Which failures are a bad login and which are a server fault.**

| Situation | Status | Code |
|---|---|---|
| `code` or `state` missing | `400` | `validation_error` (generated wrapper) |
| `state` malformed, wrongly signed, or expired; empty `code` | `400` | `validation_error` |
| Token endpoint answers the OAuth error `invalid_grant` (code reused, expired, or wrong verifier) | `400` | `validation_error` |
| ID token missing, wrongly signed, wrong `iss`, wrong `aud`, expired, wrong `nonce`, no `sub` | `400` | `validation_error` |
| Token endpoint answers any other error (`invalid_client`, a 5xx, a non-OAuth reply), the JWKS or discovery cannot be fetched, the network fails | `500` | `internal_error` |
| `StartSession` fails (database) | `500` | `internal_error` |

`invalid_client` is a `500` on purpose: it means the app's own credentials are wrong, which is not the user's fault and must not look like a bad login. The `400` is the contract's "Invalid or expired login attempt": it uses the existing `validation_error` code, because the contract has no login-specific code (a new code would be a contract change). The body is the usual problem JSON with title `Invalid login attempt`. Add a `domain.ErrInvalidLogin` sentinel and one row to `domainProblems` in `problem.go` (status 400, code `validation_error`, that title). The browser shows this JSON as a page; the user accepted that.

A request that already carries a valid `session` cookie is handled the same as any other: a new session is created and the new cookies replace the old ones; the old session row is left to expire.

### authLogout

1. The caller's session is `middleware.AuthFrom(ctx).SessionID`. No `Auth` in the context: `domain.ErrUnauthenticated`, as every handler does.
2. Delete that session (`SessionStore.DeleteSession`, existing). A session row that is already gone is not an error (the delete removes zero rows). A database error: `500`, and no URL is returned (the session may still be alive).
3. Build the logout URL: parse `OIDC_LOGOUT_URL`, set the query parameter named `OIDC_LOGOUT_REDIRECT_PARAM` (default `redirect`) to `APP_BASE_URL` + `/`, keeping any query parameters already on `OIDC_LOGOUT_URL`, and re-encode.
4. Respond `200` with `{"logout_url": "<that URL>"}`. No cookie, no other header.

What it does when the Kinde session is already gone: nothing different. The server cannot know; it returns the same URL and Kinde decides (assumption 3). When the app session is already gone, the router answers `401` first (the contract's `401`).

### Not configured

When `main` passes no login service (OIDC not enabled, dev login on), all three operations return `ErrNotImplemented` (`501 not_implemented`), exactly as the stubs do. The check is the first line of each of the three handlers.

### Known gaps

- **The login attempt is not tied to the browser.** `state` is signed and expires, but nothing proves the browser that returns is the one that left. An attacker who starts a login and gets a victim to open the resulting callback URL (with a code the attacker obtained) can sign the victim in as the attacker. A cookie would fix it and is a contract change (the login `302` lists only `Location`); the user chose to accept this for now.
- A `state` can be used again within its 10 minutes. The authorization code itself is single-use at the IdP, which is what stops a replay; a second callback with the same pair fails at the token endpoint (`400`).
- Logout leaves the `session` and `csrf_token` cookies in the browser; they are dead. See Out of scope.
- A callback failure is a raw JSON page, not a screen in the app.
- With dev login on and OIDC off, `authLogout` answers `501`, so a dev-login session cannot call logout in development; log in through Kinde (OIDC enabled together with dev login is valid) to use it.
- A callback with both `code` and `error` present is treated like any other: it goes through the state check and the exchange.
- A login on top of a live session leaves the old session row until it expires.
- The `sub` alone identifies the user; the issuer is not stored (`requirements.md` lists an `issuer` column as a low-priority later item).
- The fake IdP proves the app handles a well-behaved OIDC provider. It cannot prove Kinde behaves like one: that is what the manual checks are for.
- No log line is added for failed logins. Do not log the code, the state, a token, the secret or a `sub` in any new log call. `ErrorHandler` already logs the text of every 5xx error, and a database error from `StartSession` could contain the `sub`; that is accepted and not changed here.
- No clock-skew tolerance for the ID token beyond `go-oidc`'s default (none): if Kinde's clock runs ahead, a fresh token can be rejected as not yet valid and the user sees the `400`. Manual check 10 looks for it.
- The `400` for a missing `code` or `state` comes from the generated wrapper and has its generic title ("Invalid request"); the `400` for an invalid login has the title "Invalid login attempt". Both carry `validation_error`; the different titles are intended and no test checks the title.

## Structure

Follow `ARCHITECTURE.md` and the file-placement and test-file rules in `TESTING.md`. New names are marked (new).

- `domain/errors.go`: `ErrInvalidLogin` (new).
- `usecase/login.go` (new): `LoginService` with `NewLoginService(idp IdentityProvider, sessions SessionManager, cfg LoginConfig)` and three methods: `Begin(ctx, returnTo string) (authorizeURL string, err error)`, `Complete(ctx, code, state string) (grant Grant, returnTo string, err error)`, `Logout(ctx, sessionID uuid.UUID) (logoutURL string, err error)`. It holds the signed-state logic (put it in `usecase/login_state.go` if the file grows), the PKCE verifier derivation, the logout URL building, and a `now func() time.Time` field set to `time.Now`, which tests replace (as `AuthService` does).
- `LoginConfig` (new): `StateSecret []byte`, `LogoutURL string`, `LogoutRedirectParam string` (empty means `redirect`), `LogoutReturnURL string`. The redirect URI is the adaptor's concern, not the usecase's.
- Two interfaces, both inline in `login.go` (each has two methods and is used only there, `ARCHITECTURE.md`): `IdentityProvider` (new): `AuthorizeURL(ctx, state, nonce, verifier string) (string, error)` and `Exchange(ctx, code, verifier, nonce string) (subject string, err error)`; `Exchange` returns `domain.ErrInvalidLogin` for the rejections in the table above and any other error for faults. `SessionManager` (new): `StartSession(ctx, idpID string) (Grant, error)` and `EndSession(ctx, sessionID uuid.UUID) error`.
- `usecase/auth.go`: `AuthService.EndSession(ctx, sessionID)` (new) calls `SessionStore.DeleteSession`. `*AuthService` then satisfies `SessionManager`.
- `adaptor/oidc.go` (new): `OIDCClient`, built with `NewOIDCClient(cfg OIDCConfig)` where `OIDCConfig` has `IssuerURL`, `ClientID`, `ClientSecret`, `RedirectURL` and an optional `HTTPClient` (default: a plain `http.Client` with a 10 second timeout). `oidc.NewProvider` is given a long-lived context (the client's own, carrying the HTTP client), never a request context, because `go-oidc` reuses that context for later key fetches. It uses `go-oidc` and `x/oauth2`, passing the HTTP client to both through `oidc.ClientContext` / `oauth2.HTTPClient`. It does **not** use `pkg/safehttp`: the issuer is operator configuration, not a user-supplied URL, and `safehttp` refuses loopback, which the fake IdP uses. Discovery is lazy: creating the client makes no network call; the provider is created on first use under a mutex, and a failure is not cached (the next call tries again), so a Kinde outage at startup does not stop the app. `AuthorizeURL` uses PKCE `S256` (`oauth2.S256ChallengeOption` or the equivalent in the adopted version) and adds `nonce`. `Exchange` sets the verifier, then verifies the ID token with `oidc.Config{ClientID: …}` (RS256, issuer and audience checked, expiry checked) and compares the nonce itself. An `*oauth2.RetrieveError` whose `ErrorCode` is `invalid_grant` becomes `domain.ErrInvalidLogin`; every other error is returned as a fault. Classify first, then build the fault with a fixed message plus only the error code and HTTP status (for example `fmt.Errorf("token exchange failed: status %d, code %q", …)`), never `%w` of the `RetrieveError` itself, because its text carries the response body. The wrapped error text must not contain the authorization code, the verifier, the client secret or the response body. It imports `domain` only, not `usecase` (the usecase defines the interface, `ARCHITECTURE.md`).
- `testutil/fakeidp.go` (new, no build tag): the fake identity provider, `NewFakeIDP(t testing.TB) *FakeIDP`, an `httptest` server closed by `t.Cleanup`. Standard library only: sign RS256 tokens with `crypto/rsa` and `encoding/base64` by hand, serve the key as a JWKS. Do not import a JOSE library. Endpoints: `/.well-known/openid-configuration` (with `issuer` equal to the server URL), `/authorize`, `/token`, `/jwks`, `/logout`. It checks what a real provider checks: the token endpoint requires the client ID and secret, `grant_type=authorization_code`, the right `redirect_uri`, a known unused `code`, and a `code_verifier` whose S256 equals the `code_challenge` recorded at `/authorize`. A code works once, and consuming it is atomic (a mutex), so two simultaneous token requests with the same code cannot both succeed. Knobs, each a field or method, off by default: the `sub` to issue; deny the login (`/authorize` redirects with `error=access_denied` and no code); and, for the token response, each of: wrong `aud`, wrong `iss`, expired, wrong `nonce`, signed with another key, `alg=none`, HS256 signed with the public key bytes, no `id_token`, no `sub`; plus making the token endpoint answer `invalid_grant`, `invalid_client` (401) or 500, and making the JWKS or discovery answer 500 or stop answering. It records the requests it received (authorize query, token form, logout query) for tests to read, and counts requests per endpoint. `/logout` records its query and redirects to the value of a configurable parameter name (default `redirect`).
- `handler/auth.go` (new): the `LoginFlow` interface (`Begin`, `Complete`, `Logout`, as above), satisfied by `usecase.LoginService`, the three methods `(*Server).AuthLogin`, `AuthCallback`, `AuthLogout` (they shadow the stubs; keep the stubs in `stubs.go`), and the callback response type. Follow `handler/account.go`.
- `handler/server.go`: `Server` gets `login LoginFlow` and `secureCookies bool` on their own lines; `NewServer(bookmarks, folders, sync, favicons, account, login, secureCookies)` takes them last. "Not configured" is `s.login == nil`, so `main` must pass an untyped `nil` (declare the variable as the `handler.LoginFlow` interface type, never a nil `*usecase.LoginService`, which would not compare equal to nil).
- `handler/returnto.go`: the length cap. `handler/cookies.go`: the shared cookie construction. `handler/problem.go`: one `domainProblems` row.
- `platform/config/config.go`: the variables, `Validate`, and getters; `cmd/server/main.go`: when OIDC is enabled build `adaptor.NewOIDCClient`, `usecase.NewLoginService(idp, authService, cfg)`, and pass it and `cfg.CookieSecure()` to `NewServer`; otherwise pass `nil`. The `authService` already built there is reused.

**Approved by the user for this task, overriding `TESTING.md`:** (1) the adaptor gets unit tests, because it holds logic of its own (nonce comparison, the `invalid_grant` classification, lazy discovery with retry, keeping secrets out of error text); (2) one cross-layer test, `handler/auth_flow_test.go`, with no source file of its own; (3) `testutil/fakeidp.go` is untagged and general-purpose, and `testutil/doc.go` is updated to say the package also holds this fake. Nothing else in `TESTING.md` is relaxed. Also accepted by the user: the `session` cookie is `Secure` only when `APP_BASE_URL` is https (as `devlogin.go` does), although the contract text says `Secure`; plain-http local development needs it.

## Dependencies

Only what the prerequisite recorded in `STACK.md`: `github.com/coreos/go-oidc/v3` and `golang.org/x/oauth2`, at the versions `STACK.md` names. You alone change `go.mod` and `go.sum` (`go get` the two at those versions, then `go mod tidy`). The modules `go mod tidy` adds only because those two need them are fine. If either requires a newer `go` directive than `go.mod` has, or `tidy` would change the `go` directive or any other direct dependency, stop and ask. No other new dependency: the fake IdP and the signed state use the standard library.

## Acceptance criteria

Unit tests need no database. This task has no repository change and so no new integration test; the repository tests that exist (`session_integration_test.go` covers `DeleteSession`) must still pass. Run `make test-integration-local` as `AGENTS.md` requires and report "run, passed", "run, failed" or "not run" with the reason.

**Config (`platform/config/config_test.go`)**
- `Validate` accepts: OIDC fully set in production; OIDC fully set with dev login in development; no OIDC with dev login in development.
- `Validate` rejects, one row each, with an error naming the variable and not containing its value: OIDC enabled with each of the four other variables missing in turn; `AUTH_STATE_SECRET` of 31 bytes (and accepts 32); `OIDC_ISSUER_URL`, `OIDC_LOGOUT_URL` or `APP_BASE_URL` not an absolute http(s) URL; `APP_BASE_URL` not https when `APP_ENV=production` and OIDC is enabled; one of the four other required variables set without the issuer; neither OIDC nor dev login; dev login in production.
- The existing row `"no dev login in production", Config{Env: "production"}` expects no error and **must change**: production with neither OIDC nor dev login is now an error. Replace it with "production with OIDC fully set" (valid) and keep the other existing rows. `OIDC_LOGOUT_REDIRECT_PARAM` set alone is not an error (it has a default). OIDC enabled together with dev login in development is valid, and both routes are then registered.
- `Load` reads the six variables, and `OIDC_LOGOUT_REDIRECT_PARAM` defaults to `redirect`. These tests set all six variables with `t.Setenv` (empty to clear), because `make` loads the developer's `.env` into the environment.

**Return to (`handler/returnto_test.go`)**
- A `return_to` of exactly 8192 bytes is kept; 8193 becomes `/`. The existing cases still pass.

**Usecase (`usecase/login_test.go`; the doubles for `IdentityProvider` and `SessionManager` are value-return spies written inline in this file, as `TESTING.md` says for external services; never import `repository`, `adaptor` or `testutil`). Below, "the spy IdP" is that inline double; it is not `testutil.FakeIDP`.**
- `Begin` then `Complete` with the state taken from the fake IdP's recorded `AuthorizeURL` call: the verifier and the nonce the fake received in `Exchange` equal the verifier and nonce it received in `AuthorizeURL`; `StartSession` receives the `sub` the fake returned; the returned `returnTo` equals the one given to `Begin` (also for `/save?url=https%3A%2F%2Fa.test%2F&title=x%20y`, FR-3c); the grant is the one `StartSession` returned.
- Two `Begin` calls give different states and nonces.
- `Complete` returns `ErrInvalidLogin` and calls neither `Exchange` nor `StartSession` for: an empty state, no dot, a half that is not base64url, a tampered payload, a tampered signature, a state signed with a different secret, an empty `code`.
- A state of 12289 bytes is `ErrInvalidLogin` without being decoded (one of 12288 bytes is decoded and rejected for its signature), and a `code` of 2049 bytes is `ErrInvalidLogin` without calling `Exchange` (2048 reaches it).
- State expiry with the clock controlled: valid one second before the expiry, `ErrInvalidLogin` at the expiry second and one second after.
- The fake IdP's `Exchange` returning a non-`ErrInvalidLogin` error makes `Complete` return an error that is not `ErrInvalidLogin` (it must become a `500`, not a `400`). This is a deliberate exception to the "no pass-through tests" rule in `TESTING.md`: it pins the boundary of the mapping.
- An empty `sub` from `Exchange` is `ErrInvalidLogin` and starts no session.
- `Logout` calls `EndSession` with the session id given and returns the URL: the configured base with the parameter set to `LogoutReturnURL`, percent-encoded. A base that already has a query keeps it and gains the parameter. A custom parameter name is used. An `EndSession` error returns an empty URL and that error.
- `AuthService.EndSession` calls `DeleteSession` with the id (`usecase/auth_test.go`).

**Adaptor (`adaptor/oidc_test.go`, against `testutil.FakeIDP`; no database)**
- `AuthorizeURL` points at the fake's authorize endpoint and carries `client_id`, `redirect_uri`, `response_type=code`, `scope=openid`, `state`, `nonce`, `code_challenge_method=S256` and a `code_challenge` equal to the S256 of the verifier given.
- `Exchange` with a code the fake issued (after a real request to the authorize URL) returns the fake's `sub`; the fake saw the right client ID and secret, `redirect_uri` and verifier.
- `go-oidc` does not distinguish a signature failure from a key-fetch failure by error type; the builder chooses how to tell them apart (for example a thin `oidc.KeySet` wrapper that tags fetch failures). The tests below define the required outcome. Each of these gives `domain.ErrInvalidLogin`, one subtest each: the token endpoint answers `invalid_grant`; a code used twice (second call); wrong `aud`; wrong `iss`; expired token; wrong `nonce`; token signed with another key; `alg=none`; HS256 signed with the public key bytes; no `id_token`; no `sub`.
- Each of these gives an error that is not `domain.ErrInvalidLogin`: the token endpoint answers `invalid_client` (401); it answers 500; the JWKS answers 500; discovery answers 500; the server is closed.
- For every failing case above the returned error text contains neither the client secret nor the authorization code.
- Creating the client makes zero requests to the fake. A first call that fails because discovery answered 500 does not poison the client: after the fake is fixed, the next call succeeds.

**Handler (`handler/auth_test.go`, a `LoginFlow` spy)**

`authFor` (`handler/bookmarks_test.go`) returns a new random session id on every call, so a test cannot know which id the handler should pass on. In `auth_test.go` define a small authenticator of your own that accepts `goodSession` and returns a fixed, known `domain.Session` (known `ID` and `UserID`). Do not change `authFor` or `stubAuth`.
- `authLogin`: `302`, `Location` equals the URL the spy returned, no `Set-Cookie`. The spy receives `/` for an absent `return_to`, `/save?url=x&title=y` unchanged, and `/` for `//evil.test`, `https://evil.test`, `/\evil.test`. An 8192-byte path is passed through, an 8193-byte one becomes `/`. A spy error answers `500` `internal_error`.
- `authCallback`: `302` with `Location` equal to the spy's `returnTo`; exactly two `Set-Cookie` headers; `session` is `HttpOnly`, `SameSite=Lax`, `Path=/` with the grant's token and a `Max-Age` within one second of the time to `ExpiresAt`; `csrf_token` is not `HttpOnly`, same `SameSite` and `Path`, with the grant's CSRF value. `Secure` is set when the server is built with `secureCookies` true and absent when false. When the spy returns `https://evil.test` as the return path, `Location` is `/`.
- `authCallback` errors: the spy returning `domain.ErrInvalidLogin` answers `400` `application/problem+json` with `code: validation_error` and no `Set-Cookie`; any other error answers `500` `internal_error` with no `Set-Cookie`, and the body does not contain the error text. Missing `code`, missing `state`, and `?error=access_denied&state=s` (no `code`) each answer `400 validation_error` and do not call the spy. The route works with no session cookie, and with a live session cookie it still calls the spy.
- `authLogout`: with a session and CSRF token answers `200`, `Content-Type: application/json`, body exactly `{"logout_url": <spy's URL>}`, no `Set-Cookie`; the spy receives the session id from the session. With no cookie: `401 unauthenticated`, spy not called. With a session and no CSRF token, and with a wrong token: `403 csrf_failed`, spy not called. A spy error answers `500` and the body has no `logout_url`.
- With `login` nil, all three operations answer `501 not_implemented` (logout with a valid session and CSRF token).

**Flow (`handler/auth_flow_test.go`).** The one test file in this task that crosses layers on purpose: it wires the router, the real `usecase.LoginService`, the real `adaptor.OIDCClient` and `testutil.FakeIDP`, with a small in-memory `SessionManager` defined in the test (no database, no `repository` import). It exists because the goal is the whole round trip against the fake. Not an integration test (no build tag).
- The router's authenticator in this file and the in-memory `SessionManager` share one map from session token to session id, so the cookie set by the callback authenticates the logout and `EndSession` removes the entry. Login with `return_to=/save?url=https%3A%2F%2Fa.test%2F%26x&title=t`: the `Location` is the fake's authorize URL; requesting that URL on the fake (client that does not follow redirects) gives a redirect to the app's callback URL with `code` and `state`; requesting that on the router gives `302` to the same `/save?…` string, with the two cookies, and the in-memory manager holds a session for the fake's `sub`.
- The same callback requested a second time answers `400`.
- With the fake set to deny the login, the callback it redirects to (no `code`) answers `400`.
- A callback whose `state` was signed with a different secret answers `400` and the fake's token endpoint received no request.
- Logout with the session from the login: `200`, the `logout_url` points at the fake's `/logout` with the configured parameter set to `APP_BASE_URL` + `/`; requesting it on the fake records the call and redirects to that value; the in-memory manager no longer holds the session.
- Two complete logins with the same fake `sub` call `StartSession` with that identical `sub` both times.

**Router test (`handler/router_test.go`).** `newTestRouter` passes a nil login service, so its probes still answer `501`; nothing is removed. Update the comments that say the auth operations are stubs ("authLogout is a stub for now", "the stub") to say they answer `501` because no login service is configured. Do not remove a row or assertion.

**Repo-wide**
- `make check` passes.
- Nothing outside the allowed paths changed. `go.mod` and `go.sum` changed only as the Dependencies section allows.

## Verifier checks

- The state is compared with `hmac.Equal`; the nonce is compared against the ID token's claim; the verifier is derived, not stored in or sent inside the state; the PKCE method is `S256`; only RS256 is accepted; the callback never calls the IdP before the state and `code` checks pass.
- The client secret and the state secret appear only in `config.go`, `main.go`, `adaptor` and `usecase` as values passed in; no log call, error text, test fixture, `.env.example` value or plan file contains them or a real-looking token. Grep the diff for `log`, `Logger`, `Printf` and `fmt.Errorf` near the new code.
- `invalid_client` and other non-`invalid_grant` token errors reach the client as `500`, not `400`.
- The handlers never set a header or cookie the contract does not list: the login `302` has only `Location`; the logout `200` has only `Content-Type`; the callback `302` has `Location` and the two cookies.
- `handler/` is the only package that imports `internal/api`; `adaptor` and `usecase` do not import each other. `openapi.yaml`, `oapi-codegen.yaml`, `api.gen.go`, `STACK.md` and migrations are untouched. The `go` directive is unchanged.
- No code path reads a Kinde URL, key or secret from anything but the environment. No production URL appears in the diff.
- Compare the assumptions list with the code: every assumption is either a setting or has a manual check; none is hard-coded as a fact in a comment.
- To confirm the tests discriminate (break the behavior, see them fail, revert): skip the nonce comparison; skip the signature check on the state; make the expiry check `<=`/`<` the other way; stop validating `return_to` at the callback; drop `HttpOnly` from `session`; set `Secure` always; return `400` for `invalid_client`; send the verifier inside the state and not derive it; accept `alg=none`. Each must turn a test red. Revert each.
- Try to break it with: a `state` with a flipped last character; a state with two dots; a `state` of 12289 bytes (`400` before any decoding) and of 12288 bytes (decoded and rejected as unsigned), and a `code` of 2049 bytes; `return_to` values `/\evil.test`, `/%2f%2fevil.test`, `/a%0d%0aSet-Cookie:x=1`, a path with a NUL byte, an 8193-byte path; the callback with `code=` empty; the same callback twice at once (only one may start a session); logout twice with the same cookie (the second is `401`); logout while the fake's `/logout` is down (the response is unaffected); the server started with only some `OIDC_*` variables set (it must refuse to start).

## Manual checks against real Kinde

For the user, after the task is merged. None is done by an agent. Put the six variables in your gitignored `.env`, register `http://localhost:5175/auth/callback` as an allowed callback URL and `http://localhost:5175/` as an allowed logout redirect URL in Kinde, run with `APP_ENV=development`, and use `make` so `.env` loads.

1. Start the server with the real values and no `AUTH_DEV_LOGIN`. It must start and not contact Kinde until the first login.
2. Open `/auth/login?return_to=/`. Kinde shows its login page; after signing in you land on `/` with the `session` and `csrf_token` cookies set. Check the request carried `code_challenge_method=S256` and was accepted (assumption 4).
3. Sign in twice, and with each sign-in method you use (email and password, and SSO if enabled). The `users` table must hold one row per person, with the same `idp_id` each time (assumption 1).
4. Open `/auth/login?return_to=/save%3Furl%3Dhttps%253A%252F%252Fexample.com%252F%26title%3DExample`. After sign-in you return to the same save URL with the same parameters (FR-3c). Repeat with a very long URL near the 2,048-character limit plus a 300-character title, to see whether Kinde accepts the longer `state` (assumption 6).
5. Log out: `POST /auth/logout` with the CSRF header returns `200` and a `logout_url`. Check its host, path and the redirect parameter name against Kinde's documentation (assumption 2), then open it. Kinde returns you to `http://localhost:5175/`. Start `/auth/login` again: Kinde must ask for credentials (FR-2). If it signs you straight back in, the logout URL or parameter is wrong; correct `OIDC_LOGOUT_URL` or `OIDC_LOGOUT_REDIRECT_PARAM`, which needs no code change.
6. Open the logout URL again with no Kinde session: Kinde must still redirect, not show an error (assumption 3).
7. Cancel at Kinde's login page: the app shows the `400` problem JSON.
8. After a successful login, press Back to the callback URL and reload: `400` (the code is single-use).
9. Wait out the 10 minute state: start a login, wait 11 minutes, finish it: `400`.
10. Confirm in the Kinde ID token (decode it in a debugger tool) that `sub` is present with the `openid` scope alone and that the signing algorithm is RS256 (assumptions 4 and 8). The discovery document's `issuer` must equal `OIDC_ISSUER_URL` (assumption 5): the server answering `500` on the first login with a mismatch is the symptom.
11. Over https with `APP_BASE_URL` set to an https origin: the cookies carry `Secure`.

Record each result and any assumption that turned out wrong; they decide the production URLs and whether any of the "Known gaps" has to be closed first.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement or this file conflict with each other, or you think a status, header, cookie, query parameter or endpoint beyond those listed is needed.
- You think you need a migration, a dependency beyond the two, a change to the `go` directive, a new `pkg/` package, or an edit outside your paths.
- The Prerequisite is not met.
- `go-oidc` or `x/oauth2` in the adopted version lacks something this file relies on (PKCE `S256` support, `RetrieveError.ErrorCode`, a client passed through context), or `go-oidc` gives no way to tell a bad ID-token signature from a failed key fetch.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check` and `make test-integration-local`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), which integration tests ran and which did not (and the Postgres version if they ran), the dependency versions in `go.mod`, and anything you were unsure about. Say plainly that nothing was run against real Kinde. Also note every place you made a judgment call that this file did not settle.
