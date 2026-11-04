# Task: login screen and the global "401 means log in, then come back" rule (front end)

> Front end. One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> **Prerequisite:** `logout-menu` is merged. Check it: `frontend/src/lib/api/auth.ts` exists, and `lib/api/request.ts` can send a call to `/auth/logout` (not under `/api/v1`) as that task added. This task changes `request.ts` and `styles/layout.css`, which `logout-menu` also changes, so it runs after it. If it is not merged, stop and ask. `auth-backend` is merged (`authLogin` and `authCallback` are real). The contract needs no change: this task adds no endpoint and uses `getSyncVersion` only as it is.

## Goal

A signed-out user who opens the app, or whose session ends while they use it, is taken to a plain login screen at `/login`, and after logging in lands back on the page they were on, with the same query. This includes the save popup: opening `/save?url=…&title=…` signed out leads to login and back to the same `/save` URL (FR-3c). A signed-in user who opens `/login` is sent on to where they were going. No new endpoint: the app already learns it is signed out because every authenticated call answers `401`, and the sync poll asks every 2.5 seconds.

Requirements covered: FR-1 (the login screen's button starts the identity-provider login), FR-3c (the save page, opened signed out, goes through login and returns to the same page with the same parameters), NFR-15 (an expired session sends the user through login and then back to where they were).

Out of scope, and why (the first item is its own task, in the backlog):

- **Removing the old per-screen signed-out UI.** Every screen still has its own `SignedOutMessage` banner, "Log in" toast action, `signedOut` failure flags and the save popup's `needs-login` phase. They stay as they are in this task: after a `401` the redirect starts at once, so a banner shows for a moment at most. Removing them is the follow-up task (backlog: "Split from `login-screen`").
- **Who-am-I or any new endpoint.** Not needed (above); the brief never shows who you are.
- **Login hardening** (binding the login to the browser, clearing cookies on logout): backend and contract, backlog.
- **What a user sees when the login callback fails** (`authCallback` answers `400` as a problem document, which the browser shows as plain text). Not handled here.
- **The "Account deleted" page** (`AccountDeleted`) and its "Log in" link: unchanged.
- **Server, contract, `docs/**`**: unchanged.

## The design

Read, in `docs/design/ui-reference/` (read-only reference, not code to copy): `src/pages/LoginPage.tsx` and the CSS rules `.login-page`, `.login-card*` and `.full-page-loading` in `src/styles/layout.css`. Copy no `.tsx` or `.ts` file; copy only those CSS rules into `frontend/src/styles/layout.css` (new selectors, appended; keep the class names). The reference's page logs in through a mock; yours links to the real login. Do not use `react-icons`; the icon is `lucide-react`'s `Bookmark`. Where this file and the reference disagree, this file wins; say so in your report. Known departures: the button is a link (a full page load to the identity provider), the app name is "marker" (the sidebar's name), and the page first checks whether you are already signed in.

## Role and ownership

Role: Frontend (see `AGENTS.md`).

You may change `frontend/**` except `package.json`, `package-lock.json`, `README.md` and any stylelint configuration. You may not change `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/login-screen.plan.md`, see `AGENTS.md`), the Makefile, or `frontend/src/lib/api/schema.d.ts` (generated).

**Shared files.** A backend task (rate limiting or login hardening) may run at the same time; it touches only `backend/**`. `undo-restores-folder` may still be unmerged; it changes only `lib/bookmarks/useDeleteBookmark.ts`, `features/bookmark-list/components/BookmarkRow.tsx` and their tests, which you do not touch. No other front-end task runs at the same time. You change: `lib/api/request.ts` and `request.test.ts`, `lib/api/auth.test.ts` and the `logout` cases `logout-menu` added to `request.test.ts` (they make the real call answer `401` with a stubbed `fetch`, so each such case must mock `lib/goTo`), `test/setup.ts` (only to reset the once-per-page guard and the browser location to `/` after each test; add nothing else), `lib/loginHref.ts` and `loginHref.test.ts`, `App.tsx` (one route), `features/account/hooks/useLogout.ts` and its test (one added call, see "The global rule"), `styles/layout.css` (appended rules), and the new files under Structure. You do not change `App.test.tsx` (its file-level mocks of `lib/api/folders` and `lib/api/sync` would get in the way; the `App` tests are in a new file), any other existing page, hook or component (the old signed-out UI stays), `AppShell`, `useSyncPoll` or `lib/goTo.ts`.

## Operations used

- `getSyncVersion` (`GET /api/v1/sync/version`), real on the server. Used by the login screen as a one-shot "am I signed in" probe: `200` means signed in, `401` means not. The contract lists `200` and `401` for it (the "any endpoint can answer 429" sentence applies in general, but the endpoint is exempt from rate limiting, NFR-16). Existing wrapper `getSyncVersion()` in `lib/api/sync.ts`; call it with no arguments, as `useSyncPoll` does.
- `authLogin` (`GET /auth/login?return_to=…`): not called from code; the login button is a plain link to it (through the existing `loginHref`). `return_to` is a same-origin relative path; the server ignores anything else and falls back to `/`. In a development build `loginHref` points at `/auth/dev-login` instead, as it does today.

## Behavior

### The global rule

`apiRequest` (`lib/api/request.ts`) is the one place every API call goes through. Put the hook in the shared internals that **every** call passes through, including the `/auth/logout` call that `logout-menu` added by whatever means (an option on `apiRequest` or a second function sharing its internals). If there is no such shared place (two separate `fetch` paths), stop and ask. When a response has status `401`, before it throws the `ApiError` (callers still get their rejection, and their old messages still work), it asks `redirectToLogin()` to send the browser to the login screen:

- The target is `/login?return_to=<the current path and query, URL-encoded>`, where the current location is `window.location.pathname + window.location.search`, read when the `401` arrives. It goes through `goTo` (`lib/goTo.ts`, a full page load), so every in-memory state is dropped.
- It happens **at most once per page load**: further `401`s from the calls that were in flight (the list, the folders and the poll often fail together) do nothing more.
- It does **nothing when the current path is `/login` or `/login/`, in any letter case** (the query does not matter; the login screen asks `getSyncVersion` and must be allowed to see a `401`). A call skipped for this reason does not use up the once-per-page-load guard.
- Any other status (`403`, `404`, `429`, `5xx`), a network failure, and every `2xx` do not trigger it.
- It applies to every call through `apiRequest`, including the logout call (`/auth/logout`) that `logout-menu` added.

**After a successful logout the rule is switched off.** `logout-menu`'s flow ends a successful `200` with a full page load to the identity provider's logout address (or to `/`). The server session is already gone then, so a poll or any other call that is still running would answer `401`, and a second `goTo` would replace the navigation to the identity provider, leaving that session open. So `loginRedirect.ts` also exports `suppressLoginRedirect()`, which uses up the once-per-page guard (afterwards no `401` redirects, until the page reloads), and `useLogout` (`features/account/hooks/useLogout.ts`, from `logout-menu`) calls it on a successful `200`, right before it calls `goTo` (for the identity-provider address and for the `/` fallback alike). A failed logout (any status) does not call it.

The path in `return_to` can itself hold a query (`/save?url=https%3A%2F%2Fx.test%2F&title=A%20B`): the whole path and query is encoded once, so it survives the round trip exactly (see the criteria).

### The login screen (`/login`)

A new route `/login`, outside `AppShell` (no sidebar, no sync poll). It reads `return_to` from the query and works out a safe path (below).

1. **Checking.** On mount it asks `getSyncVersion()` once, through TanStack Query (`useQuery` with `queryFn: () => getSyncVersion()`, so the query context is not passed as an argument; no retries, `gcTime: 0`, a key of its own such as `['login-probe']`, `refetchOnWindowFocus: false`, no interval) so React StrictMode does not send it twice. While it is pending the page shows only a centered `role="status"` line "Checking your session…" in a `full-page-loading` container: no card, no button.
2. **Already signed in** (`200`): it goes to the safe return path with the router's `replace` navigation (the Back button does not return to `/login`).
3. **Anything else** (`401`, `429`, `5xx`, a network failure): it shows the card. The card is always usable, whatever the probe said.

The card, in this order: the `Bookmark` icon in `login-card__brand`; an `h1` "marker"; the text "A place to dump links and find them again."; a link with the text "Log in", classes `btn btn--primary btn--block`, whose `href` is `loginHref(<safe return path>, '')` (the existing function; it encodes the path, and in a development build goes through dev-login); and the fine print "You'll continue to your identity provider to sign in with email and password, or SSO." The link is a plain anchor (a full page load), not a router link, and not a button.

**The safe return path** is a pure function `safeReturnTo(raw: string | null): string`. It returns `raw` only when all of these hold, otherwise `/`: it is a string; it starts with a single `/` (not `//`); it contains no backslash and no ASCII control or space character (`U+0000` to `U+0020`, `U+007F`); it is at most 8,192 characters (JavaScript string length; the server's cap of 8,192 counts bytes and re-checks everything itself, so this only has to be no looser for ASCII; 8,192 is kept, 8,193 becomes `/`); and its path part is not a server route or the login screen itself, that is, compared ignoring case it is not equal to `/login`, `/auth` or `/api` and does not start with `/login/`, `/auth/` or `/api/` (so it can neither loop nor land on a server route; the router matches routes ignoring case, so the comparison does too). "Path part" is the text before the first `?` or `#`. So `/login`, `/Login/`, `/auth`, `/AUTH/x`, `/api` and `/API/v1/x` fall back to `/`, while `/loginx`, `/authentic` and `/apix` are kept. Dot segments and percent-encoded letters in the path (`/./login`, `/%6Cogin`) are not decoded or resolved; the server re-checks.

### Other pieces

- `lib/loginHref.ts` gains `loginPageHref(pathname: string, search: string): string` returning `/login?return_to=<encodeURIComponent(pathname + search)>`. The existing `loginHref` is unchanged. `redirectToLogin()` uses `loginPageHref`.
- `redirectToLogin()`, `suppressLoginRedirect()` and the once-per-page guard live in a new small module so `request.ts` stays readable. The guard is module state; the module exports a reset function for tests only, named so it is clear (for example `resetLoginRedirectForTests`).

### Known gaps

- **A signed-out user on a slow call sees the old banner for a moment** before the page changes (removed by the follow-up task).
- **A typed-but-unsaved title in the save popup is lost** when the `401` arrives after the user edited it (for example a session that ended while the popup was open). The popup returns with the original `url` and `title` from its address. A popup opened signed out loses nothing: it loads the folder list first, so it redirects before the user types.
- **`return_to` is only as long as the address allows.** A very long `/save?url=…` can exceed the server's 8,192-character cap; the server then falls back to `/` after login (the `auth-backend` behavior).
- **A probe that fails for another reason** (a network error) shows the card; the user can still press "Log in".
- **After a stray `401` while the "Account deleted" page is showing** (a request still in flight when the account went away), the page changes to `/login`. Accepted: nothing is in flight there.
- **Under dev login** the card's link signs in as the development user; there is no choice of name.
- **A signed-in user whose probe fails** (`429`, `5xx`, a network failure) sees the card and can press "Log in" anyway. Accepted.
- **The redirect drops the `#fragment`** of the page (`pathname + search` only). A fragment is not sent to the server and no screen uses one. `safeReturnTo` still keeps one if it is given.
- **A probe that never answers** keeps "Checking your session…" on screen; there is no timeout. The browser's own network timeout ends it, and then the card shows.
- **A loop across page loads is not bounded.** A signed-in user's `/login` probe answers `200`, the router moves to the target, and if the target's own call answered `401` it would go back to `/login`. Every endpoint shares one session check, so a `200` on the sync call with a `401` elsewhere is not expected. Not handled.
- **The logout toast and the redirect both fire on a `401` from logout.** `useLogout` (from `logout-menu`) shows "You're logged out." with "Log in", and the page then changes to `/login`. The follow-up task removes the toast. (A successful logout does not redirect: see "The global rule".)
- **Production serving of `/login`.** The Go server does not serve the front end in this repo; only the Vite dev server falls back to `index.html`. Deployment is not scoped (backlog, "Later").

## Structure

By `ARCHITECTURE.md` and `CONVENTIONS.md`.

- `lib/api/loginRedirect.ts` (new) with its test: `redirectToLogin()` (the rule above, calling `goTo` and reading `window.location`), and the test-only reset.
- `lib/api/request.ts`: on a `401`, call `redirectToLogin()` before throwing. No other change; every existing call and test passes.
- `lib/loginHref.ts`: add `loginPageHref`.
- `features/login/lib/safeReturnTo.ts` (new) with its test, pure.
- `features/login/hooks/useLoginProbe.ts` (new, with its test): the probe query and its outcome (`checking`, `signed-in`, `signed-out`).
- `features/login/components/LoginCard.tsx` (new, presentational: the card with a `returnTo` prop; its classes are `login-card`, `login-card__brand`, `login-card__title`, `login-card__desc`, `login-card__fineprint`, inside `login-page`) and `pages/LoginPage.tsx` (new, thin: reads the query, uses the hook, redirects or shows the card), each with a test.
- `App.tsx`: one route, `/login`, before the `*` route.
- `styles/layout.css`: append the `.login-page`, `.login-card*` and `.full-page-loading` rules copied from the reference, adapted to the app's tokens if a variable name differs. `make check` runs stylelint with `no-duplicate-selectors` and `no-descending-specificity`: add only new selectors and keep them after any rule they could conflict with.

## Dependencies

None. Nothing is added to `package.json`.

## Acceptance criteria

Tests of components and hooks use `renderApp` from `test/wrap.tsx` (router, toast provider, query client; `renderApp(ui, { path })` sets the router's location) and mock `lib/api/sync` and `lib/goTo`. Tests of `request.ts` mock `fetch` and `lib/goTo`, and set the browser location with `window.history.pushState` (the router is not involved there). Any other test that makes the real `apiRequest` answer `401` must also mock `lib/goTo` (the real one would try a jsdom navigation); `test/setup.ts` resets the once-per-page guard and the browser location (`/`) after every test. `renderApp` renders no routes and no location display: the page tests render `LoginPage` inside their own `<Routes>` with a small helper element that shows `useLocation().pathname` and `useNavigationType()`; a StrictMode test wraps the page in `<StrictMode>` itself. Do not add a second stand-in.

**`apiRequest` and `redirectToLogin`**

- A `401` for a call made while the location is `/trash?x=1` calls `goTo` once with `/login?return_to=%2Ftrash%3Fx%3D1`, and the call still rejects with an `ApiError` of status 401 carrying the problem body.
- Round trip: from `/save?url=https%3A%2F%2Fx.test%2Fa%3Fb%3D1&title=A%20B`, the `goTo` argument is `loginPageHref` of that path and query, and decoding its `return_to` with `URLSearchParams` gives back the exact original path and query.
- Two or three `401`s in a row (and in parallel) call `goTo` once in total. After the test reset, a new `401` calls it again.
- At the location `/login`, `/login/` and `/login?return_to=%2F`, a `401` does not call `goTo`, the call still rejects, and a later `401` from another location (after `pushState`) still calls `goTo` once (the skipped call did not use up the guard).
- `suppressLoginRedirect()` then a `401` does not call `goTo`; without it the same `401` does.
- FR-3c, whole client path (in the new `App.login.test.tsx`, which mocks only `lib/goTo` and stubs `fetch`): rendering `App` with `renderApp(<App />, { path: '/save?url=https%3A%2F%2Fx.test%2F&title=A%20B' })`, with `window.history.pushState` set to the same path, the real `lib/api/folders` wrapper and `fetch` stubbed to answer `401` with a problem body, and `goTo` mocked, ends with `goTo` called once with `/login?return_to=` plus that path and query encoded once. (The save popup loads the folder list on open, so this is what a signed-out popup does.)
- `403`, `404`, `429`, `500`, a network failure, a `204` and a `200` never call `goTo`.
- A `401` from the logout call (`/auth/logout`) calls `goTo` the same way.
- Every existing `request.test.ts` case still passes.

**`loginPageHref`**: `('/trash', '?x=1')` gives `/login?return_to=%2Ftrash%3Fx%3D1`; `('/', '')` gives `/login?return_to=%2F`. The existing `loginHref` tests pass unchanged.

**`safeReturnTo` (pure)**

- Kept as given: `/`, `/trash`, `/folder/abc?q=a%20b`, `/save?url=https%3A%2F%2Fx.test%2F&title=A`, `/bookmarks/1#x`, a path of exactly 8,192 characters, `/loginx`, `/authentic`, `/apix`.
- Give `/` (ignoring case, so also `/Login`, `/LOGIN/x`, `/Auth`, `/API/v1/x`): `null`, an empty string, `trash`, `//evil.example`, `/\evil`, `/a\b`, `https://evil.example/`, `javascript:alert(1)`, a path with a space, a newline or a NUL, 8,193 characters, `/login`, `/login?return_to=%2F`, `/login#x`, `/login/`, `/login/x`, `/auth`, `/auth/login`, `/auth/callback?code=x`, `/api`, `/api?x=1`, `/api/v1/bookmarks`.

**`LoginPage` and `LoginCard`**

- While the probe is pending: the text "Checking your session…" (role `status`) is shown, and neither the "Log in" link nor the card's heading is in the document.
- Probe `200` at `/login?return_to=%2Ftrash`: the router location becomes `/trash`, the navigation type shown by the helper element is `REPLACE`, and the card never shows. With no `return_to`, or an unsafe one (`//evil.example`, `/login`, `https://x`), it goes to `/`.
- Probe `401`: the card shows, with the heading "marker", the line "A place to dump links and find them again.", the fine print, and a link named "Log in" whose `href` equals `loginHref('/trash', '')` for `return_to=%2Ftrash`, in a production build (`vi.stubEnv('DEV', false)`: `/auth/login?return_to=%2Ftrash`) and in a development build (`/auth/dev-login?name=alice&return_to=%2Ftrash`). The link is an `a` element, not a button. With an unsafe or missing `return_to` the link's `href` is for `/`.
- Probe `429`, `500` and a network failure: the card shows the same way, and the link works.
- `getSyncVersion` is called exactly once, with no arguments, also under `<StrictMode>`, and a later advance of fake timers by 10 seconds makes no second call (no polling).
- The nested query survives: `return_to=%2Fsave%3Furl%3Dhttps%253A%252F%252Fx.test%252F%26title%3DA` gives a link whose decoded `return_to` is `/save?url=https%3A%2F%2Fx.test%2F&title=A`.
- The page has no sidebar and no navigation landmark (`queryByRole('navigation')` is null), and starts no sync poll (`getSyncVersion` is called only once, as above).

**`App`** (in the new `App.login.test.tsx`, with `fetch` stubbed to answer `401` for the sync call): the route `/login` renders the login page and the heading "marker" shows; the other routes are unchanged (`App.test.tsx` still passes untouched).

**`useLogout` (the one added call)**: on a successful `200` it calls `suppressLoginRedirect()` before `goTo`, for a valid `logout_url` and for the `/` fallback; on every failure (`401`, `403`, `429`, `5xx`, network) it does not call it. Existing `useLogout` tests pass.

**Not proved here**: the identity provider's side of FR-1 and the server's callback that completes NFR-15's "then back" (that is `auth-backend`, with its own tests); only the client half is proved (the encoded `return_to` and the link).

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

- Read the diff: `useLogout` calls `suppressLoginRedirect()` only on a successful `200`, before its `goTo`, and nowhere else (this closes the race between the poll's `401` and the navigation to the identity provider); only `request.ts` triggers the redirect, and only for a `401`; the guard is once per page load; `/login` never redirects; `goTo` is the only navigation (no `window.location` assignment elsewhere); `redirectToLogin` reads the location when the `401` arrives, not at import time.
- `safeReturnTo` is the only gate on `return_to`, used for both the post-login navigation and the link; the router navigation uses `replace`.
- The login link is a plain anchor built by `loginHref`, with no `onClick` that navigates through the router.
- The old signed-out UI (`SignedOutMessage`, `signedOut` flags, the "Log in" toast action, `LOGGED_OUT_TOAST`, the save popup's `needs-login` phase) is still there and unchanged: this task removes none of it.
- Check by reading the CSS that the login rules are new selectors only and stylelint passes.
- Confirm the tests discriminate: in a scratch copy, (a) remove the once-per-page guard, (b) make `/login` redirect too, (c) redirect on a `403` as well, (d) drop `replace` from the post-probe navigation, (e) accept `//evil.example` in `safeReturnTo`, (f) encode only the path and not the query in `loginPageHref`; each must turn a test red. Revert them.
- Inputs to try to break it with: a `return_to` that is itself `/login?return_to=…`; a `401` right after a successful logout (no redirect must follow it); each page load redirects at most once (a cross-load loop is a known gap, see above); `return_to` with `%0d%0a`, `%00`, `%5c`, a doubly encoded `//`; an `/api/` or `/auth/` target; a 8,192 and 8,193 character path; `/login` opened in a popup window; opening `/login` while signed in with a slow probe (the status text stays until it answers; there is no timeout); two tabs, one signed out (each tab decides on its own: the guard is per page load). The popup window and the two tabs cannot be run by the verifier; check them by reading the code (no shared state outside the page, no `window.opener` use).

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, the design reference or this file conflict with each other.
- You think you need a change outside your paths, a dependency, an edit to a spec file, or a change to an existing page or hook (the old signed-out UI is out of scope).
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `npm ci` in `frontend/` first on a fresh checkout, run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), any place you departed from the reference design and why, the known gaps, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle. Run each test file that uses timers or navigation several times before ticking it, so a flaky test is found by you rather than by the verifier.
