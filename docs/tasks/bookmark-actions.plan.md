# Plan: bookmark-actions (front end)

Branch: `claude/bookmark-actions-e4mhcd`. All paths under `frontend/src/`. One item per acceptance criterion in `docs/tasks/bookmark-actions.md`; tick when done and tested.

## API wrappers
- [x] `updateBookmark` sends PATCH with only given keys (`note: null` sent, omitted note absent); `deleteBookmark` DELETE; `restoreBookmark` POST `/restore`; `emptyTrash` DELETE `/trash` returning `{ deleted }` — `lib/api/bookmarks.ts`, test `lib/api/bookmarks.test.ts`

## Failure messages (pure, table-driven)
- [x] Every cell of the failure table incl. `retryAfter` number/0/null, 422 on title/note/both, network failure — `lib/bookmarks/describeFailure.ts`, test `lib/bookmarks/describeFailure.test.ts` (the login-link builder is extracted to `lib/loginHref.ts`, tested in `lib/loginHref.test.ts`; `SignedOutMessage.test.tsx` unchanged)

## Dialog, Menu, Toast
- [x] Dialog: Esc and backdrop close; neither while busy; focus to marked field on open, back to opener on close — `components/ui/Dialog.tsx`, test `components/ui/Dialog.test.tsx`
- [x] Menu: toggle, Esc closes + refocus button, Down/Up/Home/End, outside click closes, choosing closes, `aria-expanded` — `components/ui/Menu.tsx`, test `components/ui/Menu.test.tsx`
- [x] Toast: 3.5 s / 6 s with action, action runs callback and dismisses, two stack, unmount clears timers — `components/ui/Toast.tsx`, test `components/ui/Toast.test.tsx`

## Edit dialog
- [x] Opens prefilled; Save disabled until changed and when title > 300 / note > 500 code points (300/500 pass, 301/501 fail, emoji = 1) — `components/ui/EditBookmarkDialog.tsx`, test `components/ui/EditBookmarkDialog.test.tsx`; pure counting in `lib/bookmarks/editChanges.ts` + `editChanges.test.ts`
- [x] Only changed fields sent (title / note / both; trimmed title; spaces-only change sends nothing; emptied note -> `null`; spaces-only note -> `null`; empty note on null note sends nothing) — `lib/bookmarks/editChanges.test.ts`, `lib/bookmarks/useEditBookmark.test.tsx`, `EditBookmarkDialog.test.tsx`
- [x] Enter in title submits; Esc and Cancel discard; second Enter while saving sends nothing; fields and buttons disabled while saving — `EditBookmarkDialog.test.tsx`
- [x] Success closes, refreshes queries, shows "Saved."; each Edit-column failure keeps dialog open with right message in right place and typed text kept; 401 shows signed-out message — `lib/bookmarks/useEditBookmark.test.tsx`, `EditBookmarkDialog.test.tsx`
- [x] Reopening starts from current values — `EditBookmarkDialog.test.tsx`

## List row
- [x] Button named "Actions for <title>"; menu holds Open original link (new tab, noopener noreferrer), Edit title & note, Delete in order, no Move to… — `features/bookmark-list/components/BookmarkRow.tsx`, test `BookmarkRow.test.tsx`
- [x] Delete calls `deleteBookmark` once, refreshes, toast "Moved to trash." + Undo; menu button disabled in flight; Undo restores/refreshes/toasts; Undo failure message; each Delete-column failure toast + refresh; 401 toast "Log in" action goes to login link — `lib/bookmarks/useDeleteBookmark.ts` + `useDeleteBookmark.test.tsx` (shared pieces `useBookmarkFeedback.ts` + test), `BookmarkRow.test.tsx`
- [x] Nothing changes on screen until the refreshed list arrives — `features/bookmark-list/components/BookmarkList.test.tsx`

## Bookmark page
- [x] Live bookmark shows Edit and Delete, no Restore; edit saves, refreshes, page shows new title/note (cleared note disappears); Delete refreshes, "Moved to trash.", no Undo — `features/bookmark-detail/components/BookmarkView.tsx`, test `BookmarkView.test.tsx`
- [x] Trashed bookmark shows banner text + Restore, no Edit/Delete; Restore refreshes, toasts "Restored to the top level.", page shows live view — `BookmarkView.test.tsx`, `lib/bookmarks/useRestoreBookmark.test.tsx`
- [x] Buttons disabled in flight; 404/401 from these calls replace the page as loading would — `BookmarkView.test.tsx`
- [x] Existing polling, title fallback, page text tests pass unchanged — `BookmarkView.test.tsx`, `useBookmark.test.tsx`

