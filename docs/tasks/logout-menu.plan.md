# Plan: logout-menu

Branch: `claude/logout-menu-s7okcx`

## Acceptance criteria

### `lib/api/request` and `lib/api/auth`
- [x] `logout()` POSTs `/auth/logout` (not `/api/v1`) with CSRF header from cookie, no body, no Content-Type, resolves `{ logout_url }` — `frontend/src/lib/api/auth.ts`, test `auth.test.ts` (fetch mocked)
- [x] 401, 403, 429 (`Retry-After: 7`) reject with `ApiError` (status, problem, retryAfter 7) — `auth.test.ts`
- [x] Existing `request.test.ts` cases pass unchanged; new case proves the logout path is requested — `lib/api/request.ts`, `request.test.ts`

### `logoutTarget` / `describeLogoutFailure`
- [x] `logoutTarget` returns valid URLs unchanged and `'/'` for every listed bad input — `features/account/lib/logout.ts`, `logout.test.ts`
- [x] `describeLogoutFailure` per the failure table — `logout.ts`, `logout.test.ts`

### `useLogout`
- [x] 200 + valid URL: `goTo` once with URL, no toast, disabled stays true — `features/account/hooks/useLogout.ts`, `useLogout.test.tsx`
- [x] 200 + empty / `javascript:` URL: `goTo('/')` once — `useLogout.test.tsx`
- [x] Second `logout()` in flight or after success sends nothing — `useLogout.test.tsx`
- [x] 403, 501, 500, network error: toast "Couldn't log out." (error), no `goTo`, re-enabled — `useLogout.test.tsx`
- [x] 429 `Retry-After: 3` toast; re-enabled — `useLogout.test.tsx`
- [x] 401 toast with "Log in" action to `loginHref` of `/trash?x=1`; re-enabled — `useLogout.test.tsx`
- [x] Retry after failure works — `useLogout.test.tsx`

### `AccountMenu` and `SidebarContent`
- [x] Trigger button "Account & help" with class `sidebar__top-link`; menu closed until opened; two menuitems in order — `features/account/components/AccountMenu.tsx`, `AccountMenu.test.tsx`
- [x] "Account & help" item navigates via router (no `goTo`), `onNavigate` once, closes; same on `/account` — `AccountMenu.test.tsx`
- [x] "Log out" calls `logout` once, no `onNavigate`, closes — `AccountMenu.test.tsx`
- [x] Trigger disabled while pending, enabled after failure, disabled after success — `AccountMenu.test.tsx`
- [x] Footer menu after Folders; old link role gone; three old link tests replaced — `app-shell/SidebarContent.tsx`, `SidebarContent.test.tsx`
- [x] Keyboard: Enter opens, ArrowDown reaches "Log out", Esc closes and refocuses trigger — `AccountMenu.test.tsx`

### `Menu` (additive props)
- [x] Existing `Menu.test.tsx` cases unchanged and passing — `components/ui/Menu.tsx`, `Menu.test.tsx`
- [x] `side="top"` `align="start"` reach positioner (`data-side`/`data-align`) — `Menu.test.tsx`

### Repo-wide
- [x] `make check` passes (last run: exit 0, 956 frontend tests passed)
- [x] Nothing outside allowed paths changed
- [x] `make test-integration-local`: not run: the task does not touch `backend/`

## Judgment calls
- `request.ts` extended with an optional fourth argument `{ base?: string }` (default `/api/v1`); `logout()` passes `base: ''`. Every other call is untouched.
- `logoutTarget` also rejects a string whose authority is empty (`https:///x`): `new URL` alone fills a host from the path, so the string is checked too. A bare `https://` is likewise rejected.
- The `401` toast test asserts the login link contains the encoded `/trash?x=1` and `return_to=` rather than a fixed path, since `loginHref` differs between dev and production builds.
- `Menu` `side` prop has no default (undefined lets Base UI pick), `align` defaults to `end`. Proof the props reach the positioner: jsdom does render `data-side="top"` and `data-align="start"` on the popup, asserted in `Menu.test.tsx`.
- No-error check on 200 uses `.toast` absence (the toast region is always present).
- Unrelated flake: `EmptyTrash.test.tsx` "focuses the field on open" failed in 1 of 2 full `make check` runs and 2 of 3 isolated runs; I did not touch it.
- The reference design's avatar and Headless UI are not used (task's known departures); the task file wins.
- `make test-integration-local` skipped since nothing under `backend/` changed.
