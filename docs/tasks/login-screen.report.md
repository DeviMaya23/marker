# Verification report: login-screen

Branch: `claude/login-screen-task-830273-02uwx1` (verifier session; started from builder branch `claude/login-screen-task-830273` at `1af531f`).

Verdict: **no Blocking findings.** `make check` passes (exit 0; 82 test files, 1,066 tests). Frontend-only diff; `backend/` untouched.

## Criteria

All paths under `frontend/src/`. "Discriminates" = I confirmed the test fails when the behavior is broken (mutations below), or the assertion is direct.

| Criterion | Test | Verdict |
|---|---|---|
| 401 at `/trash?x=1`: one `goTo('/login?return_to=%2Ftrash%3Fx%3D1')`, still rejects with ApiError 401 + problem (NFR-15) | `lib/api/request.test.ts` "sends the browser to login…"; `loginRedirect.test.ts` | Met. Asserts exact arg, status and problem body. |
| Round trip of nested query | `request.test.ts` "round-trips a nested query exactly" | Met. Decodes with `URLSearchParams`; mutation (f) turns it red. |
| 401s in a row and in parallel → one `goTo`; again after reset | `request.test.ts` "redirects once…"; `loginRedirect.test.ts` | Met. Mutation (a) turns 4 tests red. |
| `/login`, `/login/`, `/login?return_to=%2F` no `goTo`, still rejects, guard not used up | `request.test.ts` (`it.each`), `loginRedirect.test.ts` (also `/Login`, `/LOGIN/`) | Met. Mutation (b) turns 9 tests red. |
| `suppressLoginRedirect()` then 401 → no `goTo`; without → `goTo` | `request.test.ts`, `loginRedirect.test.ts` | Met. |
| FR-3c whole client path | `App.login.test.tsx` "FR-3c…" (real folders wrapper, stubbed `fetch`, mocked `goTo`) | Met. Exact `goTo` arg asserted once. Client half only, as the task says. |
| 403/404/429/500/network/204/200 never `goTo` | `request.test.ts` (`it.each` + network case) | Met. Mutation (c) (403 redirects) turns a test red. |
| 401 from `/auth/logout` calls `goTo` | `request.test.ts` "…logout call too"; `auth.test.ts` mocks `goTo` | Met. |
| Existing `request.test.ts` cases pass | whole suite | Met. |
| `loginPageHref` | `lib/loginHref.test.ts` | Met. |
| `safeReturnTo` kept / fallback tables, 8,192 / 8,193 | `features/login/lib/safeReturnTo.test.ts` | Met. Every listed input present; mutation (e) turns it red. |
| Probe pending: status only, no link/heading | `LoginPage.test.tsx` "shows only the checking status…" | Met. |
| 200 → `replace` to safe path; unsafe/missing → `/` | `LoginPage.test.tsx` (shows `REPLACE`) | Met. Mutation (d) turns 5 tests red. |
| 401: card text, link `loginHref`, prod and dev, anchor; unsafe → `/` | `LoginPage.test.tsx`, `LoginCard.test.tsx` | Met. |
| 429 / 500 / network: card shows | `LoginPage.test.tsx` `it.each` | Met. |
| `getSyncVersion` once, no args, StrictMode, no poll after 10 s | `LoginPage.test.tsx` last case | Met. `toHaveBeenCalledExactlyOnceWith()` after 10 s of fake timers. |
| Nested `return_to` survives the link | `LoginPage.test.tsx` "keeps a nested query…" | Met. |
| No sidebar / navigation landmark, no poll | `LoginPage.test.tsx` (`queryByRole('navigation')` null) | Met. |
| `App`: `/login` renders login page | `App.login.test.tsx` | Met. Other routes covered by untouched `App.test.tsx`. |
| `useLogout`: `suppressLoginRedirect()` before `goTo` on 200 (URL and `/`), never on failure | `useLogout.test.tsx` (order array; `it.each` failures) | Met. Removing the call turns a test red. |
| `make check` passes; nothing outside allowed paths | I ran it; diff stat | Met. |

## Plan check

