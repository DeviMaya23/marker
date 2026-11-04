# Task: account area (front end)

> One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> **Prerequisite:** `background-sync` is merged. Check it: `frontend/src/app-shell/useSyncPoll.ts` exists, `AppShell` calls it, and `AppShell.test.tsx`, `BookmarksPage.test.tsx`, `FolderPage.test.tsx` and `App.test.tsx` mock `lib/api/sync`. If it is missing, stop and ask; do not create it. (Every page you add inside `AppShell` polls, so its tests must mock the wrapper the same way.) The server half, `delete-account`, is merged: `deleteAccount` is a real handler on `main` (`backend/internal/handler/account.go`). Every test here still mocks the API wrapper. `frontend/src/lib/api/schema.d.ts` must already have the `deleteAccount` operation with its `204`, `401`, `403` and `429`; if it does not, stop and ask, because only the user regenerates it. Read `frontend/src/test/setup.ts`, `test/wrap.tsx` and `test/hookWrapper.tsx` first: the stand-ins already exist and you must not duplicate them.

## Goal

A signed-in user can open an "Account & help" page from the sidebar. On it they find the bookmarklet to drag to their browser's bookmarks bar, with short steps for four browsers, and they can permanently delete their account after a deliberate confirmation. When the deletion succeeds the app shows a plain "account deleted" page instead of an app that no longer has a session.

Requirements covered: FR-3 (b), the bookmarklet half: the bookmarklet opens the save page in a popup with `window.open`, passing the page's URL and title; FR-25, the UI half: the user can delete their account from the app, after a confirmation that says all data is erased, the trash included, that nothing is kept, and that the identity-provider account is not deleted.

Out of scope, and why:

- Log out: the auth backend (`authLogout`) is not built. The page has no log out button. The backlog's auth lines cover it; when it lands, the sidebar link becomes a menu with log out in it.
- The login screen and the "learn you are signed out without waiting for a 401" item: backlog, other slices.
- The sidebar's account menu (a dropdown): with one entry it would only add a click. This task adds a plain link.
- The reference's "demo data controls" section: it exists only for the mock build.
- Help content beyond the bookmarklet steps (a FAQ, a keyboard-shortcut list).
- The server side of account deletion, and any change to the contract, `backend/**` or `docs/**`.
- Detecting that the bookmarklet is installed, or opening the popup from this page as a test.

## The design

Read, in `docs/design/ui-reference/` (read-only reference, not code to copy): `src/pages/AccountPage.tsx` (the sections and the bookmarklet code), `src/components/Sidebar.tsx` (the account entry at the bottom), and the CSS rules `.account-page`, `.account-section*`, `.bookmarklet-link` and `.sidebar__account*`, all in `src/styles/layout.css`. The app's `styles/layout.css` already has an `.account-page` rule (a width and a flex column): edit that rule to add what you need (the reference adds a `gap`); do not paste a second `.account-page` block. Copy no `.tsx` or `.ts` file; copy only the CSS rules you need into `frontend/src/styles/`. Do not use `react-icons`, the reference's confirm dialog or its router. Icons come from `lucide-react`. Where this file and the reference disagree, this file wins; say so in your report. Known departures: no log out, no demo section, the bookmarklet opens `/save` (the app uses browser-history routes, the reference used `/#/save`), and the confirmation is the app's own `Dialog` with a typed phrase.

## Role and ownership

Role: Frontend (see `AGENTS.md`).

You may change `frontend/**` except `package.json`, `package-lock.json`, `README.md` and the stylelint configuration. You may not change `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/account-area.plan.md`, see `AGENTS.md`), the Makefile, `frontend/src/lib/api/schema.d.ts` (generated), `frontend/src/test/setup.ts`, or any file in `frontend/src/app-shell/` other than `SidebarContent.tsx` and the new `SidebarContent.test.tsx`.

