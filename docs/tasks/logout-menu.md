# Task: log out and the sidebar's account menu (front end)

> Front end. One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> **Prerequisite:** `auth-backend` is merged: `authLogout` (`POST /auth/logout`) is a real handler on `main` (`func (s *Server) AuthLogout` in `backend/internal/handler/auth.go`; the old 501 stub in `stubs.go` is still there but the real method shadows it). `frontend/src/lib/api/schema.d.ts` must already have the `authLogout` operation with its `200` (`{ logout_url }`), `401`, `403` and `429`. `account-area` is merged: the sidebar footer, `SidebarContent`, `AccountPage` and `features/account/` exist. If any is missing, stop and ask; do not create it, and do not edit `schema.d.ts` (only the user regenerates it). Every test here mocks the API wrapper; the server is not available to you.

## Goal

A signed-in user can log out from the sidebar. The footer's "Account & help" link becomes a menu with two entries, "Account & help" (goes to the account page, as the link did) and "Log out". Choosing "Log out" ends the app session on the server and then sends the browser to the identity provider's logout address that the server returns, so the identity-provider session ends too.

Requirements covered: FR-2, the app's half (logout ends the app session: the call is made with the CSRF header, and the browser then navigates to the returned `logout_url`; that the identity-provider session really ends is checked by the user by hand, see Out of scope), NFR-13 (the logout call is a write: it carries `X-CSRF-Token` from the cookie, like every other write).

Out of scope, and why:

- **The login screen and a way to learn you are signed out without waiting for a 401** (backlog): needs a who-am-I endpoint that does not exist yet. After a logout the identity provider sends the browser back to the app's `/`, and until the login screen exists that page shows the list's own signed-out message with its "Log in" link.
- **Clearing the `session` and `csrf_token` cookies on logout** (backlog, "Login hardening"): the contract's `200` lists no `Set-Cookie`. The cookies stay in the browser, dead.
- **Checking the Kinde logout address by hand.** The logout parameter name and the URLs to register in Kinde are unverified (`STACK.md`, "Open items"). That is the user's check, not a test.
- **Any change to the Account & help page.** It keeps its two sections; it gets no Log out button (the design puts Log out in the sidebar menu only).
- **A confirmation before logging out.** Logging out is reversible by logging in; the design has none.
- **Dev-login sessions.** With dev login on and the identity provider off, the server answers `authLogout` with `501` (`backend/internal/handler/auth.go`). The `501` is handled only by the generic failure toast ("Couldn't log out."), with no special case; to use Log out locally, run with the identity provider enabled.
- **Server, contract, `docs/**`**: unchanged.

## The design

Read in `docs/design/ui-reference/` (read-only reference, not code to copy): `src/components/Sidebar.tsx` (lines 80 to 101: the account menu) and the CSS rules `.sidebar__account*`, `.avatar` in `src/styles/layout.css`. The reference uses Headless UI and `react-icons`, and its menu button shows an avatar: this repo uses the `Menu` wrapper over Base UI (`components/ui/Menu.tsx`) and `lucide-react`. Copy no `.tsx` or `.ts` file. Where this file and the reference disagree, this file wins; say so in your report. Known departures: no avatar (the trigger keeps the icon and text the footer link has now), and the menu opens upward from the footer through `Menu`'s new `side` option.

## Role and ownership

Role: Frontend (see `AGENTS.md`).

You may change `frontend/**` except `package.json`, `package-lock.json`, `README.md` and any stylelint configuration. You may not change `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/logout-menu.plan.md`, see `AGENTS.md`), the Makefile, or `frontend/src/lib/api/schema.d.ts` (generated).

**Shared files.** `undo-restores-folder` (front end) may still be unmerged; it changes only `lib/bookmarks/useDeleteBookmark.ts`, `features/bookmark-list/components/BookmarkRow.tsx` and their tests. You do not change those. A backend task (rate limiting) may run at the same time; it touches only `backend/**`. You change: `components/ui/Menu.tsx` and `Menu.test.tsx` (additive only: used by `BookmarkRow` and `FolderTree`, whose behavior must not change), `lib/api/request.ts` and `request.test.ts` (additive only: every existing call and test keeps working), `app-shell/SidebarContent.tsx` and `SidebarContent.test.tsx`, `styles/layout.css` (the footer and `.sidebar__top-link`), and the new files under Structure. You also update the doc comments of `lib/goTo.ts` (it is no longer only "the login link") and of `apiRequest` in `request.ts` (it no longer always requests `/api/v1<path>`); change nothing else in `goTo.ts`. You do not change `AppShell.tsx`, `Drawer.tsx`, `AccountPage.tsx`, `describeFailure.ts`, or any other page or feature.

