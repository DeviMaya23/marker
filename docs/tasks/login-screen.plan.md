# Plan: login-screen

Branch: `claude/login-screen-task-830273`. Frontend only; `backend/` is not touched, so `make test-integration-local` does not apply .

Paths are under `frontend/src/`.

## Acceptance criteria

- [x] `apiRequest` 401 at `/trash?x=1`: `goTo('/login?return_to=%2Ftrash%3Fx%3D1')` once, call still rejects with ApiError 401 + problem. — `lib/api/loginRedirect.ts`, `lib/api/request.ts`; test `lib/api/request.test.ts`
- [x] Round trip of `/save?url=…&title=A%20B` through `return_to` decodes to the exact original. — `request.test.ts`
- [x] Several 401s (in a row and in parallel) call `goTo` once; after reset, again. — `loginRedirect.test.ts`, `request.test.ts`
- [x] At `/login`, `/login/`, `/login?return_to=%2F` (and other letter case) 401 does not call `goTo`, still rejects, and does not use up the guard. — `lib/api/loginRedirect.test.ts`, `request.test.ts`
- [x] `suppressLoginRedirect()` then 401: no `goTo`; without it, `goTo`. — `loginRedirect.test.ts`
- [x] FR-3c whole client path: `App` at `/save?...` with real folders wrapper and 401 `fetch` calls `goTo` once with encoded path. — `App.login.test.tsx`
- [x] 403, 404, 429, 500, network failure, 204, 200 never call `goTo`. — `request.test.ts`
- [x] 401 from `/auth/logout` calls `goTo`. — `lib/api/auth.test.ts` (mocks `lib/goTo`), `request.test.ts`
- [x] Existing `request.test.ts` cases still pass; `test/setup.ts` resets guard and location. — `test/setup.ts`
- [x] `loginPageHref`. — `lib/loginHref.ts`, `lib/loginHref.test.ts`
- [x] `safeReturnTo` kept / fallback tables. — `features/login/lib/safeReturnTo.ts`, `safeReturnTo.test.ts`
- [x] `useLoginProbe`: checking / signed-in / signed-out, one call, no args, gcTime 0, no polling. — `features/login/hooks/useLoginProbe.ts`, `useLoginProbe.test.tsx`
- [x] `LoginPage`: pending status only; 200 → `replace` to safe path; 401/429/500/network → card with link `loginHref(safe, '')` (prod and dev); once under StrictMode, no poll after 10 s; nested query survives; no nav landmark. — `pages/LoginPage.tsx`, `features/login/components/LoginCard.tsx`; tests `pages/LoginPage.test.tsx`, `LoginCard.test.tsx`
- [x] `App`: `/login` renders the login page. — `App.tsx`; test `App.login.test.tsx`
- [x] `useLogout`: `suppressLoginRedirect()` before `goTo` on 200 (valid URL and `/` fallback), never on failure. — `features/account/hooks/useLogout.ts`; test `useLogout.test.tsx`
- [x] CSS: login rules appended as new selectors. — `styles/layout.css`
- [x] `make check` passes (exit 0; 82 files, 1066 tests).
- [x] Nothing outside allowed paths changed.

## Judgment calls

- `redirectToLogin` reads `window.location` and treats the path as the login screen with `/^\/login\/?$/i`.
- `test/setup.ts` imports `loginRedirect` dynamically inside `afterEach`: a static import there loads the real `goTo` before a test file's `vi.mock` applies. It also guards `window` because the stylelint test runs in the node environment.
- `useLogout.test.tsx` mocks `loginRedirect` with `importOriginal` so the reset in `setup.ts` still exists.
- The card's icon is `aria-hidden`; `LoginCard` renders the `login-page` wrapper itself.
- `LoginPage` uses `<Navigate replace>` for the signed-in redirect.
- The `LoginCard` test covers only the link href (prod and dev); the page tests cover the rest of the card.
- Mutation checks (a)-(f) from the verifier list were not run by me.
- Departures from the reference: link instead of button, name "marker", `lucide-react` icon, probe first (all as the task file says).