**Shared files.** No other front-end task runs now once `background-sync` is merged (the Prerequisite). `delete-account` is backend only. You change: `App.tsx` and `App.test.tsx` (one route), `app-shell/SidebarContent.tsx` (one link), `styles/layout.css` (the sidebar footer and the account sections; do not rename or reorder existing rules), `styles/components.css` only to edit the existing `.drawer-panel__body` rule if the footer needs it (the drawer's styles live there; keep the change to that), `lib/bookmarks/describeFailure.ts` (only to add `export` to the existing `rateLimitMessage`; its behavior and its test do not change), and the new files below. You do not change `AppShell.tsx`, `Drawer.tsx`, any other page, or any other feature. If you think you must, stop and ask.

## Operations used

- `deleteAccount` (`DELETE /api/v1/account`): no request body, the CSRF header (sent by `apiRequest` for writes). Response `204` with no body; `401`, `403` and `429` as problems. The contract lists no other status. Take the types from `schema.d.ts` (generated); do not write a type that mirrors an API shape. The call is real on the server (`delete-account` is merged): it erases the user's data in one transaction and answers `204`; a second call with the same session answers `401`, because the session is erased with the user.

## Behavior

### The route and the link

- `/account` renders `AccountPage` inside `AppShell`, with the page title `Account & help` (an `h1`, class `page__title`, directly in the shell like the other pages' titles) and, below it, a wrapper with the class `account-page` that holds the two sections, in this order: "Install the bookmarklet", "Delete account". Each section has an `h2` with its name. The not-found route and every other route are unchanged.
- The sidebar gets a link "Account & help" to `/account`, with a `lucide-react` icon, in a footer of its own after `sidebar__scroll`, separated from the content above by the border style the sidebar already uses. The footer is in normal flow at the end of the sidebar content: not sticky, not fixed. It sits at the bottom of the sidebar when the content is short, and scrolls with the sidebar when the folder list is long (it is the `aside`, wide, or the drawer body, narrow, that scrolls; `.sidebar__scroll` itself does not). The footer's class is `sidebar__footer`: `margin-top: auto`, a top border, and horizontal padding that matches `.sidebar__scroll`'s so its link lines up with the other links. Make it work by **editing the existing** `.sidebar` rule (`layout.css`, make it a column that fills the height of its container, for example `min-height: 100%`) and, for the drawer, **editing the existing** `.drawer-panel__body` rule in `components.css` (the only change allowed there). `make check` runs stylelint with `no-duplicate-selectors` and `no-descending-specificity`: do not add a second block for an existing selector, and do not style the footer link through a compound selector such as `.sidebar__footer .sidebar__top-link` placed after `.sidebar__top-link:hover`; the link already has the class `sidebar__top-link`. Copy from the reference only the footer's padding and border idea (its `.sidebar__account` rule); its `.sidebar__account-button` and `-menu` rules belong to a dropdown this task does not build. It uses the same look as the "All bookmarks" and "Trash" links (`sidebar__top-link`) and is marked as the current page (`aria-current`) on `/account`. In the drawer, clicking it closes the drawer like every other link does (the existing `onNavigate` handling in `SidebarContent`).

### Install the bookmarklet

A short paragraph, then the link, then the steps.

- Paragraph: "Drag this link to your browser's bookmarks bar. Click it on any page to save that page here. A small window opens where you can confirm the title and folder before anything is saved."
- The link has the text "Save to marker" and the class `bookmarklet-link`, with a `lucide-react` bookmark icon. Its `href` is a `javascript:` URL built by a pure function `bookmarkletHref(origin)` (see Structure) from `window.location.origin`. React 19 refuses to render a `javascript:` URL in the `href` prop, so set the attribute through a ref (a ref callback or an effect that calls `setAttribute('href', …)`); do not use the `href` prop, and do not use `dangerouslySetInnerHTML`.
- Clicking the link inside the app does nothing: the click's default is prevented, so the bookmarklet does not run here. Dragging and middle-clicking are the browser's.
- The code the link carries, when run on any page: reads that page's `location.href` and `document.title`, and calls `window.open` with the URL `<origin>/save?url=<the page URL, URL-encoded>&title=<the page title, URL-encoded>`, the window name `save-bookmark` and the features `width=480,height=420`. The origin is baked in as a string literal (escaped, for example with `JSON.stringify`). It contains no secret and no token. It does not use `noopener` (the save page must be able to close itself, FR-3b).
- Steps, an ordered list, exactly these four items:
  1. "Chrome: show the bookmarks bar (Ctrl+Shift+B, or Cmd+Shift+B on a Mac), then drag the link above onto it."
  2. "Firefox: show the bookmarks toolbar, then drag the link above onto it."
  3. "Opera: open the bookmarks bar from the menu, then drag the link above onto it."
  4. "Safari: show the Favorites bar, then drag the link above onto it. If dragging does not work, add any bookmark and change its address to match this link."

### Delete account

- A paragraph: "Permanently erases all of your bookmarks, notes, folders and trash. There are no backups. Your login at the identity provider is not deleted." Below it, a button "Delete account" (class `btn btn--danger-outline`, with a `lucide-react` trash icon), always enabled.
- The button opens a confirmation dialog in the shape of the Empty trash dialog (`bookmark-list/components/EmptyTrash.tsx`): the shared `Dialog` (`components/ui/Dialog.tsx`), size `sm`, title "Delete your account?", initial focus in the text field. The dialog contains, in order: a failure area (below), the text "This permanently erases every bookmark, note, folder and everything in the trash. There are no backups and this can't be undone. Your login at the identity provider is not deleted.", a field labelled "Type **delete my account** to confirm", and a footer with "Cancel" (`btn btn--secondary`) and "Delete my account" (`btn btn--danger`).
- The confirm button is enabled only when the field, trimmed and lower-cased, equals `delete my account` and no request is running. Enter in the field submits only under the same condition; with any other text it does nothing.
- Confirming sends `deleteAccount()` once. While it runs: the field and Cancel are disabled, the confirm button is disabled, and Esc and a click on the backdrop do nothing (the dialog's `busy`). A second submit while it runs sends nothing.
- On `204`: `DeleteAccountSection` closes the dialog first, then calls `onDeleted` (once), which tells the page the account is gone (see "After the delete"); nothing else is requested. A second submit while the request runs is stopped by `useDeleteAccount` (tested there; in the component the field is disabled).
- Cancel, Esc and the backdrop (when not running) close the dialog and send nothing. Reopening it shows an empty field and no old failure.
- Failures keep the dialog open, with the field's text kept so the user can retry, and show in the failure area:

| Situation | Shown |
|---|---|
| `401` | The existing `SignedOutMessage` (`components/ui/SignedOutMessage.tsx`) |
| `429` | A `banner banner--error` with role `alert`: `Too many requests. Try again in about N seconds.` when `Retry-After` was a whole number N of zero or more, otherwise `Too many requests. Try again in a moment.` Use the existing `rateLimitMessage` from `lib/bookmarks/describeFailure.ts`. |
| `403`, any other status, or a failure that is not an `ApiError` (a network error) | A `banner banner--error` with role `alert`: `Couldn't delete your account.` |

### After the delete

- `AccountPage` holds one piece of state, "deleted". When it becomes true the page renders **only** a plain page, not inside `AppShell`: a `main` with class `page` containing a `StatePanel` (an icon from `lucide-react`, for example `CircleCheck`) titled "Your account was deleted." with the description "All of your bookmarks, notes, folders and trash were permanently erased. Logging in again starts a new, empty account." and one action, a link "Log in" (class `btn btn--primary`) whose `href` is `loginHref('/', '')` from `lib/loginHref.ts` (a plain anchor, a full page load).
- Because the shell is gone, the sidebar, the folder list and the sync poll stop with it: nothing is requested after the delete.
- After the shell has unmounted, the page clears the whole query cache (`queryClient.clear()`, in an effect that runs when "deleted" is true), so no data of the deleted account can be shown if the user goes back in history.
- Nothing is stored in the browser by this task; the cookies are left as they are (the contract's `204` clears none, and the session is already gone on the server).

### Known gaps

- The `session` and `csrf_token` cookies stay in the browser after a delete. They are dead; see the `delete-account` task.
- The final page's "Log in" link goes to the login route, which is a stub until the auth backend is built (in development it is the dev login, `loginHref`).
- The bookmarklet is not tested in a real browser: its code is run in a test with stand-in `location`, `document` and `window` objects only. A browser that blocks `javascript:` links on drag (Safari sometimes) is covered only by the fourth step's wording.
- The origin is baked into the bookmarklet when the page renders; a user who later moves the app to another address must drag it again.
- Browsers percent-decode a `javascript:` URL before running it, so an origin containing `%` would break the code; real origins never do. A page title with a lone surrogate makes `encodeURIComponent` throw inside the bookmarklet, on that page only. A page whose content security policy or popup blocker refuses `window.open` is outside this task.
- If the delete succeeds on the server but the answer is lost (a network failure), the dialog shows `Couldn't delete your account.`; a retry then answers `401` and the dialog shows the signed-out message ("You're logged out. Log in to continue.") with a login link that returns to `/account`, and the user never sees the "account deleted" page. Accepted; it needs a lost response at exactly that moment.
- After a delete, Back and then Forward to `/account` shows the normal account page, not the deleted state (the state is not kept anywhere); a second delete attempt there answers `401` and shows the signed-out message. Accepted.
- A `403` (a CSRF failure) is shown as the generic `Couldn't delete your account.`, on purpose: the user cannot act on it differently.
- The final page has no `h1` (the panel's title is an `h2`) and no focus management or document title of its own. Accepted.
- The sidebar footer link is not a menu; log out has no place yet.
- Nothing is checked in a real browser (focus, the dialog's busy state, layout on a narrow screen).

## Structure

Follow `ARCHITECTURE.md` (the planned `account` feature owns this) and the hook rules in `CONVENTIONS.md` (one hook per concern, a colocated test, semantic mutators).

- `lib/api/account.ts` (new): `deleteAccount()`, a thin wrapper over `apiRequest` (`DELETE /account`) returning `Promise<void>`. No test of its own (a thin wrapper, `TESTING.md`).
- `features/account/lib/bookmarklet.ts` (new) with `bookmarklet.test.ts`: `bookmarkletHref(origin: string): string`, pure. It returns `javascript:` followed by the code described above.
- `features/account/lib/deleteAccountFailure.ts` (new) with its test: `describeDeleteAccountFailure(error: unknown): { signedOut: boolean; message: string }`, pure, implementing the failure table. `signedOut` is true only for a `401`; `message` is empty then.
- `features/account/hooks/useDeleteAccount.ts` (new) with `useDeleteAccount.test.tsx`: returns `{ run, pending, failure, reset }` in the shape of `useEmptyTrash` (`lib/bookmarks/useEmptyTrash.ts`): `run()` resolves `true` when the account was deleted, `false` otherwise; a call while one runs sends nothing and resolves `false`; `reset()` clears the failure. It uses `deleteAccount` and `describeDeleteAccountFailure`. It does not touch the query cache and does not navigate.
- `features/account/components/BookmarkletSection.tsx`, `DeleteAccountSection.tsx` (the button and the dialog; takes `onDeleted: () => void`) and `AccountDeleted.tsx` (the final page), each in its own file. `BookmarkletSection` and `DeleteAccountSection` have a component test; `AccountDeleted` is presentational and has none of its own (the page test covers it).
- `pages/AccountPage.tsx` (new, thin) with `AccountPage.test.tsx`: the "deleted" state, `AppShell`, the two sections, the final page, and the cache clearing effect.
- `App.tsx`: add `<Route path="/account" element={<AccountPage />} />` before the `*` route.
- `app-shell/SidebarContent.tsx`: the footer link (a new `div` after `sidebar__scroll`); its test is a new `app-shell/SidebarContent.test.tsx`.
- No new shared component: `Dialog`, `Banner`, `SignedOutMessage` and `StatePanel` already exist. The confirmation form is feature-owned and copies the *shape* of `EmptyTrash`'s, not its code; do not extract a shared confirm dialog for two uses (`CONVENTIONS.md`).

## Dependencies

None. `package.json` and `package-lock.json` must not change.

## Acceptance criteria

All of these must have a test, run by `npm test`. Use Vitest and Testing Library, mock the API wrappers with value-return spies (`vi.mock('../lib/api/account', …)`, `lib/api/folders`, `lib/api/sync`), use `user-event` (these tests need no fake timers), and build the client with `testClient()` from `test/wrap.tsx`. Tests that render `AppShell` mock `lib/api/sync` so `getSyncVersion` resolves `{ version: 0 }`, as the Prerequisite says.

**`bookmarkletHref` (pure; in `bookmarklet.test.ts`)**
- The result starts with `javascript:`.
- Running the code (take the part after `javascript:` and run it with stand-in `location`, `document` and `window` objects, for example through `new Function`) calls `window.open` exactly once, with the window name `save-bookmark`, the features `width=480,height=420`, and a URL that starts with `<origin>/save?`. Parsing that URL, `searchParams.get('url')` is the stand-in page's `location.href` and `searchParams.get('title')` is its `document.title`, for a page URL with `?a=1&b=2#frag`, and for a title containing `&`, `#`, `=`, a quote, a space and a non-Latin character (all must round-trip).
- An origin with a quote or a backslash in it does not break the code (it still runs and opens that origin); the origin is escaped, not pasted in.
- The code contains no `noopener`, and none of `cookie`, `localStorage`, `sessionStorage`, `csrf` or `token` (it carries no secret or user data).

**`describeDeleteAccountFailure` (pure)**
- `ApiError` 401 gives `signedOut: true` and an empty message.
- 429 with `retryAfter` 7 gives `Too many requests. Try again in about 7 seconds.`; with `retryAfter` 0 gives `…about 0 seconds.`; with `null` gives `Too many requests. Try again in a moment.`
- 403, 500, and an `ApiError` with a problem body each give `Couldn't delete your account.`; a plain `TypeError` (network failure) gives the same.

**`useDeleteAccount` (hook)**
- `run()` resolves `true` when the wrapper resolves; `pending` is true while it runs and false after; `failure` stays `null`.
- When the wrapper rejects, `run()` resolves `false` and `failure` is what `describeDeleteAccountFailure` returns for that error; `pending` is false again.
- A second `run()` while the first has not settled sends no second request (the wrapper is called once) and resolves `false`.
- A failure is cleared by `reset()` and by the start of the next `run()`.

**`DeleteAccountSection` (component)**
- The section shows the paragraph "Permanently erases all of your bookmarks, notes, folders and trash. There are no backups. Your login at the identity provider is not deleted." The "Delete account" button opens a dialog named "Delete your account?" with the text field focused (its id is `delete-account-confirm`) and the text "This permanently erases every bookmark, note, folder and everything in the trash. There are no backups and this can't be undone. Your login at the identity provider is not deleted."; the confirm button "Delete my account" is disabled.
- The confirm button stays disabled for `delete`, `delete my account please` and an empty field, and enables for `delete my account`, ` Delete My Account ` (trim and case). Enter in the field sends nothing for the first three and sends once for the last.
- On success `deleteAccount` was called once, `onDeleted` was called once (not before the call resolved), and the dialog is closed.
- While the request is pending (hold its promise): the field, Cancel and confirm are disabled, Esc does not close the dialog, and pressing Enter again does not send a second request.
- A `401` shows the signed-out message with its "Log in" link; a `429` shows the rate-limit text; a `500` and a network error show `Couldn't delete your account.` In each, the dialog stays open, the field still holds what was typed, `onDeleted` was not called, and the confirm button is enabled again.
- Cancel closes the dialog with no request. Esc closes it with no request. Reopening it shows an empty field and no failure text (open, fail, cancel, reopen).

**`BookmarkletSection` (component)**
- The link named "Save to marker" has an `href` attribute equal to `bookmarkletHref(window.location.origin)` (read with `getAttribute`, because React did not render it). Clicking it does not call `window.open` and the click's default is prevented.
- The four steps are present in order, and each starts with its browser's name.

**`AccountPage` (page)**
- At `/account` it shows the h1 "Account & help" (class `page__title`), then the h2 "Install the bookmarklet", then the h2 "Delete account", in that order (query by heading role: the button has the same text as the second heading), inside the app shell (the main navigation is present).
- After a confirmed delete: the "Your account was deleted." panel is shown, the main navigation and the sidebar's folder section are gone, the "Log in" link's `href` equals `loginHref('/', '')`, the panel's description reads "All of your bookmarks, notes, folders and trash were permanently erased. Logging in again starts a new, empty account.", and neither `listFolders` nor `getSyncVersion` was called after the delete (record both call counts just before confirming; they are unchanged once the final page is shown). That the poll stops with the shell is proved by the `background-sync` tests; here it is enough that the shell is gone. The query client's cache is empty afterwards (`client.getQueryCache().getAll()` has length 0), checked after seeding it with a query before the delete.
- With the cache seeded the same way, a delete that fails (`500`) and a cancelled dialog both leave the seeded query in the cache and the page not in the deleted state.
- Before the delete, nothing from the deleted-state panel is on screen.

**`SidebarContent` (component)**
- Render it with `lib/api/folders` mocked (the folder section is part of the sidebar) and a router. The "Account & help" link points to `/account`, sits after the folder section, and has `aria-current="page"` when the location is `/account` and not on `/`.
- Clicking it calls `onNavigate` once (the drawer's close).

**`App` routing (`App.test.tsx`)**
- `/account` renders the account page; an unknown path still renders the not-found page.

**Repo-wide**
- `make check` passes (it includes stylelint on the CSS you add).
- Nothing outside the allowed paths changed.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt:

- The bookmarklet link's `href` is set through a ref and never through the `href` prop; there is no `dangerouslySetInnerHTML` and no `eval` or `new Function` in the app code (the test may use `new Function`). The code string carries no token, cookie or user data.
- `deleteAccount` is called only from `useDeleteAccount`. The hook never touches the query cache; only `AccountPage` clears it, after the shell is gone, in an effect, and not before the delete succeeded.
- The final page is rendered outside `AppShell`, so no sync poll or folder request can run after the delete (read the page component, not only the test).
- The confirmation matches the Empty trash dialog's shape: a typed phrase, disabled while running, `busy` set on the `Dialog`. No second confirm component was added to `components/ui/`.
- `rateLimitMessage` is exported from `describeFailure.ts` and its text is not copied anywhere. No dependency, `package.json`, `schema.d.ts`, `AppShell.tsx` or other page changed; the CSS has no rename or reorder of existing rules.
- To confirm the tests discriminate (break the behavior, see them fail, revert): change the bookmarklet's window name, features or `encodeURIComponent` use and check `bookmarklet.test.ts` fails; compare the phrase case-sensitively; enable confirm while pending; call `onDeleted` before the request resolves; call it on failure; skip the cache clearing; render the final page inside `AppShell`; drop `busy`; keep the old failure after Cancel. Revert each.
- `rateLimitMessage` in `describeFailure.ts` is the one the new code uses (exported by this task). `folderFailureMessage.ts` already has a private copy with the same text, and `saveFailure.ts` one with different wording ("Too many saves"); leave both alone. The check is that this task adds no new copy.
- The footer's placement is read from the CSS (the verifier has no browser): it is in normal flow, `margin-top: auto`, never `position: sticky` or `fixed`.
- Try to break it with: a typed phrase with extra inner spaces (it must not enable the confirm button: only trim and case are ignored); double-clicking the confirm button; Esc during the request; a `429` then a retry that succeeds; a `401` then logging in again from another tab (not testable here: say so); a very narrow screen (read the CSS: the page must not scroll sideways).

## Stop and ask when

- The contract (`openapi.yaml`), a requirement or this file conflict with each other.
- You think you need a change to `AppShell.tsx`, another page or feature, `test/setup.ts`, a dependency, or an edit to a spec file.
- Setting the `javascript:` href through a ref turns out not to work in the test environment or is blocked by lint; do not use `dangerouslySetInnerHTML` or disable a lint rule. Report what you saw.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `npm ci` in `frontend/` if there is no `node_modules`, then `make check`; commit in small steps; push your branch (never `main`); and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), and anything you were unsure about. Also note every place you made a judgment call that this file did not settle, and say plainly that the bookmarklet and the dialog were not checked in a real browser.
