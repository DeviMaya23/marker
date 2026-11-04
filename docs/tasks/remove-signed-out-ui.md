# Task: Remove the per-screen signed-out UI

Frontend only. One builder agent on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Prerequisite

All four of these are merged to `main` before this task starts. If one is missing, stop and ask; do not create what it adds.

- `logout-menu` (adds `useLogout`, `describeLogoutFailure`, `LOGOUT_FAILED`).
- `undo-restores-folder` (changes `useDeleteBookmark`, which calls `toastFailure`).
- `login-screen` (adds `lib/api/loginRedirect.ts` with `redirectToLogin` and `suppressLoginRedirect`, the global "a 401 goes to `/login?return_to=…`" rule inside `apiRequest`, and the `/login` page). Check that `request.ts` calls `redirectToLogin()` on a 401 before you remove anything.
- `add-form-key-and-trash-footer` (changes `EmptyTrash.tsx`, `FolderPage.test.tsx`).

## Goal

After `login-screen`, every call that answers `401` already sends the browser to the login screen and back. The old per-screen "You're logged out. Log in to continue." banners, the "Log in" buttons on failure toasts and the save popup's login panel are now redundant and would flash on screen while the page leaves. This task removes them. A `401` then shows nothing on the screen: the redirect has started.

Requirements covered: none newly. FR-3c (the save popup when logged out) is delivered by `login-screen`'s redirect; this task removes the popup's own login panel, and an acceptance criterion below proves the popup no longer has one.

Out of scope, with the reason for each:
- The redirect itself, the `/login` page and `loginHref` / `loginPageHref`: done in `login-screen`. `loginHref` stays, because `LoginCard` and `AccountDeleted` use it.
- `AccountDeleted` and its "Log in" link: shown after a successful account deletion, not after a `401`.
- `useSyncPoll`: it already stops on a `401`. Do not change it.
- Anything under `styles/`: no CSS belongs to the removed pieces (`SignedOutMessage` only uses `Banner` and `btn` classes).
- The `EditBookmarkDialog` footer layout (a separate backlog line). Touch that file only to remove the signed-out lines.
- A who-am-I check or any new endpoint.

## Role and ownership

Role: Frontend, see `AGENTS.md`.

