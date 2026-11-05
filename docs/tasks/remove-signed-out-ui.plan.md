# Plan: remove the per-screen signed-out UI

Branch: `claude/remove-signed-out-ui-mwerd8`. Frontend only (`backend/` untouched, so `make test-integration-local` is not needed: not run, no backend change).

Prerequisites checked on this branch: `request.ts` calls `redirectToLogin()` on a 401 (line 64); `useLogout`, `lib/api/loginRedirect.ts`, the undo-restores-folder change and the add-form-key/trash-footer change are all in the history.

Paths below are under `frontend/src/`.

## Acceptance criteria

- [x] Helper: `isUnauthorized` in `lib/api/ApiError.ts`; test in new `lib/api/ApiError.test.ts` (401 true; 403, 500, TypeError, null, undefined, plain `{status: 401}` false).
- [x] Mappers: `describeFailure.ts` / `describeFailure.test.ts`, `lib/folders/folderFailureMessage.ts` / `.test.ts`, `lib/bookmarks/saveFailure.ts` / `.test.ts`, `features/account/lib/deleteAccountFailure.ts` / `.test.ts`, `features/account/lib/logout.ts` / `logout.test.ts`: no signed-out flag; a 401 test per mapper returns the generic result.
- [x] `toastFailure` (`lib/bookmarks/useBookmarkFeedback.ts`, test `useBookmarkFeedback.test.tsx`): 401 silent, no refresh. `useRestoreBookmark.test.tsx`: no toast on 401.
- [x] `useEditBookmark` (`useEditBookmark.test.tsx`), `useEmptyTrash` (`useEmptyTrash.test.tsx`), `useMoveBookmark` (`useMoveBookmark.test.tsx`): 401 -> no failure, no refresh, resolves false.
- [x] `useFolderMutation` (`lib/folders/useFolderMutation.ts`; tested through `useCreateFolder.test.tsx`): 401 -> null, no failure, no refresh.
- [x] `useDeleteAccount` (`features/account/hooks/`; test `useDeleteAccount.test.tsx` if present, else `DeleteAccountSection.test.tsx`): 401 -> false, no failure.
- [x] `useDeleteBookmark.ts` / `useDeleteBookmark.test.tsx`: 401 on undo step 2 -> no toast, no refresh; 500 keeps refresh and "Restored to the top level..." toast.
- [x] `useLogout.ts` / `useLogout.test.tsx`: 401 -> no toast, trigger re-enabled, no `goTo`; 200 still `suppressLoginRedirect()` then `goTo`; 429/500 toasts unchanged.
- [x] `useSaveBookmark.ts` / `useSaveBookmark.test.tsx`: 401 -> failure null, phase `form`; `needs-login` removed.
- [x] `useBookmarkList.ts` / `useBookmarkList.test.tsx`: 401 no data -> `loading`; empty list + refetch 401 keeps `empty`; page-2 401 -> `fetchNext` does nothing, `loadMoreFailed` false.
- [x] `BookmarkList.tsx` / `BookmarkList.test.tsx`: 401 no data shows skeleton; rows stay on refetch 401.
- [x] `BookmarkView.tsx` / `BookmarkView.test.tsx`, `useBookmark.test.tsx`: 401 no bookmark -> "Loading…"; bookmark stays; 404 wins; retry after 404 -> 401 shows "Loading…"; Restore/Move/poll tests redesigned.
- [x] `FolderSection.tsx` / `FolderSection.test.tsx`: 401 no data -> skeleton rows, no text.
- [x] `MoveDialog.tsx` / `MoveDialog.test.tsx`, `MoveFolderDialog.tsx` / `MoveFolderDialog.test.tsx`: 401 folder list -> "Loading folders…"; write 401 no banner.
- [x] `features/save/components/FolderChoice.tsx` + `SavePopup.tsx` / `SavePopup.test.tsx`: 401 folder list -> "Loading…", disabled select, no text; 500 and network keep the text; '401' row removed from the `it.each`.
- [x] Write-failure screens, one test each: `AddUrlForm.test.tsx`, `EmptyTrash.test.tsx`, `DeleteAccountSection.test.tsx`, `EditBookmarkDialog.test.tsx`, `DeleteFolderDialog.test.tsx`, `FolderFormDialog.test.tsx`.
- [x] `SavePopup`: after 401 the form shows, button "Save", no alert, no needs-login panel; Esc closes (`SavePopup.test.tsx`).
- [x] Page tests: `pages/BookmarksPage.test.tsx`, `pages/FolderPage.test.tsx` (no "You're logged out", loading state; poll 401 still stops the poll). `AccountPage.test.tsx` unchanged.
- [x] Other 401 tests rewritten: `TrashRow.test.tsx`, `BookmarkRow.test.tsx`, `AppShell.test.tsx` (if affected).
- [x] Delete `components/ui/SignedOutMessage.tsx` and its test; delete `LOGGED_OUT_TOAST`.
- [x] Search-first list below filled in after the change.
- [x] `make check` passes. run result: passed (lint, 1083 tests in 82 files, build, openapi-lint; make exit 0)
- [x] Backend integration (`make test-integration-local`): not run: frontend-only task, `backend/` untouched.

## Remaining occurrences (search of `frontend/src`)

Search: `SignedOutMessage|signedOut|signed-out|needs-login|LOGGED_OUT_TOAST|logged out|You're logged out|label: 'Log in'|Log in`, excluding the generated `lib/api/schema.d.ts` (its "Log in to continue." is an API doc example).

