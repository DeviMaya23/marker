# Verification report: auth-backend

Branch: `claude/auth-backend-task-fdmh8o-4j3xn9` (the builder's work, `claude/auth-backend-task-fdmh8o`, was reset onto it; verifier commits sit on top).
Verifier: Claude. Nothing was run against real Kinde.

**Verdict: no Blocking findings.** One flaky test (a test bug, not a source bug) was found and fixed; two coverage gaps were closed with new test rows.

## Results at a glance

- `make check`: **passed** (exit 0) after fixing the flaky test described below. On the builder's commit it failed about 1 run in 3 (`TestLoginService_CompleteRejectsABadAttempt`).
- `make test-integration-local`: **run, passed** (PostgreSQL 16, `/usr/lib/postgresql/16/bin`). Tests that exist: `repository/session_integration_test.go` (covers `DeleteSession`), `user_integration_test.go` and the rest of `repository`/`worker`. This task adds no integration test. No acceptance criterion depends only on an integration test; every criterion is covered by a unit or flow test. The builder's tick in the plan was not relied on.

## Criteria

"Real?" = does the test fail if the behavior is removed. Mutations were applied to source, the suite run, then reverted (see "Discrimination" below).

| # | Criterion | Test(s) | Real? | Status |
|---|---|---|---|---|
| C1 | Validate accepts the three valid sets (FR-1, NFR-13) | `config_test.go` `TestConfig_Validate` accept rows | yes | met |
| C2 | Validate rejects each listed case, names the variable, never the value | `TestConfig_Validate`, `TestConfig_Validate_NamesTheVariableNotItsValue` | yes | met |
| C3 | Old production row replaced; redirect param alone valid; OIDC+dev login valid | `TestConfig_Validate` | yes | met |
| C4 | `Load` reads six variables, default `redirect` | `TestLoad_ReadsTheOIDCVariables`, `TestLoad_OIDCDefaults` | yes | met |
| R1 | `return_to` 8192 kept, 8193 becomes `/` (FR-3c) | `returnto_test.go` `TestSafeReturnTo`, `TestAuthLogin` | yes (cap mutant red) | met |
| U1 | Begin then Complete: verifier/nonce equal, sub only, returnTo (incl. save URL, FR-3c), grant (FR-1, NFR-7) | `TestLoginService_BeginThenComplete` | yes for round trip; verifier derivation was **not** pinned (see F-N2, fixed) | met |
| U2 | Two Begins differ | `TestLoginService_BeginMintsFreshStateAndNonce` | yes | met |
| U3 | Bad states and empty code give `ErrInvalidLogin`, no Exchange/StartSession | `TestLoginService_CompleteRejectsABadAttempt` | yes after fix (was flaky, F-N1) | met |
| U4 | State 12289 refused undecoded, 12288 decoded and rejected; code 2049 refused, 2048 reaches IdP | `TestLoginService_CompleteSizeLimits` | code cap: yes. State cap: **could pass without the cap** (the unsigned test fails the signature either way); fixed with a signed-state row (F-N2) | met |
| U5 | Expiry: valid at -1s, invalid at expiry and +1s (NFR-15) | `TestLoginService_StateExpiry` | yes (both `>` and +1 mutants red) | met |
| U6 | Non-`ErrInvalidLogin` Exchange error stays a fault | `TestLoginService_CompleteKeepsAnIdPFaultApartFromABadLogin` | yes (pins the mapping, as the task intends) | met |
| U7 | Empty sub is `ErrInvalidLogin`, no session | `TestLoginService_CompleteRejectsAnEmptySubject` | yes (mutant red) | met |
| U8 | Logout: EndSession id, URL encoding, existing query kept, custom param, error gives empty URL (FR-2) | `TestLoginService_Logout` | yes (mutant red) | met |
| U9 | `AuthService.EndSession` calls `DeleteSession` | `auth_test.go` `TestAuthService_EndSession` | yes | met |
| A1 | AuthorizeURL parameters, S256 challenge | `TestOIDCClient_AuthorizeURL` | yes | met |
| A2 | Exchange returns sub; fake saw client id/secret, redirect_uri, verifier | `TestOIDCClient_Exchange` | yes | met |
| A3 | Eleven rejections give `ErrInvalidLogin` | `TestOIDCClient_Exchange_RejectsABadLogin` | yes (nonce mutant red); `alg=none` and HS256 rows pass only because go-jose rejects them, so RS256-only is not independently tested (F-N3) | met |
| A4 | Faults are not `ErrInvalidLogin` (invalid_client, 500, JWKS 500, discovery 500, closed) | `TestOIDCClient_Exchange_ReportsAFaultAsAFault` | yes (invalid_client-as-400 mutant red) | met |
| A5 | Error text has no secret or code | `..._ReportsAFaultAsAFault`, `..._DoesNotLeakTheResponseBody`, rejections | yes | met |
| A6 | Creating the client makes no request; failed discovery does not poison | `TestOIDCClient_LazyDiscovery` | yes | met |
| H1 | authLogin: 302, Location, no cookie, return_to cases, cap, spy error 500 | `handler/auth_test.go` `TestAuthLogin` | yes | met |
| H2 | authCallback: 302, two cookies and attributes, Secure on/off, evil return becomes `/` (NFR-13, NFR-15) | `TestAuthCallback_Redirects`, `_SecureFlag`, `_ReturnPathIsValidatedAgain` | yes (HttpOnly, Secure, revalidation mutants red) | met |
| H3 | authCallback errors: 400 vs 500, no cookie, no leak, missing params, with/without session | `TestAuthCallback_Errors` | yes | met |
| H4 | authLogout: 200 body exact, no cookie, session id, 401, 403 x2, 500 | `TestAuthLogout` | yes | met |
| H5 | `login` nil gives 501 on all three | `TestAuth_NotConfigured` | yes | met |
| F1 | Flow: login, fake authorize, callback, cookies, save URL, session for sub (FR-1, FR-3c) | `TestAuthFlow_LoginRoundTrip` | yes | met |
| F2 | Replay gives 400 | `TestAuthFlow_ReplayedCallbackIsRefused` | yes | met |
| F3 | Denied login gives 400 | `TestAuthFlow_DeniedLoginIsRefused` | yes | met |
| F4 | Foreign-secret state gives 400, token endpoint untouched | `TestAuthFlow_StateSignedWithAnotherSecretIsRefused` | yes (state-signature mutant red) | met |
| F5 | Logout: URL, fake redirect, session removed, second logout 401 (FR-2) | `TestAuthFlow_Logout` | yes | met |
| F6 | Same sub twice | `TestAuthFlow_SameSubjectTwice` | yes | met |
| RT | Router test comments updated, no rows removed | `router_test.go` diff (10 lines, comments and `NewServer` args) | n/a | met |
| W | `make check` passes | run | n/a | met (after test fix) |
| P | Nothing outside allowed paths; go.mod/go.sum only as allowed | `git diff origin/main...HEAD --stat`: only `backend/**` (no `migration/`, no `internal/api/`), `.env.example`, the plan. `go.mod`: `go-oidc v3.21.0`, `oauth2 v0.37.0`, `go-jose/v4` (indirect, needed by go-oidc) | n/a | met |

Requirement coverage: FR-1 (F1, F6, U1), FR-2 (U8, F5), FR-3c (U1, R1, F1, new return_to flow test), NFR-7 (U1 "StartSession receives the sub and nothing else"), NFR-13 (H2), NFR-15 (H2 cookie lifetime, U5, F1). NFR-16 is out of scope by the task.

## Plan check (`auth-backend.plan.md`, read after the criteria)

- **Criteria missing from the plan:** none. Every criterion group appears.
- **Ticked items whose test does not exist by the name given:** the plan names tests that do not exist under those names. The behavior is covered by differently named tests (mapped in the table above). Examples: `TestLoginService_RoundTrip` (real: `..._BeginThenComplete`), `_BeginUnique`, `_CompleteRejects`, `_Limits`, `_ExchangeFault`, `_EmptySub`, `TestOIDCClient_Rejections`, `_Faults`, `TestAuthCallback`, `TestAuthFlow_ReplayRejected`, `_Denied`, `_ForeignState`, `TestValidate`, `TestLoad`. No ticked item lacks a test; only the names are wrong (Non-blocking, F-N4).
- **Ticked items whose test does not check the behavior:** the plan's own judgment call admits RS256-only is untested. Two further gaps found, fixed by the verifier: PKCE verifier derivation not pinned (mutation survived), and the 12289-byte state cap indistinguishable for signed states.
- **Plan vs diff:** the plan says "a state is valid only with non-empty nonce, return_to, non-zero expiry". The diff does this (`login_state.go`), and the task file does require "all three fields". `Config.Validate` checks dev login first, then OIDC rules, as the plan says. No other difference found. The plan's claim "mutation spot checks all turned a test red" is true for the ones it lists; it omits the verifier and state-cap mutants, which did not.

## Rule checks

- **Only `handler/` imports `internal/api`:** yes (`grep -rn internal/api` outside `api/` and `handler/` is empty).
- **`adaptor` and `usecase` do not import each other:** yes. `adaptor/oidc.go` imports `domain` only.
- **Repository queries filter by `user_id`:** no repository code changed; `DeleteSession` is by session id and is the existing one the task names. N/A.
- **`users.version` incremented in every write transaction:** no new write transaction (no repository or migration change). `StartSession` is existing code. N/A.
- **`go.mod`:** `go 1.26.0` unchanged, there is no `toolchain` line before or after; only `go-oidc`, `oauth2` and the indirect `go-jose` were added.
- **Untouched:** `openapi.yaml`, `oapi-codegen.yaml`, `internal/api`, `STACK.md`, `migration/`, `Makefile`, `docs/**` (except the plan), frontend: none in the diff.
- **State compared with `hmac.Equal`:** yes (`login_state.go`). Nonce compared against the ID token claim: yes (`subtle.ConstantTimeCompare` in `oidc.go`). Verifier derived (`pkceVerifier`), not in the state: yes, and now pinned by a test. PKCE method S256: yes (`oauth2.S256ChallengeOption`). RS256 only: yes (`SupportedSigningAlgs: []string{oidc.RS256}`). The callback never calls the IdP before the state and code checks: yes, `Complete` returns before `Exchange` (F4 and the new empty-code flow test check the token endpoint count is 0).
- **Secrets:** no log call in the new code. `fmt.Errorf`/`errors.New` messages are fixed text; the one with data carries status and OAuth error code only. The `RetrieveError` is not wrapped with `%w`. `.env.example` has no values. No real-looking token or Kinde URL in the diff.
- **`invalid_client` and other non-`invalid_grant` errors give 500:** yes (A4, mutant red).
- **Headers the contract does not list:** login 302 sets only `Location`, logout 200 only `Content-Type`, callback 302 only `Location` and two cookies. Tested in H1, H2, H4.
- **No code path reads a Kinde URL, key or secret except from the environment:** yes (`main.go` passes `cfg` values).
- **Assumptions vs code:** the logout URL, redirect parameter, issuer, client and state secret are all settings. The `.env.example` comments label the logout values as unverified guesses. The code comments state no assumption as fact.

### Discrimination (mutation checks, each reverted)

| Mutation | Result |
|---|---|
| skip nonce comparison | red (`..._RejectsABadLogin`) |
| skip state signature check | red (`RejectsABadAttempt`, `AuthFlow_StateSignedWithAnotherSecret...`) |
| expiry `>=` to `>`, or one second late | red (`StateExpiry`) |
| stop revalidating `return_to` at the callback | red (`ReturnPathIsValidatedAgain`) |
| drop `HttpOnly` from `session` | red |
| `Secure` always | red |
| `invalid_client` returns 400 | red |
| 8193 / code / empty-sub / logout-error mutants | red |
| verifier not derived from the nonce (constant) | **survived**; a new test now fails it |
| state cap one byte too high | survived (unreachable for signed states); a signed state at +2 now fails the +2 mutant |
| allow `none`/`HS256` in `SupportedSigningAlgs` | survived: go-jose rejects them anyway (F-N3) |

## Findings

### Blocking

None.

### Non-blocking

- **F-N1 (fixed, test bug).** `TestLoginService_CompleteRejectsABadAttempt` flipped the last base64url character of the signature and payload. The last character of a 32-byte MAC carries two padding bits, so about 1 in 3 runs the flip decoded to the same bytes and the state was accepted. The shared spy counters then also failed the later `empty code` and `foreign secret` rows. Reproduce on the builder's commit: `go test ./internal/usecase -run CompleteRejectsABadAttempt -count=20`. Fixed by flipping the first character. This also means `verifyState` accepts a signature whose padding bits differ (decoded bytes identical, so the HMAC still verifies and nothing is forged). Using `base64.RawURLEncoding.Strict()` would reject it; a suggestion, not a requirement.
- **F-N2 (fixed, tests added).** The PKCE verifier test only compared the verifier sent to the IdP with the one sent to Exchange, so a constant verifier passed. Added `TestLoginService_VerifierIsDerivedPerAttemptAndNotInTheState` (differs per attempt, equals `HMAC(secret, "pkce:"+nonce)`, absent from the state). Added a signed-state row to `TestLoginService_CompleteSizeLimits` (accepted at 12288, refused at 12290; 12289 cannot be built because the payload's base64 length would be 1 mod 4).
- **F-N3.** RS256-only is not covered by a test of its own. `alg=none` and HS256 are rejected by go-jose before the algorithm list matters. Adding an RS384 token knob to the fake would cover it.
- **F-N4.** The plan's test names do not match the tests; fix the plan if it is to stay a reliable index.
- **Added tests (all pass, with `-race`)**, in `handler/auth_flow_test.go`: eight simultaneous identical callbacks give exactly one 302 and one session; `return_to` through the whole round trip (`/\evil.test`, `/%2f%2fevil.test` kept as a path, CRLF, NUL, absolute URL, 8192 kept, 8193 and a quote-filled path fall back to `/`, no injected header); empty `code` is 400 with no token request; logout works with the IdP closed.
