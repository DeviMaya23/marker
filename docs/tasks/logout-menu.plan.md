# Plan: logout-menu

Branch: `claude/logout-menu-s7okcx`

## Acceptance criteria

### `lib/api/request` and `lib/api/auth`
- [ ] `logout()` POSTs `/auth/logout` (not `/api/v1`) with CSRF header from cookie, no body, no Content-Type, resolves `{ logout_url }` — `frontend/src/lib/api/auth.ts`, test `auth.test.ts` (fetch mocked)
- [ ] 401, 403, 429 (`Retry-After: 7`) reject with `ApiError` (status, problem, retryAfter 7) — `auth.test.ts`
- [ ] Existing `request.test.ts` cases pass unchanged; new case proves the logout path is requested — `lib/api/request.ts`, `request.test.ts`

### `logoutTarget` / `describeLogoutFailure`
- [ ] `logoutTarget` returns valid URLs unchanged and `'/'` for every listed bad input — `features/account/lib/logout.ts`, `logout.test.ts`
- [ ] `describeLogoutFailure` per the failure table — `logout.ts`, `logout.test.ts`

### `useLogout`
- [ ] 200 + valid URL: `goTo` once with URL, no toast, disabled stays true — `features/account/hooks/useLogout.ts`, `useLogout.test.tsx`
- [ ] 200 + empty / `javascript:` URL: `goTo('/')` once — `useLogout.test.tsx`
- [ ] Second `logout()` in flight or after success sends nothing — `useLogout.test.tsx`
- [ ] 403, 501, 500, network error: toast "Couldn't log out." (error), no `goTo`, re-enabled — `useLogout.test.tsx`
- [ ] 429 `Retry-After: 3` toast; re-enabled — `useLogout.test.tsx`
- [ ] 401 toast with "Log in" action to `loginHref` of `/trash?x=1`; re-enabled — `useLogout.test.tsx`
- [ ] Retry after failure works — `useLogout.test.tsx`

### `AccountMenu` and `SidebarContent`
- [ ] Trigger button "Account & help" with class `sidebar__top-link`; menu closed until opened; two menuitems in order — `features/account/components/AccountMenu.tsx`, `AccountMenu.test.tsx`
- [ ] "Account & help" item navigates via router (no `goTo`), `onNavigate` once, closes; same on `/account` — `AccountMenu.test.tsx`
- [ ] "Log out" calls `logout` once, no `onNavigate`, closes — `AccountMenu.test.tsx`
- [ ] Trigger disabled while pending, enabled after failure, disabled after success — `AccountMenu.test.tsx`
- [ ] Footer menu after Folders; old link role gone; three old link tests replaced — `app-shell/SidebarContent.tsx`, `SidebarContent.test.tsx`
- [ ] Keyboard: Enter opens, ArrowDown reaches "Log out", Esc closes and refocuses trigger — `AccountMenu.test.tsx`

### `Menu` (additive props)
- [ ] Existing `Menu.test.tsx` cases unchanged and passing — `components/ui/Menu.tsx`, `Menu.test.tsx`
- [ ] `side="top"` `align="start"` reach positioner (`data-side`/`data-align`) — `Menu.test.tsx`

### Repo-wide
- [ ] `make check` passes
- [ ] Nothing outside allowed paths changed
- [ ] `make test-integration-local`: not run: task does not touch `backend/`

## Judgment calls
(filled in at the end)