## Operations used

- `authLogout` (`POST /auth/logout`), real on the server. Header parameter `X-CSRF-Token`; no request body. Responses the contract lists: `200` with `{ "logout_url": "<uri>" }`, `401` (problem), `403` (problem, CSRF), `429` (problem, with `Retry-After`). It lists no other status. Note the path: it is **not** under `/api/v1` (the contract gives `/auth/logout` its own server `/`), unlike every other wrapper in `lib/api/`. In development Vite already proxies `/auth`. Take the response type from `schema.d.ts` (generated); do not write a second copy.

## Behavior

### The footer menu

The sidebar footer (`sidebar__footer`, after `sidebar__scroll`) holds one `Menu` instead of the `NavLink`. Its trigger looks like the links above it: the same `CircleUser` icon and the text "Account & help" inside a button that carries the class `sidebar__top-link`, full width of the footer, left-aligned, the same look and hover as the "All bookmarks" and "Trash" links. Its accessible name is "Account & help". The menu opens **upward** from the trigger (`side="top"`) and lines up with the trigger's left edge (`align="start"`). Items, in this order:

1. "Account & help", with a `lucide-react` `CircleHelp` icon. Choosing it goes to `/account` in the same tab through the router (no full page load, no new tab), and calls the sidebar's `onNavigate` once (so the drawer closes). `Menu`'s existing link items open in a new tab, so do not use `href` for this one: use a select handler that navigates with the router and then calls `onNavigate`. Choosing it on `/account` itself does the same (it stays on `/account`, and `onNavigate` is called).
2. "Log out", with a `lucide-react` `LogOut` icon. Choosing it starts the logout below. It does **not** call `onNavigate`.