- `SignedOutMessage`, `LOGGED_OUT_TOAST`, `needs-login`, `label: 'Log in'`, the `signedOut` field and the mappers' `'signed-out'` kind: no hits left in code or tests.
- `features/account/components/AccountDeleted.tsx` "Log in" link: shown after a successful account deletion, not after a 401 (out of scope). Its test is in `pages/AccountPage.test.tsx:68`, unchanged.
- `features/login/components/LoginCard.tsx` "Log in" link and `LoginCard.test.tsx`: the login screen itself.
- `pages/LoginPage.test.tsx` (`signedOut` helper, "Log in" link): login screen tests.
- `features/login/hooks/useLoginProbe.ts` / `.test.tsx` (`'signed-out'` probe value): the login page's own who-am-I probe, not a per-screen banner.
- `App.login.test.tsx` (title says "signed-out save popup"): `login-screen`'s FR-3c redirect test; it is a name, not UI.
- Negative assertions in my new tests (`queryByText(/logged out|Log in/)` in `MoveFolderDialog`, `EditBookmarkDialog`, `DeleteAccountSection`, `BookmarkView`, `DeleteFolderDialog`, `FolderFormDialog`, `FolderSection`, `AddUrlForm`, `BookmarkList`, `EmptyTrash`, `SavePopup`, `useDeleteBookmark`, `BookmarksPage`, `FolderPage` tests): they assert the text is absent.
- Not matched by the regex but still intentionally present, as the task says: `useSyncPoll`'s own `isSignedOut` and `useBookmark`'s refetch-interval stop (both inline 401 checks).

## Files changed (all under `frontend/src/`)

Source: `lib/api/ApiError.ts`, `lib/bookmarks/{describeFailure,saveFailure,useBookmarkFeedback,useEditBookmark,useEmptyTrash,useMoveBookmark,useDeleteBookmark,useSaveBookmark}.ts`, `lib/folders/{folderFailureMessage,useFolderMutation}.ts`, `features/account/lib/{deleteAccountFailure,logout}.ts`, `features/account/hooks/{useDeleteAccount,useLogout}.ts`, `features/account/components/DeleteAccountSection.tsx`, `features/bookmark-list/hooks/useBookmarkList.ts`, `features/bookmark-list/components/{BookmarkList,AddUrlForm,EmptyTrash}.tsx`, `features/bookmark-detail/components/BookmarkView.tsx`, `features/folder-sidebar/components/{FolderSection,DeleteFolderDialog,FolderFormDialog}.tsx`, `features/save/components/{FolderChoice,SavePopup}.tsx`, `components/ui/{MoveDialog,MoveFolderDialog,EditBookmarkDialog}.tsx`. Deleted: `components/ui/SignedOutMessage.tsx` and `.test.tsx`.

Tests: new `lib/api/ApiError.test.ts`; rewritten or extended: `describeFailure`, `saveFailure`, `folderFailureMessage`, `deleteAccountFailure`, `logout`, `useBookmarkFeedback`, `useEditBookmark`, `useEmptyTrash`, `useMoveBookmark`, `useRestoreBookmark`, `useDeleteBookmark`, `useSaveBookmark`, `useCreateFolder` (covers `useFolderMutation`), `useDeleteAccount`, `useLogout`, `useBookmarkList`, `BookmarkList`, `BookmarkRow`, `TrashRow`, `BookmarkView`, `FolderSection`, `MoveDialog`, `MoveFolderDialog`, `AddUrlForm`, `EmptyTrash`, `DeleteAccountSection`, `EditBookmarkDialog`, `DeleteFolderDialog`, `FolderFormDialog`, `SavePopup`, `BookmarksPage`, `FolderPage`. `useBookmark.test.tsx`, `AppShell.test.tsx`, `AccountPage.test.tsx` needed no change.

Mutation check: replacing `isUnauthorized(error)` with `false` in `useEditBookmark`, `useFolderMutation`, `useSaveBookmark`, `useBookmarkFeedback` and `useBookmarkList` each made the new test fail; sources restored.

## Judgment calls

- `EditBookmarkDialog` and `FolderFormDialog` are presentational (the failure comes in as a prop), so their "write 401 shows nothing" test wraps the real hook (`useEditBookmark`, `useCreateFolder`) with a mocked API call, in a small harness inside the same test file. A prop-only test could not fail if a message were shown.
- `useFolderMutation` has no test file of its own; its 401 test lives in `useCreateFolder.test.tsx` (no new test file, as the task says).
- `useDeleteAccount` already has a test file; the 401 test is there, and `DeleteAccountSection.test.tsx` covers the dialog.
- `useLogout`: on a 401 the `catch` returns before the mapper, so `describeLogoutFailure` is only reached for non-401 errors.
- `useBookmarkList`: `fetchNext` is blocked by the current query error being a 401, as the task says; a later successful refetch clears the error and lets paging resume.
- `useSaveBookmark.dismiss` now clears `failure` unconditionally (the `'signed-out'` carve-out is gone); its phase rule is unchanged.
- The "toast absent" checks use `document.querySelector('.toast')` where nothing else toasts, and text queries in the undo-flow tests, where "Moved to trash." is legitimately on screen.
- I added a `500` row to the undo flow's "move back fails" table so the "500 still refreshes and shows RESTORED_BUT_NOT_MOVED" criterion is proven by name.
- Plain `make test-integration-local` is not run: no file under `backend/` changed.
