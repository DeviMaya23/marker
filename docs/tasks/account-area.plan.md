# Plan: account area (front end)

Branch: `claude/account-area-task-m2s9e8`. Paths are under `frontend/src/`.
Backend integration tests: the task touches only `frontend/`, so `make test-integration-local` is not required (see the last item).

## Acceptance criteria

- [x] `bookmarkletHref`: starts with `javascript:` — `features/account/lib/bookmarklet.ts`, test `bookmarklet.test.ts`
- [x] Running the code calls `window.open` once with `save-bookmark`, `width=480,height=420`, URL `<origin>/save?` whose `url`/`title` params round-trip (query string with `?a=1&b=2#frag`; title with `& # = " ` space and non-Latin) — `bookmarklet.ts`, `bookmarklet.test.ts`
- [x] An origin with a quote or backslash does not break the code — `bookmarklet.ts`, `bookmarklet.test.ts`
- [x] The code has no `noopener`, `cookie`, `localStorage`, `sessionStorage`, `csrf`, `token` — `bookmarklet.ts`, `bookmarklet.test.ts`
- [x] `describeDeleteAccountFailure`: 401 → signedOut, empty message — `features/account/lib/deleteAccountFailure.ts`, `deleteAccountFailure.test.ts`
- [x] 429 with retryAfter 7 / 0 / null messages (uses exported `rateLimitMessage` from `lib/bookmarks/describeFailure.ts`) — `deleteAccountFailure.ts`, `deleteAccountFailure.test.ts`
- [x] 403, 500, ApiError with problem body, TypeError → `Couldn't delete your account.` — `deleteAccountFailure.ts`, `deleteAccountFailure.test.ts`
- [x] `useDeleteAccount`: `run()` true on success, `pending` true then false, `failure` null — `features/account/hooks/useDeleteAccount.ts`, `useDeleteAccount.test.tsx`
- [x] Rejection → `run()` false, `failure` from describe…, `pending` false — same files
- [x] Second `run()` while pending sends one request, resolves false — same files
- [x] Failure cleared by `reset()` and by next `run()` — same files
- [x] `DeleteAccountSection`: paragraph, button opens dialog "Delete your account?", field `delete-account-confirm` focused, text, confirm disabled — `features/account/components/DeleteAccountSection.tsx`, `DeleteAccountSection.test.tsx`
- [x] Confirm enablement by phrase (trim/case); Enter sends nothing / once — same files
- [x] Success: `deleteAccount` once, `onDeleted` once after resolve, dialog closed — same files
- [x] Pending: field/Cancel/confirm disabled, Esc ignored, Enter sends no second request — same files
- [x] 401 / 429 / 500 / network error: message shown, dialog open, text kept, `onDeleted` not called, confirm enabled — same files
- [x] Cancel and Esc close with no request; reopen shows empty field, no failure — same files
- [x] `BookmarkletSection`: link "Save to marker" `href` attribute equals `bookmarkletHref(origin)` (set via ref); click does not `window.open`, default prevented — `features/account/components/BookmarkletSection.tsx`, `BookmarkletSection.test.tsx`
- [x] Four steps in order, each starting with its browser name — same files
- [x] `AccountPage`: h1 `page__title`, h2s in order, inside shell — `pages/AccountPage.tsx`, `AccountPage.test.tsx`
- [x] After a confirmed delete: final panel, shell and folder section gone, Log in href = `loginHref('/', '')`, description text, no `listFolders`/`getSyncVersion` calls after, cache empty — `AccountPage.tsx` (+ `features/account/components/AccountDeleted.tsx`), `AccountPage.test.tsx`
- [x] Failed (500) delete and cancelled dialog keep seeded cache and the non-deleted page — `AccountPage.test.tsx`
- [x] Before the delete, no deleted-state panel on screen — `AccountPage.test.tsx`
- [x] `SidebarContent`: link to `/account` after folder section, `aria-current` on `/account` not on `/` — `app-shell/SidebarContent.tsx`, `SidebarContent.test.tsx`
- [x] Clicking the link calls `onNavigate` once — `SidebarContent.test.tsx`
- [x] `App` routing: `/account` renders the account page; unknown path still not-found — `App.tsx`, `App.test.tsx`
- [x] `make check` passes (CSS in `styles/layout.css`, `styles/components.css`) — run `make check`: passed (898 frontend tests, build, stylelint, lint)
- [x] Nothing outside allowed paths changed — checked with `git diff --stat main`
- [x] Backend integration tests — not required: no `backend/` change. Outcome: not run: task touches only `frontend/`, no `backend/` file changed

## Judgment calls

- The task file says "a lucide-react icon" for the sidebar link and the bookmark/trash/check icons without naming them: I used `CircleUser` (sidebar), `Bookmark` (bookmarklet), `Trash2` (delete button) and `CircleCheck` (deleted page).
- `DeleteAccountSection` closes the dialog through the same `close()` used by Cancel (which also resets the hook's failure), then calls `onDeleted`.
- The bookmarklet link text and the step texts have no bold browser name (the reference used `<strong>`); the task gave plain strings and the test reads each step as text starting with the browser name.
- `.account-section*`, `.bookmarklet-link` rules were copied from the reference into `layout.css` right after the existing `.account-page` rule; `.account-section--demo` and `.demo-controls__row` were left out (demo section is out of scope).
- The footer's horizontal padding is `var(--space-2)`, the same as `.sidebar__scroll`; vertical padding `var(--space-3)` follows the reference's `.sidebar__account`.
- `.drawer-panel__body` became a flex column (the only change there) so the `margin-top: auto` footer sits at the bottom in the drawer too.
- Test note: a `beforeEach` arrow that returns a mock makes vitest call the mock as cleanup; the tests use braces.
- Not checked in a real browser: the bookmarklet, the dialog's focus and busy state, and the narrow-screen layout.