You may change files under `frontend/src/` that are listed in "What to remove or change" below, `lib/bookmarks/useDeleteBookmark.ts` and `features/save/components/FolderChoice.tsx` (both named there), the files that hold the functions, hooks and components named in that section (including `lib/api/ApiError.ts` and its test, `MoveFolderDialog.tsx`, `SavePopup.tsx`, `FolderPage.tsx` and the mapper and hook files), and every test that asserts a `401` behavior. You may not change `backend/`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/remove-signed-out-ui.plan.md`, see `AGENTS.md`), `package.json`, the lockfile, anything under `styles/`, `lib/api/request.ts`, `lib/api/loginRedirect.ts`, `lib/loginHref.ts`, `app-shell/` or `test/setup.ts`.

Shared files and running at the same time: this task changes `components/ui/` (`MoveDialog`, `MoveFolderDialog`, `EditBookmarkDialog`, `SignedOutMessage` deleted), so it does not run together with any other task that changes `components/ui/` or `styles/`. In particular it must not run with the backlog tasks for `EditBookmarkDialog`'s footer, the `.page form` fix, or the paste-a-URL field (it changes where `AddUrlForm` is used). It conflicts in files with `add-form-key-and-trash-footer` (`EmptyTrash.tsx`) and `login-screen` (`useLogout.ts`); both merge first (see Prerequisite). A backend task can run alongside.

## Operations used

None new. The calls already exist and keep their requests; only what the UI does with a `401` changes.

## Behavior

### The rule

One new helper: `isUnauthorized(error: unknown): boolean` in `frontend/src/lib/api/ApiError.ts`, true when `error` is an `ApiError` with status `401`. Every place below uses it instead of its own `error instanceof ApiError && error.status === 401` check. (It is a one-line helper next to the class, not a new shared component.)

Where a place below needs a `401` check it uses this helper. Two existing inline checks stay as they are, out of scope: `useSyncPoll`'s own `isSignedOut` (it stops the poll) and `useBookmark`'s refetch-interval stop.

A `401` is **silent**: no banner, no toast, no "Log in" button, no error text, and no refresh of the lists. The redirect (from `login-screen`) is already on its way, and the next page load answers for itself.

For a write (a save, an edit, a move, a delete, an empty-trash, a folder change, a delete-account), silent means:
- the in-flight guard and the `pending` flag are cleared as for any other failure, so no control stays disabled;
- no failure is stored, so the dialog or form looks as it did before the click;
- the call resolves as a failure (`false`, `null`) so no success toast, no close and no navigation follow.

For a read (a list, a folder list, the bookmark page), silent means the screen shows its loading state, not an error and not an empty state, unless data is already on screen, in which case the data stays.

### What to remove or change

**Delete:** `components/ui/SignedOutMessage.tsx` and `SignedOutMessage.test.tsx`; the constant `LOGGED_OUT_TOAST` (in `lib/bookmarks/describeFailure.ts`, imported by `folderFailureMessage.ts` and `useLogout.ts`).

**Mappers (pure functions).** Delete the 401 branch and the field that signals it. A `401` is no longer mapped by them: callers check `isUnauthorized` first, so a `401` that reached a mapper would fall through to its generic case.
- `describeFailure`: remove the `signedOut` field from `FailureDisplay` and the 401 branch.
- `folderFailureMessage`: remove the `'signed-out'` value from `FolderFailure.kind` (leaving `'field' | 'dialog'`) and the 401 branch.
- `describeSaveFailure`: remove `{ kind: 'signed-out' }` from `SaveFailure` and the 401 branch.
- `describeDeleteAccountFailure` and `describeLogoutFailure`: return `{ message: string }` only; remove the `signedOut` field and the 401 branch.

**Hooks (the callers of those mappers).** At the top of each `catch`, before the mapper:
- `useBookmarkFeedback.toastFailure`: on a `401` return without refreshing and without a toast. Remove the `useLocation`, `goTo` and `loginHref` imports, the `FailureDisplay` import (once it returns nothing), the "Log in" toast action and the `pathname, search` dependencies. Its return value is not used by any caller (`useRestoreBookmark`, `useDeleteBookmark`; check); make it return nothing.
- `useEditBookmark`, `useEmptyTrash`, `useMoveBookmark`: on a `401` store no failure, do not refresh, resolve `false` (the in-flight guard and `pending` are cleared by their `finally`, as today).
- `useFolderMutation` (behind create, rename, move and delete folder): same; resolve `null`, store no failure, do not refresh.
- `useDeleteAccount`: same; resolve `false`, store no failure.
- `useDeleteBookmark` (the undo flow): replace its inline `error instanceof ApiError && error.status === 401` check in the second step with `isUnauthorized`. On a `401` there, do nothing visible and do not refresh: remove the `toastFailure(error, 'move')` call and its comment "refreshes by itself" (`toastFailure` is now silent), and return. Any other failure keeps its refresh and the "Restored to the top level. Couldn't move it back to its folder." toast. The first step's and `remove`'s `toastFailure` calls stay and are silent on a `401`. Drop the `ApiError` import if nothing else uses it.
- `useLogout`: on a `401` do nothing except clear the in-flight guard and re-enable the trigger (the redirect handles the rest). Remove the "You're logged out." toast and its "Log in" action, and the `useLocation`, `loginHref` and `LOGGED_OUT_TOAST` imports; keep `suppressLoginRedirect()` on a `200` exactly as `login-screen` wrote it. A `429` and any other failure keep their toasts ("Couldn't log out." and the rate-limit text).
- `useSaveBookmark`: on a `401` set `failure` to `null` and `phase` back to `'form'`. Remove the `'needs-login'` value from `SavePhase`, the comment that mentions it and the `'signed-out'` check in `dismiss`.

**Screens that show a read state.**
On a `401` with no data, react-query reports the query as failed, not pending, so each screen below needs an explicit branch for it, placed before its error branch; deleting the old line is not enough, or the "Something went wrong" / "Couldn't load" panel would show.
- `useBookmarkList`: remove `'signed-out'` from `ListPhase`. When the error is a `401` and there is no data, `phase` is `'loading'` (checked first); with data, the normal rules apply. `loadMoreFailed` stays false for a `401`. With data on screen, a `401` counts as no error for the `'empty'` rule, so an empty list that got a `401` on a refetch keeps showing its empty panel, not a blank `'ready'` list. After a `401` (read from the infinite query's `error`), `fetchNext` does nothing (it returns early), so a sentinel left in view does not send repeated requests; no spinner or message is added for a `401` on page 2.
- `BookmarkList`: remove the `'signed-out'` branch. A `401` shows the existing skeleton through `'loading'`. `FolderPage` and `BookmarksPage` need no change.
- `BookmarkView` (bookmark page): drop the `401` line at the top and keep the `404` rule first. A bookmark already on screen stays on screen. Add a branch after the `if (bookmark)` line: a `401` shows the existing "Loading…" paragraph (before the error panel). The query holds one error, the latest: if a retry after a `404` answers `401`, the `404` panel is replaced by "Loading…". The `404` rule wins only while the `404` is the current error.
- `FolderSection` (sidebar folders): a `401` with no folder data shows the existing skeleton rows (`SkeletonRows`), not "Couldn't load your folders."
- `MoveDialog`: a `401` on the folder list while it has no rows shows the existing "Loading folders…" state, not "Couldn't load your folders." Remove `signedOut` from `MoveFailure` and from the failure banner's condition; `MoveFolderDialog` passes `{ message }` only.
- `features/save/components/FolderChoice.tsx` (the save popup's folder select): its `folders` prop gains `error: unknown`, as `MoveDialog`'s does, and `SavePopup` passes `folders.error` in the object it builds. A `401` with no items shows what it shows while loading: the select's value text "Loading…", the select disabled, and no "Couldn't load your folders. It will be saved to the top level." text and no "Try again". A non-401 failure keeps that text. This file is in scope for this reason only.

**Screens that show a write failure.** Remove the `SignedOutMessage` line and its condition from: `AddUrlForm` (`failure.kind === 'signed-out'`), `EmptyTrash`, `DeleteAccountSection`, `EditBookmarkDialog`, `DeleteFolderDialog`, `FolderFormDialog` (these two read `failure.kind`, now `'field' | 'dialog'` only). Where a banner's condition mentions `!failure.signedOut`, remove that part.

**Save popup (`SavePopup`).** Remove the `'needs-login'` panel (its `SignedOutMessage` and Cancel button), the `phase === 'needs-login'` case in the Esc handler, and the `failure.kind !== 'signed-out'` condition on the alert. On a `401` the popup shows the save form again (phase `'form'`), with no message.

### Wording that goes away

"You're logged out. Log in to continue." (the banner) and "You're logged out." (toast text) appear nowhere after this task. A `401` has no text.

### Known gaps

- If a `401` happens and the redirect does not start (it already ran once in this page load, or the page is `/login`), a read screen stays on its loading state and a write does nothing visible, with no way to retry. `login-screen` runs the redirect once per page load; do not add a fallback here.
- A `401` on a read while data is on screen (a poll refetch) leaves stale data until the page leaves; nothing is shown.
- A `401` no longer refreshes the lists. The redirect makes a refresh pointless.
- Dialogs and the save popup that get a `401` do not close; they sit unchanged until the redirect.
- A Log out click on an expired session ends at the login screen through the redirect, not at the identity provider's logout address: the session is already gone, so there is nothing to end there. If the redirect does not start, the click shows nothing.
- A `401` on the folder list in the places that already tolerate a failed folder list stays as it is: the bookmark page's folder line reads "Unknown folder" and the folder page's title is empty, for the moment before the redirect.
- A `401` on page 2 of the list leaves page 1 on screen with no message and no further requests until the redirect.

## Structure

- `isUnauthorized` lives in `lib/api/ApiError.ts` and has its own unit test (`ApiError.test.ts`, or the file the class's test is in): `ApiError(401, …)` true; `ApiError(403)`, `ApiError(500)`, `TypeError`, `null`, `undefined` and a plain object with `status: 401` false.
- No new files except that test, if the class has none. Do not create a shared component or folder. Names that stay: `rateLimitMessage` (exported from `describeFailure.ts`), `LOGOUT_FAILED`.
- A mapper still handles every non-401 case exactly as before; only the 401 branch and its flag go. Update the doc comments that name the removed things: `FailureDisplay.signedOut`, `SavePhase` and `needs-login`, `ListPhase` and `signed-out` in `useBookmarkList.ts`, and "failed and signed-out states" in `FolderSection.tsx`.

## Dependencies

None. Add nothing to `package.json`.

## Acceptance criteria

**Search first.** The builder lists in its plan, from a search of `frontend/src`, every remaining occurrence of `SignedOutMessage`, `signedOut`, `signed-out`, `needs-login`, `LOGGED_OUT_TOAST`, "You're logged out" and `Log in` (the action label), and says why each remaining one is fine (for example `LoginCard`, `AccountDeleted` and its test in `AccountPage.test.tsx`, `loginHref`'s own test, `useSyncPoll`'s own 401 stop, `useBookmark`'s interval stop). After the task the only ones left are those outside the rule above.

**Helper**
- `isUnauthorized` returns true only for an `ApiError` with status 401 (cases above).

**Mappers** (existing test files, rewritten)
- `describeFailure`, `folderFailureMessage`, `describeSaveFailure`, `describeDeleteAccountFailure` and `describeLogoutFailure` have no `signedOut` or `'signed-out'` in their results or tests. Every non-401 case keeps its existing test. A test for a `401` passed to each mapper (the generic result comes back, with no special flag) shows nobody relies on it.

**Hooks**
- For each of `useEditBookmark`, `useEmptyTrash`, `useMoveBookmark`, `useFolderMutation`, `useDeleteAccount`, `useSaveBookmark`: a `401` leaves `failure` null, clears `pending` (or phase back to `'form'`), resolves `false`/`null`, and shows no toast. For the four hooks that refresh (`useEditBookmark`, `useEmptyTrash`, `useMoveBookmark`, `useFolderMutation`) it also does not call `invalidateQueries` (`useSaveBookmark` and `useDeleteAccount` do not use the query client). Each test fails if the check is removed (a generic message, a toast or a refresh would appear). Where a test pinned that a `401` still refreshes (`useMoveBookmark.test.tsx`, `useEmptyTrash.test.tsx`), it now asserts the opposite.
- `toastFailure`: a `401` shows no toast and does not refresh; a non-401 still toasts and refreshes unless `refresh` is false (existing tests). `useRestoreBookmark` and `useDeleteBookmark` tests that pinned the "Log in" action change to assert no toast on a `401`; for the undo flow's second step, no toast and no refresh.
- `useLogout`: a `401` shows no toast, re-enables the trigger and does not call `goTo`; a `200` still calls `suppressLoginRedirect()` and then `goTo` (existing test); `429` and `500` keep their toasts.

**Screens**
- `BookmarkList`: a `401` with no data shows the skeleton, not "Something went wrong", not the empty panel and not any login text. With rows on screen, a `401` from a refetch leaves the rows.
- `BookmarkView`: a `401` with no bookmark shows "Loading…" (not "Something went wrong"); with a bookmark it keeps it; a `404` still wins. The tests that expected the banner after a `401` from Restore, Move or a poll are redesigned: the bookmark stays on screen, nothing is shown, and no refresh follows.
- `FolderChoice` (proved in `SavePopup.test.tsx`, which has no separate test file for it): a `401` on the folder list shows "Loading…", a disabled select and no "Couldn't load your folders." text; a `500` and a network failure still do. The existing `it.each` over '500', '401' and network in that file loses its '401' row (it asserted "Top level" with the text and a working Try again), and gets this test instead.
- `useBookmarkList`: an empty list that gets a `401` on a refetch keeps the empty phase.
- `useDeleteBookmark`: a `401` on the undo's second step shows no toast and does not refresh; a `500` there still refreshes and shows "Restored to the top level. Couldn't move it back to its folder."
- `useBookmarkList`: after a `401` on page 2, `fetchNext` does nothing (no further request).
- `FolderSection`: a `401` with no data shows the skeleton rows and no text.
- `MoveDialog`: a `401` on the folder list shows "Loading folders…"; a write `401` shows no banner.
- `AddUrlForm`, `EmptyTrash`, `DeleteAccountSection`, `EditBookmarkDialog`, `DeleteFolderDialog`, `FolderFormDialog`: a write `401` shows no banner and no text, and the dialog or form is usable again (button enabled, field editable, dialog still open). One test each; it fails if a message were shown.
- `SavePopup`: after a `401` it shows the form with the Save button reading "Save" and no alert; no `'needs-login'` panel; Esc on the form closes it as before.
- Page tests (`BookmarksPage.test.tsx:76`, `FolderPage.test.tsx`): replace the tests that expect the banner with a test that the text "You're logged out" is absent and the screen shows its loading state. `BookmarksPage`'s test also asserted a refetch after the poll's `401`; keep the part that the poll's `401` stops the poll, drop the rest. `AccountPage.test.tsx` has no signed-out banner test; its "Log in" link test belongs to `AccountDeleted` and stays unchanged.
- Every other test that asserts a `401` behavior is rewritten the same way. A search for `401`, "logged out" and `Log in` in `*.test.*` finds them (among others: the row and trash-row toast tests, `useSaveBookmark`'s `needs-login` and dismiss tests, `useBookmarkList`'s later-page case, the dialog tests under `components/ui/` and `features/folder-sidebar/`). The plan lists each file changed.

**Repo-wide**
- `make check` passes (type check, lint and tests).
- Nothing outside the allowed paths changed; no `styles/` change.

## Verifier checks

- `grep` the whole `frontend/src` for `SignedOutMessage`, `signedOut`, `signed-out`, `needs-login`, `LOGGED_OUT_TOAST`, "logged out" and `label: 'Log in'`. Every hit that remains must be justified in the plan (`LoginCard`, `AccountDeleted`, `useSyncPoll`, the helper's own test) and be outside the rule.
- `git diff --stat`: `SignedOutMessage.tsx` and its test are deleted; no `styles/`, `request.ts`, `loginRedirect.ts` or `app-shell/` change.
- Read each hook's `catch`: the `isUnauthorized` check comes before the mapper and before any `setFailure`, `refresh` or toast, and the `finally` still clears the in-flight guard.
- Break each new test: remove the `isUnauthorized` check in one hook, see its test fail, restore it. Do this for at least `useEditBookmark`, `useFolderMutation`, `useSaveBookmark`, `toastFailure` and `useBookmarkList`.
- Confirm `useLogout` still calls `suppressLoginRedirect()` before `goTo` on a `200`, and that the `429` and `500` toasts are unchanged.
- Inputs to try: a `401` while a dialog is open; a `401` on the second step of an undo; a `401` while a save popup is saving; a `401` on page 2 of the list with page 1 on screen; a `401` that arrives on a retry after a `404` on the bookmark page (it shows "Loading…"); a `429` with `Retry-After: 0` still reads "Too many requests. Try again in about 0 seconds."
- The verifier has no browser. The "nothing flashes" outcome is checked by reading that no component renders text or a toast on a `401`, and by the page tests above.

## Stop and ask when

- `login-screen`'s redirect (`redirectToLogin` in `request.ts`) is not on `main`, or does not fire on a `401`.
- The contract (`openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, or an edit to a spec file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.
- A caller of `toastFailure` uses its return value (this file says none does).

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, commit in small steps (the helper and mappers first, then the hooks, then the screens, then the tests), push your branch (never `main`), and finish with a short report with the branch name, what changed, which test shows each behavior above, the list of remaining occurrences from the search, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
