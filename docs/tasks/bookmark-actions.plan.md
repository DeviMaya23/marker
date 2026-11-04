# Plan: bookmark-actions (front end)

Branch: `claude/bookmark-actions-e4mhcd`. All paths under `frontend/src/`. One item per acceptance criterion in `docs/tasks/bookmark-actions.md`; tick when done and tested.

## API wrappers
- [ ] `updateBookmark` sends PATCH with only given keys (`note: null` sent, omitted note absent); `deleteBookmark` DELETE; `restoreBookmark` POST `/restore`; `emptyTrash` DELETE `/trash` returning `{ deleted }` — `lib/api/bookmarks.ts`, test `lib/api/bookmarks.test.ts`

## Failure messages (pure, table-driven)
- [ ] Every cell of the failure table incl. `retryAfter` number/0/null, 422 on title/note/both, network failure — `lib/bookmarks/describeFailure.ts`, test `lib/bookmarks/describeFailure.test.ts` (the login-link builder is extracted to `lib/loginHref.ts`, tested in `lib/loginHref.test.ts`; `SignedOutMessage.test.tsx` unchanged)

## Dialog, Menu, Toast
- [ ] Dialog: Esc and backdrop close; neither while busy; focus to marked field on open, back to opener on close — `components/ui/Dialog.tsx`, test `components/ui/Dialog.test.tsx`
- [ ] Menu: toggle, Esc closes + refocus button, Down/Up/Home/End, outside click closes, choosing closes, `aria-expanded` — `components/ui/Menu.tsx`, test `components/ui/Menu.test.tsx`
- [ ] Toast: 3.5 s / 6 s with action, action runs callback and dismisses, two stack, unmount clears timers — `components/ui/Toast.tsx`, test `components/ui/Toast.test.tsx`

## Edit dialog
- [ ] Opens prefilled; Save disabled until changed and when title > 300 / note > 500 code points (300/500 pass, 301/501 fail, emoji = 1) — `components/ui/EditBookmarkDialog.tsx`, test `components/ui/EditBookmarkDialog.test.tsx`; pure counting in `lib/bookmarks/editChanges.ts` + `editChanges.test.ts`
- [ ] Only changed fields sent (title / note / both; trimmed title; spaces-only change sends nothing; emptied note -> `null`; spaces-only note -> `null`; empty note on null note sends nothing) — `lib/bookmarks/editChanges.test.ts`, `lib/bookmarks/useEditBookmark.test.tsx`, `EditBookmarkDialog.test.tsx`
- [ ] Enter in title submits; Esc and Cancel discard; second Enter while saving sends nothing; fields and buttons disabled while saving — `EditBookmarkDialog.test.tsx`
- [ ] Success closes, refreshes queries, shows "Saved."; each Edit-column failure keeps dialog open with right message in right place and typed text kept; 401 shows signed-out message — `lib/bookmarks/useEditBookmark.test.tsx`, `EditBookmarkDialog.test.tsx`
- [ ] Reopening starts from current values — `EditBookmarkDialog.test.tsx`

## List row
- [ ] Button named "Actions for <title>"; menu holds Open original link (new tab, noopener noreferrer), Edit title & note, Delete in order, no Move to… — `features/bookmark-list/components/BookmarkRow.tsx`, test `BookmarkRow.test.tsx`
- [ ] Delete calls `deleteBookmark` once, refreshes, toast "Moved to trash." + Undo; menu button disabled in flight; Undo restores/refreshes/toasts; Undo failure message; each Delete-column failure toast + refresh; 401 toast "Log in" action goes to login link — `lib/bookmarks/useDeleteBookmark.ts` + `useDeleteBookmark.test.tsx`, `BookmarkRow.test.tsx`
- [ ] Nothing changes on screen until the refreshed list arrives — `features/bookmark-list/components/BookmarkList.test.tsx`

## Bookmark page
- [ ] Live bookmark shows Edit and Delete, no Restore; edit saves, refreshes, page shows new title/note (cleared note disappears); Delete refreshes, "Moved to trash.", no Undo — `features/bookmark-detail/components/BookmarkView.tsx`, test `BookmarkView.test.tsx`
- [ ] Trashed bookmark shows banner text + Restore, no Edit/Delete; Restore refreshes, toasts "Restored to the top level.", page shows live view — `BookmarkView.test.tsx`, `lib/bookmarks/useRestoreBookmark.test.tsx`
- [ ] Buttons disabled in flight; 404/401 from these calls replace the page as loading would — `BookmarkView.test.tsx`
- [ ] Existing polling, title fallback, page text tests pass unchanged — `BookmarkView.test.tsx`, `useBookmark.test.tsx`

## Trash view
- [ ] Each row has Open original link and Restore; Restore calls API once, refreshes, toasts, disabled in flight; each failure toast — `features/bookmark-list/components/TrashRow.tsx`, test `TrashRow.test.tsx`
- [ ] Empty trash button disabled while loading / empty / failed; dialog text for 1, several, more pages (no count); confirm needs `empty trash` (also `Empty Trash `); Esc and Cancel close; everything disabled while working — `features/bookmark-list/components/TrashActions.tsx` (button + dialog), test `TrashActions.test.tsx`, `lib/bookmarks/useEmptyTrash.test.tsx`
- [ ] Success refreshes, closes, toast with server's number (1 bookmark / 0 = already empty); failure keeps dialog with message; 401 shows signed-out message — `TrashActions.test.tsx`, `useEmptyTrash.test.tsx`

## Repo-wide
- [ ] `make check` passes
- [ ] No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`
- [ ] `package.json` / lockfile changed only to add `@base-ui/react` (1.9.0)
- [ ] Nothing under `backend/`, other `docs/`, Makefile, `openapi.yaml` changed; no reference `.ts/.tsx` copied (CSS only)

## Judgment calls
(filled in at the end)
