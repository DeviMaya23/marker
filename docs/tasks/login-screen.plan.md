# Plan: login-screen

Branch: `claude/login-screen-task-830273`. Frontend only; `backend/` is not touched, so `make test-integration-local` does not apply (not run: no backend change).

Paths are under `frontend/src/`.

## Acceptance criteria

- [ ] `apiRequest` 401 at `/trash?x=1`: `goTo('/login?return_to=%2Ftrash%3Fx%3D1')` once, call still rejects with ApiError 401 + problem. — `lib/api/loginRedirect.ts`, `lib/api/request.ts`; test `lib/api/request.test.ts`
- [ ] Round trip of `/save?url=…&title=A%20B` through `return_to` decodes to the exact original. — `request.test.ts`
- [ ] Several 401s (in a row and in parallel) call `goTo` once; after reset, again. — `loginRedirect.test.ts`, `request.test.ts`
- [ ] At `/login`, `/login/`, `/login?return_to=%2F` (and other letter case) 401 does not call `goTo`, still rejects, and does not use up the guard. — `lib/api/loginRedirect.test.ts`, `request.test.ts`
- [ ] `suppressLoginRedirect()` then 401: no `goTo`; without it, `goTo`. — `loginRedirect.test.ts`
- [ ] FR-3c whole client path: `App` at `/save?...` with real folders wrapper and 401 `fetch` calls `goTo` once with encoded path. — `App.login.test.tsx`
- [ ] 403, 404, 429, 500, network failure, 204, 200 never call `goTo`. — `request.test.ts`
- [ ] 401 from `/auth/logout` calls `goTo`. — `lib/api/auth.test.ts` (mocks `lib/goTo`), `request.test.ts`
- [ ] Existing `request.test.ts` cases still pass; `test/setup.ts` resets guard and location. — `test/setup.ts`
- [ ] `loginPageHref`. — `lib/loginHref.ts`, `lib/loginHref.test.ts`
- [ ] `safeReturnTo` kept / fallback tables. — `features/login/lib/safeReturnTo.ts`, `safeReturnTo.test.ts`
- [ ] `useLoginProbe`: checking / signed-in / signed-out, one call, no args, gcTime 0, no polling. — `features/login/hooks/useLoginProbe.ts`, `useLoginProbe.test.tsx`
- [ ] `LoginPage`: pending status only; 200 → `replace` to safe path; 401/429/500/network → card with link `loginHref(safe, '')` (prod and dev); once under StrictMode, no poll after 10 s; nested query survives; no nav landmark. — `pages/LoginPage.tsx`, `features/login/components/LoginCard.tsx`; tests `pages/LoginPage.test.tsx`, `LoginCard.test.tsx`
- [ ] `App`: `/login` renders the login page. — `App.tsx`; test `App.login.test.tsx`
- [ ] `useLogout`: `suppressLoginRedirect()` before `goTo` on 200 (valid URL and `/` fallback), never on failure. — `features/account/hooks/useLogout.ts`; test `useLogout.test.tsx`
- [ ] CSS: login rules appended as new selectors. — `styles/layout.css`
- [ ] `make check` passes.
- [ ] Nothing outside allowed paths changed.

## Judgment calls

(filled in at the end)
