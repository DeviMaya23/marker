# Plan: remove the per-screen signed-out UI

Branch: `claude/remove-signed-out-ui-mwerd8`. Frontend only (`backend/` untouched, so `make test-integration-local` is not needed: not run, no backend change).

Prerequisites checked on this branch: `request.ts` calls `redirectToLogin()` on a 401 (line 64); `useLogout`, `lib/api/loginRedirect.ts`, the undo-restores-folder change and the add-form-key/trash-footer change are all in the history.

Paths below are under `frontend/src/`.

## Acceptance criteria

- [ ] Helper: `isUnauthorized` in `lib/api/ApiError.ts`; test in new `lib/api/ApiError.test.ts` (401 true; 403, 500, TypeError, null, undefined, plain `{status: 401}` false).
- [ ] Mappers: `describeFailure.ts` / `describeFailure.test.ts`, `lib/folders/folderFailureMessage.ts` / `.test.ts`, `lib/bookmarks/saveFailure.ts` / `.test.ts`, `features/account/lib/deleteAccountFailure.ts` / `.test.ts`, `features/account/lib/logout.ts` / `logout.test.ts`: no signed-out flag; a 401 test per mapper returns the generic result.
- [ ] `toastFailure` (`lib/bookmarks/useBookmarkFeedback.ts`, test `useBookmarkFeedback.test.tsx`): 401 silent, no refresh. `useRestoreBookmark.test.tsx`: no toast on 401.
- [ ] `useEditBookmark` (`useEditBookmark.test.tsx`), `useEmptyTrash` (`useEmptyTrash.test.tsx`), `useMoveBookmark` (`useMoveBookmark.test.tsx`): 401 -> no failure, no refresh, resolves false.
- [ ] `useFolderMutation` (`lib/folders/useFolderMutation.ts`; tested through `useCreateFolder.test.tsx`): 401 -> null, no failure, no refresh.
- [ ] `useDeleteAccount` (`features/account/hooks/`; test `useDeleteAccount.test.tsx` if present, else `DeleteAccountSection.test.tsx`): 401 -> false, no failure.
- [ ] `useDeleteBookmark.ts` / `useDeleteBookmark.test.tsx`: 401 on undo step 2 -> no toast, no refresh; 500 keeps refresh and "Restored to the top level..." toast.
- [ ] `useLogout.ts` / `useLogout.test.tsx`: 401 -> no toast, trigger re-enabled, no `goTo`; 200 still `suppressLoginRedirect()` then `goTo`; 429/500 toasts unchanged.
- [ ] `useSaveBookmark.ts` / `useSaveBookmark.test.tsx`: 401 -> failure null, phase `form`; `needs-login` removed.
- [ ] `useBookmarkList.ts` / `useBookmarkList.test.tsx`: 401 no data -> `loading`; empty list + refetch 401 keeps `empty`; page-2 401 -> `fetchNext` does nothing, `loadMoreFailed` false.
- [ ] `BookmarkList.tsx` / `BookmarkList.test.tsx`: 401 no data shows skeleton; rows stay on refetch 401.
- [ ] `BookmarkView.tsx` / `BookmarkView.test.tsx`, `useBookmark.test.tsx`: 401 no bookmark -> "Loading…"; bookmark stays; 404 wins; retry after 404 -> 401 shows "Loading…"; Restore/Move/poll tests redesigned.
- [ ] `FolderSection.tsx` / `FolderSection.test.tsx`: 401 no data -> skeleton rows, no text.
- [ ] `MoveDialog.tsx` / `MoveDialog.test.tsx`, `MoveFolderDialog.tsx` / `MoveFolderDialog.test.tsx`: 401 folder list -> "Loading folders…"; write 401 no banner.
- [ ] `features/save/components/FolderChoice.tsx` + `SavePopup.tsx` / `SavePopup.test.tsx`: 401 folder list -> "Loading…", disabled select, no text; 500 and network keep the text; '401' row removed from the `it.each`.
- [ ] Write-failure screens, one test each: `AddUrlForm.test.tsx`, `EmptyTrash.test.tsx`, `DeleteAccountSection.test.tsx`, `EditBookmarkDialog.test.tsx`, `DeleteFolderDialog.test.tsx`, `FolderFormDialog.test.tsx`.
- [ ] `SavePopup`: after 401 the form shows, button "Save", no alert, no needs-login panel; Esc closes (`SavePopup.test.tsx`).
- [ ] Page tests: `pages/BookmarksPage.test.tsx`, `pages/FolderPage.test.tsx` (no "You're logged out", loading state; poll 401 still stops the poll). `AccountPage.test.tsx` unchanged.
- [ ] Other 401 tests rewritten: `TrashRow.test.tsx`, `BookmarkRow.test.tsx`, `AppShell.test.tsx` (if affected).
- [ ] Delete `components/ui/SignedOutMessage.tsx` and its test; delete `LOGGED_OUT_TOAST`.
- [ ] Search-first list below filled in after the change.
- [ ] `make check` passes. run result: _pending_
- [ ] Backend integration (`make test-integration-local`): not run: frontend-only task, `backend/` untouched.

## Remaining occurrences (search of `frontend/src`)

_filled in at the end_

## Files changed

_filled in at the end_

## Judgment calls

_filled in at the end_
