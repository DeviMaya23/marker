# Plan: login failure message

Backend untouched (frontend only), so `make test-integration-local` does not apply — outcome: not run: task touches no `backend/` file.

- [x] `loginErrorFrom` returns the code only for the two exact values, else null — `frontend/src/features/login/lib/loginError.ts`, test `loginError.test.ts`
- [x] `LOGIN_ERROR_MESSAGES` has exactly the two texts keyed by code — `loginError.ts`, test `loginError.test.ts`
- [x] `LoginCard` with `error` shows one `role="alert"` with exactly the message — `features/login/components/LoginCard.tsx`, test `LoginCard.test.tsx`
- [x] `LoginCard` without `error`: no alert, no banner element — `LoginCard.tsx`, test `LoginCard.test.tsx`
- [x] "Log in" link and href same with and without `error` — `LoginCard.tsx`, test `LoginCard.test.tsx`
- [x] LoginPage signed out: `error=login_failed`, `access_denied`, with `return_to=/trash` link href — `pages/LoginPage.tsx`, test `LoginPage.test.tsx`
- [x] LoginPage: `foo`, empty, `LOGIN_FAILED`, absent, `login_failed%00`, 5000 chars, `error[]=x` give no alert; duplicate key uses first — `LoginPage.tsx`, test `LoginPage.test.tsx`
- [x] LoginPage: `access_denied` with `return_to=//evil.example` shows message, link to `/` — `LoginPage.test.tsx`
- [x] LoginPage: no alert while checking; signed in redirects with replace and no alert — `LoginPage.test.tsx`
- [x] LoginPage: 500, 429, network error with `error=access_denied` show card with message — `LoginPage.test.tsx`
- [x] Banner centring rule appended to `frontend/src/styles/layout.css`; `make lint-css` passes
- [x] Existing LoginPage and LoginCard tests pass unchanged
- [x] `make check` passes; nothing outside allowed paths changed

`make check`: passed (83 files, 1117 tests; lint, lint-css included).

## Judgment calls

- Added extra LoginPage cases beyond the list (`error=login_failed%20`, double-encoded value, `#x` fragment) because the task's verifier section names them; fragment is not part of the query, so the message shows.
- `LoginCard` takes `error?: LoginError`; `LoginPage` passes `error ?? undefined` since `loginErrorFrom` returns `null`.
- The pending-probe test finds the status by text, because the test render wrapper also has a notifications region with `role="status"`.
- Centred banner look was not seen in a browser (none available to the builder).
- A first full `make check` run showed a failure in `EmptyTrash.test.tsx` (focus) that did not repeat on later runs; I did not touch it.