- Every acceptance criterion appears in the plan (it groups some). No criterion is missing.
- Every ticked item has a test that exists and checks the behavior. Small inaccuracy: the plan credits `request.test.ts` for the "other letter case" part of the `/login` item; letter-case variants are only tested in `loginRedirect.test.ts` (`/Login`, `/LOGIN/`). Harmless.
- Plan vs diff: no unrecorded differences. The listed judgment calls (dynamic import in `setup.ts`, `window` guard, `importOriginal` mock, `aria-hidden` icon, `<Navigate replace>`) match the code. The plan says the builder did not run mutations (a)–(f); I did.
- `LoginCard.test.tsx` covers only the link; the card text is covered in `LoginPage.test.tsx`. Acceptable.

## Rule checks

- Only `handler/` imports `internal/api`: not applicable (no backend change).
- Repository queries filter by `user_id`; `users.version` increments in write transactions: not applicable (no backend change).
- `go.mod` unchanged; `package.json` and `package-lock.json` unchanged; no dependency added (empty diff).
- Paths changed are all allowed: `lib/api/*`, `lib/loginHref*`, `test/setup.ts`, `App.tsx`, `useLogout*`, `styles/layout.css`, new `features/login/**`, `pages/LoginPage*`, `App.login.test.tsx`, plan. `App.test.tsx`, `AppShell`, `useSyncPoll`, `goTo.ts` untouched.
- `useLogout` calls `suppressLoginRedirect()` once, only after the failure branch returns, right before `goTo`.
- Only `request.ts` calls `redirectToLogin()`, only for `res.status === 401`, before the throw. The guard is module state, set only when a redirect starts or on suppress. `/login` (any case, optional trailing `/`) returns before setting the guard. The location is read inside the function at 401 time, not at import.
- `goTo` is the only navigation (`window.location.assign` in `lib/goTo.ts`); the only other `window.location` use is the read in `loginRedirect.ts` and an unrelated bookmarklet origin read.
- `safeReturnTo` is the only gate: used by `LoginPage` for both `<Navigate replace>` and the `LoginCard` link. The link is a plain `<a>` built by `loginHref`, no `onClick`.
- Old signed-out UI untouched: the diff deletes nothing outside the listed files.
- CSS: appended, new selectors only; all variables used exist in `tokens.css`; stylelint passes inside `make check`.
- No `window.opener` use and no shared state outside the page (checked by grep): the popup and two-tab cases hold by reading.
- Tests discriminate. In a scratch copy (not the repo), each mutation turned tests red and was reverted:

  | Mutation | Failing tests |
  |---|---|
  | (a) remove once-per-page guard | 4 |
  | (b) `/login` redirects too | 9 |
  | (c) redirect on 403 as well | 1 |
  | (d) drop `replace` | 5 |
  | (e) accept `//evil.example` | 3 |
  | (f) encode only path, not query | 6 |
  | extra: drop `suppressLoginRedirect()` from `useLogout` | 1 |

## Integration tests

Not applicable: the diff touches no `backend/` file (`git diff` shows only `frontend/` and the plan). I did not run `make test-integration-local`. No criterion depends on integration tests.

## Findings

### Blocking

None.

### Non-blocking

1. `safeReturnTo` passes `/./login` and `/%6Cogin` through, as the task file says (the server re-checks). With `<Navigate replace>` a signed-in user following `return_to=/./login` would be sent to a path React Router may resolve to `/login`. The probe at `/login` then runs again (one extra call), no redirect loop since it answers 200 each time. Within the task's stated scope.
2. `safeReturnTo` rejects only ASCII control and space; non-ASCII whitespace such as `U+00A0` is kept (`/login ` → kept). Matches the task's definition; the server re-checks.
3. The plan attributes letter-case coverage to `request.test.ts`; it is in `loginRedirect.test.ts` only. Documentation nit.

I added no tests: the existing ones already cover the boundaries I tried (8,192 / 8,193, `%0d%0a`, `%00`, `%5c`, doubly encoded `//`, `/api/`, `/auth/`, nested `/login?return_to=…`, a 401 right after logout).