Choosing an item closes the menu (`Menu` does this). Esc closes it and returns focus to the trigger (`Menu`'s existing behavior). The popup is the existing `dropdown` (width and look as the other menus); its positioner's existing z-index (70, `components.css`) already sits above the drawer, as the folder menus inside the drawer show; read the CSS to confirm and do not change it. Trigger states: while the menu is open (`data-popup-open`) it shows the same background as the link hover; while disabled it is dimmed (`opacity: 0.6`) with the default cursor. A disabled trigger shows no hover background (`.sidebar__top-link:disabled:hover` sets `background: none`). Add these as new selectors (`.sidebar__top-link[data-popup-open]`, `.sidebar__top-link:disabled`, `.sidebar__top-link:disabled:hover`) after the existing `.sidebar__top-link` rules.

The footer no longer marks "Account & help" as the current page on `/account` (it was a link with `aria-current`; the trigger is a button). Accepted: see Known gaps.

### Logging out

One logout at a time. After "Log out" is chosen:

1. The trigger is disabled (the `Menu`'s `disabled`) while the request is in flight, and **stays disabled after a success** until the page unloads, so a second logout cannot be sent (it would answer `401`).
2. Call `POST /auth/logout` with `X-CSRF-Token` from the `csrf_token` cookie (read at call time, as every write does), no body.
3. On `200`, read `logout_url`:
   - If it is a string that starts literally with `http://` or `https://` (compared ignoring case), parses with `new URL` (no base) with that protocol and a non-empty host name, has no username and no password, and contains no ASCII control or space character (`U+0000` to `U+0020`, `U+007F`) and no backslash anywhere in the string, navigate the browser to the **original string, unchanged** (not the parsed `href`) with a full page load (`goTo`, `lib/goTo.ts`). There is no length limit.
   - Otherwise (missing, empty, not a string, not absolute such as `//evil.example/x` or `/relative`, a scheme without the two slashes such as `https:evil.example` or `https:/evil.example`, an empty host such as `https:///x`, any other scheme such as `javascript:` or `data:`, credentials in the URL, a backslash, a control or space character), navigate to `/` with `goTo('/')` instead. The session on the server is already gone; the app then shows its signed-out state. No toast.
4. A failure shows a toast and re-enables the trigger. Nothing is refreshed (no query is invalidated: nothing on the server changed except for a `401`, where the session was already gone):

| Failure | Toast | Tone | Extra |
|---|---|---|---|
| `401` | `You're logged out.` (the existing `LOGGED_OUT_TOAST`) | error | an action "Log in" that goes to `loginHref(pathname, search)` of the current location, as every other signed-out toast does |
| `429` | `rateLimitMessage(retryAfter)` (the existing function: "Too many requests. Try again in about N seconds." or "…in a moment.") | error | |
| `403`, `501`, any other status, a network failure | `Couldn't log out.` | error | |

The toast comes from `useToast()` (`components/ui/useToast`), which the sidebar's folder menus already use. The new message is an exported constant `LOGOUT_FAILED`.

### Known gaps

- **The "current page" highlight on `/account` is gone** from the footer. A button cannot carry the link's `aria-current`. If the user wants it back, it is a small follow-up.
- **The drawer resets the guard.** In the narrow layout the drawer's content unmounts every time the drawer closes (`AppShell` renders it only while open), and "Log out" does not close it. If the user closes and reopens the drawer between a successful `200` and the page leaving, the trigger is enabled again and a second "Log out" is possible; the server answers `401` and the user sees the "You're logged out." toast with "Log in". Accepted: the navigation follows the `200` at once, so the window is a moment. The state is not lifted above the sidebar.
- **An invalid `logout_url` ends the app session but not the identity provider's.** The fallback to `/` is silent: no message. The server builds the URL from operator settings, so this is a misconfiguration, not a user error.
- **`http:` is accepted for `logout_url` in any environment.** The server validates the setting as an `http` or `https` URL; only the app's own base URL must be `https` in production.
- **A `200` whose body is not JSON** is a failure like any other (`Couldn't log out.`); the contract guarantees JSON. The session is then already gone, so a retry shows the `401` toast.
- **Focus after choosing "Log out"** is whatever the browser does when the trigger becomes disabled; it is not tested.
- **The popup may flip.** It opens upward by preference; if it does not fit, Base UI's collision handling may open it downward. Accepted; the task does not turn that off.
- **After a successful `200` and before the page leaves**, the sync poll behind the page may get a `401` and show a signed-out message for a moment. The navigation follows immediately.
- **If the server ends the session but the answer is lost** (a network failure on the response), the toast says "Couldn't log out."; a second try then answers `401` and shows the "You're logged out." toast with "Log in". The identity-provider session is not ended in that case. Accepted.
- **When the `401` toast appears, the identity-provider session is still open**: there is no `logout_url`. A later login may sign straight in. Accepted.
- The logout address Kinde accepts is unverified (see Out of scope).

## Structure

By `ARCHITECTURE.md` and `CONVENTIONS.md`.

- `lib/api/request.ts`: make the smallest additive change that lets one call go to `/auth/logout` instead of `/api/v1<path>`, keeping the CSRF header, `ApiError`, `Retry-After` and `204` handling shared (for example an optional options argument, or a second exported function that shares the internals). Every existing call and test in `request.test.ts` must pass unchanged, and a new test must prove the logout path is requested.
- `lib/api/auth.ts` (new) with `auth.test.ts`: `logout(): Promise<{ logout_url: string }>`, typed from `schema.d.ts`. A thin wrapper like `lib/api/account.ts`.
- `features/account/lib/logout.ts` (new) with its test, pure functions: `logoutTarget(url: unknown): string` (the URL when it is an absolute `http:` or `https:` URL, otherwise `'/'`) and `describeLogoutFailure(error: unknown): { signedOut: boolean; message: string }` (the failure table: `signedOut` true only for a `401`, with an empty message then; `rateLimitMessage` for `429`; `LOGOUT_FAILED` otherwise). Export `LOGOUT_FAILED`. Reuse `rateLimitMessage` (exported from `lib/bookmarks/describeFailure.ts`) and `LOGGED_OUT_TOAST`; do not copy them.
- `features/account/hooks/useLogout.ts` (new) with its test: returns `{ logout, disabled }`. `logout()` is the flow above: an in-flight guard that also holds after a success, `disabled` true while in flight and after a success, the toasts, and `goTo`. It needs the router location for the `401` toast's login link and `useToast`.
- `features/account/components/AccountMenu.tsx` (new) with its test: the footer `Menu` described above. It takes `onNavigate?: () => void`.
- `components/ui/Menu.tsx`: add two optional props, `side?: 'top' | 'bottom'` and `align?: 'start' | 'end'`, passed to the Base UI positioner. When absent, the menu behaves exactly as today (`align="end"`, the default side). No other change: link items still open in a new tab.
- `app-shell/SidebarContent.tsx`: the footer renders `<AccountMenu onNavigate={onNavigate} />` in place of the `NavLink`. Update the file's doc comment ("the 'Account & help' link" becomes the menu).
- `styles/layout.css`: make the button look like the links by **editing the existing** `.sidebar__top-link` rule (add what a `<button>` needs: full width, no background and border, inherited font, left aligned, pointer cursor); do not add a second block for it. `make check` runs stylelint with `no-duplicate-selectors` and `no-descending-specificity`. Keep the existing hover and `[aria-current]` rules where they are.

## Dependencies

None. Nothing is added to `package.json`.

## Acceptance criteria

All tests mock `lib/api/auth` (or `fetch` where the wrapper itself is under test) and `lib/goTo`; no network. Component tests use `renderApp` from `test/wrap.tsx` (router, toast provider and query client; `renderApp(ui, { path })` sets the location); hook tests use `hookWrapper(client, path)` from `test/hookWrapper.tsx`, as `useDeleteBookmark.test.tsx` does. Do not add a second stand-in. Tone is read from the toast root: `screen.getByText(text).closest('.toast')` has the class `toast--error` (as `Toast.test.tsx` does).

**`lib/api/request` and `lib/api/auth`**

- `logout()` sends `POST` to `/auth/logout` (not under `/api/v1`) with `X-CSRF-Token` taken from the `csrf_token` cookie, no body and no `Content-Type`, and resolves the parsed `{ logout_url }`.
- A `401`, `403` and a `429` with `Retry-After: 7` reject with `ApiError` carrying the status, the problem body and `retryAfter` 7.
- Every existing `request.test.ts` case still passes (a request to `/api/v1/...` is unchanged).

**`logoutTarget` and `describeLogoutFailure` (pure)**

- `logoutTarget`: `https://id.example/logout?redirect=http%3A%2F%2Fapp`, an `http:` URL, `HTTPS://ID.EXAMPLE/x` (returned as typed, not lower-cased) and a 5,000-character `https:` URL are returned unchanged; `''`, `undefined`, `null`, a number, `javascript:alert(1)`, `data:text/html,x`, `ftp://x`, `/relative`, `//evil.example/x`, `not a url`, `https:evil.example`, `https:/evil.example`, `https:\\evil.example`, `https:///x`, `https://user:pw@id.example/`, `https://user@id.example/`, `https://id.example/a b`, `https://id.example/a\\b` and `https://id.example/\nx` all give `'/'`.
- `describeLogoutFailure`: `401` gives `signedOut: true` and an empty message; `429` with `retryAfter` 7 gives "Too many requests. Try again in about 7 seconds.", with `retryAfter` 0 "Too many requests. Try again in about 0 seconds." (the existing `rateLimitMessage` wording, a known loose end in the backlog), and with `retryAfter` null (no header, or an HTTP date, which `apiRequest` turns into null) "Too many requests. Try again in a moment."; `403`, `501`, `500`, a non-`ApiError` and a `TypeError` give `Couldn't log out.` with `signedOut: false`.

**`useLogout`**

- On `200` with a valid URL, `goTo` is called once with that URL; no toast; `disabled` is true while pending and stays true after.
- On `200` with an empty `logout_url`, and with `javascript:alert(1)`, `goTo` is called once with `/` and never with the bad value.
- A second `logout()` while the first is in flight, and one after a success, send nothing (the mock is called once).
- For each of `403`, `501`, `500` and a network error: the toast `Couldn't log out.` (error tone), `goTo` not called, `disabled` false again.
- `429` with `Retry-After: 3`: the toast "Too many requests. Try again in about 3 seconds."; `disabled` false.
- `401`: the toast "You're logged out." (error tone) with an action "Log in"; pressing it calls `goTo` with `loginHref` of the current location (a test renders the hook at `/trash?x=1` and expects the link to return to `/trash?x=1`); `disabled` false.
- A failure is followed by a working retry: after a `500`, a second `logout()` sends again and navigates on `200`.

**`AccountMenu` and `SidebarContent`**

- The trigger is a button named "Account & help", with the class `sidebar__top-link`; before it is opened no menu is shown. Opening it shows two `menuitem`s, "Account & help" then "Log out", in that order.
- Choosing "Account & help" navigates to `/account` (the router location changes, no full page load: `goTo` is not called), calls `onNavigate` exactly once, and closes the menu. On `/account` already, it stays there and still calls `onNavigate` once.
- Choosing "Log out" calls `logout` once, does **not** call `onNavigate`, and closes the menu.
- While a logout is pending the trigger is disabled; after a failure it is enabled again; after a success it stays disabled.
- In `SidebarContent`, the footer menu comes after the Folders section (document order), and the old link role is gone: `getByRole('link', { name: 'Account & help' })` finds nothing. The three tests in `SidebarContent.test.tsx` that look for that link are replaced by these.
- Keyboard: Enter on the trigger opens the menu, ArrowDown reaches "Log out", Esc closes it and returns focus to the trigger.

**`Menu` (additive props)**

- Without `side` and `align`, every existing `Menu.test.tsx` case passes unchanged (`BookmarkRow` and `FolderTree` tests too).
- With `side="top"` and `align="start"` the popup carries `data-side="top"` and `data-align="start"` (or, if jsdom cannot show them, a test the builder designs that proves the two props reach the positioner; say which in the report).

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

- Read the diff: `useLogout` never touches the query client (nothing is invalidated on any outcome); the only place that navigates away is `useLogout` through `goTo`; it never passes an unchecked `logout_url`; `logoutTarget` is the only gate and is tested with the bad schemes above.
- Confirm the logout request really goes to `/auth/logout` and is not rewritten to `/api/v1/auth/logout`; and that every other wrapper still requests `/api/v1/...`.
- Confirm `Menu`'s defaults are unchanged: a diff of `Menu.tsx` shows only the two optional props and their pass-through.
- Confirm the footer menu is the only thing in the footer; no `NavLink` to `/account` remains; no `href` on the "Account & help" menu item (it would open a new tab).
- No new `dangerouslySetInnerHTML`, no `eval`, no `window.location` assignment outside `lib/goTo.ts`.
- Check by reading the CSS that `.sidebar__top-link` was edited in place (one block), and that stylelint passes.
- Confirm the tests discriminate: in a scratch copy, (a) skip the `logoutTarget` check and pass the raw URL, (b) re-enable the trigger after a success, (c) drop the CSRF header from the logout call, (d) send the call to `/api/v1/auth/logout`, (e) call `onNavigate` for "Log out", (f) navigate with a full page load for "Account & help"; each must turn a test red. Revert them.
- Inputs to try to break it with: a `logout_url` of `//evil.example/x`, `HTTPS://ID.EXAMPLE/x`, a very long one, one with a newline, and one with credentials (`https://user:pw@id.example/`); double-clicking "Log out" and pressing Enter twice; choosing "Log out" while the drawer is open; choosing "Account & help" in the drawer (it must close); a `429` with `Retry-After: 0`, with no header and with an HTTP date; a `401` on a deep path with a query (the login link must return to it); the menu opened on a short sidebar and on a long folder list (it opens upward when it fits, may flip when it does not, and is reachable either way); a `logout_url` with credentials, a space or a newline (must go to `/`, never to the value).

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, the design reference or this file conflict with each other.
- You think you need a change outside your paths, a dependency, or an edit to a spec file; or `schema.d.ts` lacks `authLogout` or types `logout_url` differently from this file.
- Base UI's menu cannot take a `side` or `align`, or cannot open upward inside the drawer.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `npm ci` in `frontend/` first on a fresh checkout, run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), any place you departed from the reference design and why, the known gaps, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle, how you extended `request.ts`, and how you proved the `Menu` props reach the positioner. Run each test file that uses timers or navigation several times before ticking it, so a flaky test is found by you rather than by the verifier.
