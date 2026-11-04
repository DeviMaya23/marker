# Plan: account area (front end)

Branch: `claude/account-area-task-m2s9e8`. Paths are under `frontend/src/`.
Backend integration tests: the task touches only `frontend/`, so `make test-integration-local` is not required (see the last item).

## Acceptance criteria

- [ ] `bookmarkletHref`: starts with `javascript:` — `features/account/lib/bookmarklet.ts`, test `bookmarklet.test.ts`
- [ ] Running the code calls `window.open` once with `save-bookmark`, `width=480,height=420`, URL `<origin>/save?` whose `url`/`title` params round-trip (query string with `?a=1&b=2#frag`; title with `& # = " ` space and non-Latin) — `bookmarklet.ts`, `bookmarklet.test.ts`
- [ ] An origin with a quote or backslash does not break the code — `bookmarklet.ts`, `bookmarklet.test.ts`
- [ ] The code has no `noopener`, `cookie`, `localStorage`, `sessionStorage`, `csrf`, `token` — `bookmarklet.ts`, `bookmarklet.test.ts`
- [ ] `describeDeleteAccountFailure`: 401 → signedOut, empty message — `features/account/lib/deleteAccountFailure.ts`, `deleteAccountFailure.test.ts`
- [ ] 429 with retryAfter 7 / 0 / null messages (uses exported `rateLimitMessage` from `lib/bookmarks/describeFailure.ts`) — `deleteAccountFailure.ts`, `deleteAccountFailure.test.ts`
- [ ] 403, 500, ApiError with problem body, TypeError → `Couldn't delete your account.` — `deleteAccountFailure.ts`, `deleteAccountFailure.test.ts`
- [ ] `useDeleteAccount`: `run()` true on success, `pending` true then false, `failure` null — `features/account/hooks/useDeleteAccount.ts`, `useDeleteAccount.test.tsx`
- [ ] Rejection → `run()` false, `failure` from describe…, `pending` false — same files
- [ ] Second `run()` while pending sends one request, resolves false — same files
- [ ] Failure cleared by `reset()` and by next `run()` — same files
- [ ] `DeleteAccountSection`: paragraph, button opens dialog "Delete your account?", field `delete-account-confirm` focused, text, confirm disabled — `features/account/components/DeleteAccountSection.tsx`, `DeleteAccountSection.test.tsx`
- [ ] Confirm enablement by phrase (trim/case); Enter sends nothing / once — same files
- [ ] Success: `deleteAccount` once, `onDeleted` once after resolve, dialog closed — same files
- [ ] Pending: field/Cancel/confirm disabled, Esc ignored, Enter sends no second request — same files
- [ ] 401 / 429 / 500 / network error: message shown, dialog open, text kept, `onDeleted` not called, confirm enabled — same files
- [ ] Cancel and Esc close with no request; reopen shows empty field, no failure — same files
- [ ] `BookmarkletSection`: link "Save to marker" `href` attribute equals `bookmarkletHref(origin)` (set via ref); click does not `window.open`, default prevented — `features/account/components/BookmarkletSection.tsx`, `BookmarkletSection.test.tsx`
- [ ] Four steps in order, each starting with its browser name — same files
- [ ] `AccountPage`: h1 `page__title`, h2s in order, inside shell — `pages/AccountPage.tsx`, `AccountPage.test.tsx`
- [ ] After a confirmed delete: final panel, shell and folder section gone, Log in href = `loginHref('/', '')`, description text, no `listFolders`/`getSyncVersion` calls after, cache empty — `AccountPage.tsx` (+ `features/account/components/AccountDeleted.tsx`), `AccountPage.test.tsx`
- [ ] Failed (500) delete and cancelled dialog keep seeded cache and the non-deleted page — `AccountPage.test.tsx`
- [ ] Before the delete, no deleted-state panel on screen — `AccountPage.test.tsx`
- [ ] `SidebarContent`: link to `/account` after folder section, `aria-current` on `/account` not on `/` — `app-shell/SidebarContent.tsx`, `SidebarContent.test.tsx`
- [ ] Clicking the link calls `onNavigate` once — `SidebarContent.test.tsx`
- [ ] `App` routing: `/account` renders the account page; unknown path still not-found — `App.tsx`, `App.test.tsx`
- [ ] `make check` passes (CSS in `styles/layout.css`, `styles/components.css`) — run `make check`
- [ ] Nothing outside allowed paths changed — checked with `git diff --stat main`
- [ ] Backend integration tests — not required: no `backend/` change. Outcome: not run: task touches only `frontend/`

## Judgment calls

(filled in at the end)
