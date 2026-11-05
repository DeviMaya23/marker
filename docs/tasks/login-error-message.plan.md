# Plan: login failure message

Backend untouched (frontend only), so `make test-integration-local` does not apply: not run: task touches no `backend/` file.

- [ ] `loginErrorFrom` returns the code only for the two exact values, else null — `frontend/src/features/login/lib/loginError.ts`, test `loginError.test.ts`
- [ ] `LOGIN_ERROR_MESSAGES` has exactly the two texts keyed by code — `loginError.ts`, test `loginError.test.ts`
- [ ] `LoginCard` with `error` shows one `role="alert"` with exactly the message — `features/login/components/LoginCard.tsx`, test `LoginCard.test.tsx`
- [ ] `LoginCard` without `error`: no alert, no banner element — `LoginCard.tsx`, test `LoginCard.test.tsx`
- [ ] "Log in" link and href same with and without `error` — `LoginCard.tsx`, test `LoginCard.test.tsx`
- [ ] LoginPage signed out: `error=login_failed`, `access_denied`, with `return_to=/trash` link href — `pages/LoginPage.tsx`, test `LoginPage.test.tsx`
- [ ] LoginPage: `foo`, empty, `LOGIN_FAILED`, absent, `login_failed%00`, 5000 chars, `error[]=x` give no alert; duplicate key uses first — `LoginPage.tsx`, test `LoginPage.test.tsx`
- [ ] LoginPage: `access_denied` with `return_to=//evil.example` shows message, link to `/` — `LoginPage.test.tsx`
- [ ] LoginPage: no alert while checking; signed in redirects with replace and no alert — `LoginPage.test.tsx`
- [ ] LoginPage: 500, 429, network error with `error=access_denied` show card with message — `LoginPage.test.tsx`
- [ ] Banner centring rule appended to `frontend/src/styles/layout.css`; `make lint-css` passes
- [ ] Existing LoginPage and LoginCard tests pass unchanged
- [ ] `make check` passes; nothing outside allowed paths changed