## Trash view
- [x] Each row has Open original link and Restore; Restore calls API once, refreshes, toasts, disabled in flight; each failure toast — `features/bookmark-list/components/TrashRow.tsx`, test `TrashRow.test.tsx`
- [x] Empty trash button disabled while loading / empty / failed; dialog text for 1, several, more pages (no count); confirm needs `empty trash` (also `Empty Trash `); Esc and Cancel close; everything disabled while working — `features/bookmark-list/components/EmptyTrash.tsx` (button + dialog), test `EmptyTrash.test.tsx`, `lib/bookmarks/useEmptyTrash.test.tsx`
- [x] Success refreshes, closes, toast with server's number (1 bookmark / 0 = already empty); failure keeps dialog with message; 401 shows signed-out message — `EmptyTrash.test.tsx`, `useEmptyTrash.test.tsx`

## Repo-wide
- [x] `make check` passes
- [x] No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`
- [x] `package.json` / lockfile changed only to add `@base-ui/react` (1.9.0); `make check` run: passed (415 frontend tests); `make test-integration-local`: run, passed
- [x] Nothing under `backend/`, other `docs/`, Makefile, `openapi.yaml` changed; no reference `.ts/.tsx` copied (CSS only)

## Judgment calls
Things the task file did not settle, and what I chose:

1. **Wrapper tests.** `TESTING.md` says a thin API wrapper over generated types gets no unit test; the task file says each of the four gets one. I followed the task file.
2. **Undo failure and 401.** The task says an Undo failure shows "Couldn't undo. It may have been changed elsewhere." I show that for every failure except a 401, which shows the "You're logged out." toast with "Log in". Failures of Undo also refresh.
3. **Tones.** "It was already in the trash." and "It was already restored." are neutral toasts (as the table says). Everything else, including the Undo failure message, is an error toast.
4. **Counting.** The title is counted, and compared with 300, after trimming (that is what is sent), and its counter shows the trimmed count. A note of only spaces is sent as `null`, so it is never "too long", however many spaces it has. A note is counted as typed.
5. **Table gaps.** A combination the table marks "n/a" or does not list (for example `409 bookmark_in_trash` on Restore, `404` on Empty trash, a `422` without `too_long`) gets the generic message for that action.
6. **`retryAfter` of 0** reads "Too many requests. Try again in about 0 seconds." (same rule as the save screens); a negative or fractional value reads "in a moment".
7. **Refreshing after Empty trash** has no bookmark id, so it invalidates the `['bookmark']` prefix (every bookmark page) as well as the lists.
8. **Empty trash button.** It reads the trash through its own `useBookmarkList({ trashed: true })`, which shares the TanStack cache with the list below it, so the page is not refactored. It is enabled when that hook's phase is `ready` (so also when only a later page failed to load).
9. **Placement.** `EditBookmarkDialog` is in `components/ui/` (the task says dialog parts go there); the Empty trash dialog is feature-owned in `bookmark-list`. `queryKeys.ts` moved from `features/bookmark-list/lib/` to `lib/bookmarks/` because the shared hooks need it (promotion, ARCHITECTURE.md). The login redirect is `lib/goTo.ts` so tests can replace it; `useToast` and its types are in `components/ui/useToast.ts` because the lint rule `react-refresh/only-export-components` forbids a hook next to a component.
10. **Existing tests changed.** Four old assertions described the read-only screens this task changes (trash rows with no buttons, the old banner text, "no buttons" on the bookmark page, the trash page with no buttons); I updated them to the new behaviour. Their wrappers got the toast provider. Polling, title fallback and page-text tests are unchanged.
11. **Test helpers.** New `test/wrap.tsx` (`renderApp`, `testClient`) and `test/hookWrapper.tsx`. `test/setup.ts` needed no stand-ins: Base UI's Dialog, Menu and Toast ran in jsdom as they are.
12. **Toast markup.** The viewport gets `role="status"` and `aria-live="polite"` as props on Base UI's `Toast.Viewport`. Base UI gives each toast root `role="dialog"`, so tests look up the edit and empty-trash dialogs by name.
13. **Dialog while saving.** Cancel is disabled as well as Esc and the backdrop. The edit form also keeps its own in-flight guard (a ref), so two submits in the same tick send once even before the parent re-renders (found by a test).
14. **Confirm dialog.** Enter in the "empty trash" field submits when the phrase matches (it is a form).

