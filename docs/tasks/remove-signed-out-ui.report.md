# Verification report: remove-signed-out-ui

Branch: `claude/remove-signed-out-ui-verify-5twsek` (started from the builder's `claude/remove-signed-out-ui-mwerd8` at 38b5ccd). Verifier added one test fix (see Findings).

## Verdict
No Blocking findings. Three Non-blocking.

## 1. `make check`
- Run 1: failed, 1 test: `EmptyTrash.test.tsx > Empty trash dialog text > focuses the field on open`. Run alone on this branch it failed 2 of 3 times; on `origin/main` it failed 3 of 3. It is not touched by this diff (the diff changes only the 401 test in that file) and fails on `main` too, so it is a flaky focus test that predates this task (Non-blocking N1).
- Reruns (before and after my test fix): `make check` exit 0, 82 files, 1083 tests passed.
- Integration tests: not run. The task is frontend-only and no file under `backend/` changed. No criterion depends only on integration tests.

## 2. Acceptance criteria

All verified by mutation: the `isUnauthorized` check (or the 401 branch) was replaced with `false`, the named test failed, and the source was restored. `git status` showed only my test change afterwards.

| Criterion | Test (file > name) | Real? | Result |
|---|---|---|---|
| Helper `isUnauthorized` | `lib/api/ApiError.test.ts` (401 true; 403, 500, TypeError, null, undefined, plain `{status:401}` false) | Yes, pure function with every listed case | Met |
| Mappers: no `signedOut`/`'signed-out'`; a 401 returns generic | `describeFailure`, `saveFailure`, `folderFailureMessage`, `deleteAccountFailure`, `logout` tests | Yes. Grep of `frontend/src` finds no `signedOut`, `needs-login`, `LOGGED_OUT_TOAST`, `SignedOutMessage`, `label: 'Log in'`. The only `signed-out` hits are `useLoginProbe` (login-screen's own probe) | Met |
| `useEditBookmark`, `useEmptyTrash`, `useMoveBookmark`, `useFolderMutation`, `useDeleteAccount`, `useSaveBookmark`: 401 silent | each hook's test "a 401 is silent …" (`useFolderMutation` via `useCreateFolder.test.tsx`) | Yes, each failed under mutation | Met |
| `toastFailure` | `useBookmarkFeedback.test.tsx > a 401 is silent: no toast and no refresh` | Yes, failed under mutation | Met |
| `useRestoreBookmark` | `useRestoreBookmark.test.tsx` (no toast on 401) | Via `toastFailure`, which is mutation-tested | Met |
| `useDeleteBookmark` undo step 2 | `useDeleteBookmark.test.tsx > move back fails with 401: no toast and no refresh`; a 500 row asserts the refresh and the "Restored to the top level…" toast | Yes, failed under mutation | Met |
| `useLogout` | `useLogout.test.tsx > on 401 shows no toast, re-enables the trigger and does not navigate`; order test at line 130 (suppress before goTo); 429 test line 100 | Yes | Met |
| `useBookmarkList`: 401 no data is `loading` | `useBookmarkList.test.tsx > stays in the loading phase for a 401 …` | Yes, failed under mutation | Met |
| `useBookmarkList`: empty list + 401 refetch keeps `empty` | `… keeps the empty phase when an empty list gets a 401 on a refetch` | **Builder's version was vacuous**: it read `result.current` before react-query's batched notification reached the hook, so it passed with the rule removed. I fixed it (see N1 below); it now fails when the rule is removed | Met, after my fix |
| `useBookmarkList`: page-2 401, `fetchNext` does nothing, `loadMoreFailed` false | `… keeps page 1 on screen after a 401 on page 2 …` | Yes, failed under mutation | Met |
| `BookmarkList` skeleton on 401; rows stay on refetch 401 | `BookmarkList.test.tsx` (live and trash 401 skeleton tests failed when the `loading` branch was removed) | Yes for the skeleton. The "rows stay" case holds by react-query keeping `data`; the test is a plain data-kept check | Met |
| `BookmarkView` | `BookmarkView.test.tsx`: 401 → "Loading…"; retry after 404 answers 401 → "Loading…"; Restore/Move/poll 401 leave the bookmark and show nothing | Yes, the first two failed under mutation | Met |
| `FolderChoice` via `SavePopup.test.tsx` | `the folder choice > a 401 on the folder list reads like loading …`; '401' row gone from the `it.each` | Yes, failed under mutation | Met |
| `FolderSection` | `shows the skeleton rows and no text on a 401 with no folders` | Yes, failed under mutation | Met |
| `MoveDialog` / `MoveFolderDialog` | `MoveDialog.test.tsx > shows the loading state, not an error, for a 401 …`; `MoveFolderDialog.test.tsx` write-401 test | Yes (first failed under mutation) | Met |
| Write screens: `AddUrlForm`, `EmptyTrash`, `DeleteAccountSection`, `EditBookmarkDialog`, `DeleteFolderDialog`, `FolderFormDialog` | one 401 test each; the two presentational dialogs wrap the real hook in the test | Yes; they depend on the hook mutations above | Met |
| `SavePopup` after 401 | `SavePopup.test.tsx` (form, "Save", no alert, Esc closes) | Yes | Met |
| Page tests | `BookmarksPage.test.tsx:76`, `FolderPage.test.tsx` (no "You're logged out", loading state; poll 401 stops the poll) | Yes | Met |
| Other 401 tests rewritten | `TrashRow`, `BookmarkRow` tests | Yes | Met |
| Deletions | `SignedOutMessage.tsx` and its test deleted; `LOGGED_OUT_TOAST` gone | | Met |
| Repo-wide | `make check` exit 0 on rerun | See N1 about the flaky test | Met |
| No change outside allowed paths | `git diff --name-only origin/main...HEAD`: only `frontend/src/**` and the plan file. No `styles/`, `request.ts`, `loginRedirect.ts`, `app-shell/`, `package*.json`, `backend/`, `openapi.yaml` | | Met |

## 3. Plan check
- Every acceptance criterion appears in the plan; none missing.
- Ticked items whose test does not check the behavior: one. The `useBookmarkList` "empty list keeps `empty` on a refetch 401" item was ticked but its test passed without the rule (fixed above).
- The plan's mutation check lists five hooks; I repeated it on 14 files and all were killed apart from the case above.
- The plan matches the diff: file lists agree with `git diff --stat`; the remaining-occurrences list matches my grep (the `signed-out` hits in `useLoginProbe` and the negative assertions in tests).
- The plan says `useBookmark.test.tsx` needed no change, but lists "retry after 404 → 401" under `BookmarkView.test.tsx`; the test is there.
- The plan states `make check` as "run result: passed"; it does not mention the flaky `EmptyTrash` focus test (N1).

## 4. Rule checks
- Only `handler/` imports `internal/api`: no backend change.
- Every repository query filters by `user_id`: no backend change.
- `users.version` incremented in every write: no backend change.
- `go.mod` unchanged, no dependency added (`package.json`, lockfile untouched).
- "Verifier checks" from the task file:
  - Grep: clean (see criteria row 2).
  - `git diff --stat`: `SignedOutMessage` and test deleted; no forbidden paths.
  - Each hook's `catch`: `isUnauthorized` comes first, before the mapper, `setFailure`, `refresh` and any toast; the `finally` clearing the guard is unchanged. In `useDeleteBookmark` the step-2 check precedes `refresh` and the toast.
  - `useLogout` still calls `suppressLoginRedirect()` before `goTo` on a 200; the 429 and 500 toasts are unchanged. A 429 with `Retry-After: 0` reads "Too many requests. Try again in about 0 seconds." (`logout.test.ts:54`, `describeFailure.test.ts:70`).
  - Inputs tried by test and reading: 401 with a dialog open (write-screen tests); 401 on undo step 2; 401 while the save popup is saving (`useSaveBookmark` test: back to `form`, another save allowed); 401 on page 2 with page 1 on screen; 401 on a retry after a 404 on the bookmark page (shows "Loading…").
  - No browser: "nothing flashes" is checked by reading that no component renders text or a toast on a 401.

## 5. Findings

### Blocking
None.

### Non-blocking
- **N1. Vacuous test, fixed.** `useBookmarkList.test.tsx > keeps the empty phase when an empty list gets a 401 on a refetch` passed with `|| unauthorized` removed from the `'empty'` rule. Reproduce on the builder's commit: change `(!error || unauthorized)` to `!error` in `useBookmarkList.ts`; all 206 tests in `features/bookmark-list` pass. Cause: the assertion ran before react-query's batched notification re-rendered the hook. I added a 20 ms flush and a `loadMoreFailed` check to that test; it now fails with the rule removed (`Expected "empty", Received "ready"`). No source changed.
- **N2. Flaky `EmptyTrash` focus test.** `EmptyTrash.test.tsx > focuses the field on open` fails intermittently, including on `origin/main` (3 of 3 runs there), so it predates this task and could fail `make check` in CI. Not caused by this diff; worth a backlog line.
- **N3. Small cosmetic points.** `AddUrlForm.tsx` keeps a doubled blank line where the banner was removed; the doc comments in `useBookmarkList.ts` and `FolderChoice.tsx` now have long lines. Neither affects behavior.
