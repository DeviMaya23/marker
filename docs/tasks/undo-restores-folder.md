# Task: Undo of a bookmark delete puts the bookmark back in its folder (front end)

> Front end. One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> It fixes a known gap of `bookmark-actions` (merged): the Undo of a delete calls `restoreBookmark`, and the server's restore always puts the bookmark at the top level, so a bookmark deleted from a folder comes back without its folder. The server and the contract do not change (FR-19 says restore goes to the top level). The UI puts the bookmark back itself with a second call.

## Goal

A signed-in user who deletes a bookmark from a row in a list and then presses Undo gets the bookmark back in the folder it was in, not at the top level. A bookmark that was at the top level comes back at the top level, as today.

Requirements covered: FR-14 (a bookmark is in one folder or at the top, also after an undo), FR-19 (the server's restore still goes to the top level, and the trash view's Restore button is unchanged). The Undo itself is not a numbered requirement: `docs/requirements.md` says only that a delete moves the bookmark to the trash (FR-17). The Undo toast came with `bookmark-actions` as a product decision, and this task makes it return the bookmark to where it was; no requirement states that, and none is changed.

Out of scope, and why:

- **The bookmark page.** Its Delete has no Undo (`useDeleteBookmark(id, { undo: false })` in `BookmarkView`), and stays that way: the user decided to leave it out.
- **The trash view's Restore button** (`TrashRow`, `useRestoreBookmark`). FR-19 and the brief say it goes to the top level, and the toast says so. Unchanged.
- **Any change to the server, `openapi.yaml` or `docs/requirements.md`.** The restore stays "to root" (FR-19). The folder is put back with `updateBookmark`, which already accepts `folder_id`.
- **Undo for moves.** FR-15 says moves are not undoable. Putting a bookmark back after a restore finishes the undo of a delete; it is not an undo of a move.
- **Atomicity.** The undo is two calls, so the bookmark is at the top level for a moment, and the sync counter goes up twice. See Known gaps.

## Role and ownership

Role: Frontend (see `AGENTS.md`).

You may change `frontend/**` except `package.json`, `package-lock.json`, `README.md` and any stylelint configuration. You may not change `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/undo-restores-folder.plan.md`, see `AGENTS.md`), the Makefile, or `frontend/src/lib/api/schema.d.ts` (generated).

**Shared files.** `auth-backend` may run at the same time; it changes only `backend/**` and its own docs, so nothing is shared. No other front-end task is planned alongside this one. You change `lib/bookmarks/useDeleteBookmark.ts` and its test, and `features/bookmark-list/components/BookmarkRow.tsx` and its test. You do not change `useRestoreBookmark`, `describeFailure`, `TrashRow` or `BookmarkView` (see Structure for the one allowed exception).

## Operations used

All real on the server today.

- `deleteBookmark` (`DELETE /api/v1/bookmarks/{id}`, `204`): unchanged.
- `restoreBookmark` (`POST /api/v1/bookmarks/{id}/restore`, `200` with `BookmarkSummary`): unchanged. Sets `folder_id` to null.
- `updateBookmark` (`PATCH /api/v1/bookmarks/{id}`, `200` with `BookmarkSummary`): sends `folder_id` alone. Existing wrapper in `lib/api/bookmarks.ts`; `folder_id: null` is sent as an explicit `null`, an absent key is not sent. The server answers `404 not_found` for a folder that does not exist or belongs to someone else (and when it is deleted between the check and the write), `409 bookmark_in_trash`, `401`, `429` with `Retry-After`, and `422` for an unknown field or too-long value (not reachable here). The contract also lists `403` (CSRF), `413` and `415`; the front end's request layer prevents them, and if one arrives it is "anything else" below.

Types come from `src/lib/api/schema.d.ts`; write no second copy. Mock exactly the answers above in tests.

## Behavior

Only the row's Undo changes. The delete itself, its toast "Moved to trash." with the "Undo" action (6 seconds), its failure table and the in-flight rules stay exactly as they are.

**What the row remembers.** When the user deletes, the row's bookmark has a `folder_id`: a folder id, or `null` for the top level. The hook takes that value when `remove` is called (not later, because the row has left the list by the time Undo is pressed) and the Undo uses it.

**Undo, bookmark was at the top level (`folder_id` null).** Exactly as today: one call, `restoreBookmark(id)`. On success refresh and show the success toast "Restored to the top level.". No `updateBookmark` call.

**Undo, bookmark was in a folder.** In order:

1. `restoreBookmark(id)`.
   - It fails: exactly as today. Refresh (when the failure says so) and show the error toast "Couldn't undo. It may have been changed elsewhere." (this covers `404`, `409 bookmark_not_in_trash`, `429`, and a network failure; a `401` keeps its "You're logged out." toast with the "Log in" action, as `toastFailure` does today). Make no second call: after a `409` the bookmark is already live and the user or another device may have placed it, so it is left alone.
   - It succeeds: go to step 2.
2. `updateBookmark(id, { folder_id })` with the remembered folder id, nothing else in the body.
   - It succeeds: refresh and show the success toast "Restored to its folder." (no folder name: the row only knows the id).
   - It fails with `401`: refresh and show the signed-out toast with its "Log in" action, as every other signed-out failure does (`toastFailure`).
   - It fails with anything else (`404` because the folder was deleted meanwhile, `409 bookmark_in_trash`, `429`, `422`, a network failure): refresh and show the neutral toast "Restored to the top level. Couldn't move it back to its folder.". The bookmark is restored and sits at the top level; the user can move it by hand.

Refresh means what every bookmark change does today (`useBookmarkFeedback().refresh`: every list, the bookmark page's query, the folder list). It runs once per Undo, after the last call has answered, not after each call. Nothing is optimistic and nothing is written to the cache by hand.

One Undo makes at most one `restoreBookmark` and at most one `updateBookmark`. The toast closes when its action is pressed (`Toast`), so a second press is not expected; do not add other guards.

Messages, in one place:

| Case | Text | Tone |
|---|---|---|
| Top level, restored | `Restored to the top level.` | success |
| In a folder, restored and moved back | `Restored to its folder.` | success |
| In a folder, restored, move back failed (not `401`) | `Restored to the top level. Couldn't move it back to its folder.` | neutral |
| Restore failed | `Couldn't undo. It may have been changed elsewhere.` | error |
| Any `401` | `You're logged out.` with the "Log in" action | error |

### Known gaps

- **Two writes.** Between the restore and the move back, the bookmark is live at the top level, and another device's poll can see it there; after the move back it is in its folder. Both increment the sync counter. A real undo in one call would need the server to change (FR-19, the contract); the user chose not to.
- **A folder that was renamed or moved meanwhile** is still the same folder (same id), so the bookmark goes back to it. Only a deleted folder fails, and that falls back to the top level with the neutral toast.
- **Whether the bookmark's folder at delete time is current.** The row shows what the last list refresh said. If another device moved the bookmark just before the delete and the list had not refreshed yet, the undo returns it to the older folder. Not handled.
- **One message for every move-back failure.** A `429` does not show its `Retry-After` hint, and a `404` that means the bookmark itself is gone, or a `409` after a second delete elsewhere, gets the same text as a deleted folder. The refresh shows the true state; the cases are rare.
- The bookmark page's Delete still has no Undo (out of scope above).

## Structure

By `ARCHITECTURE.md` and `CONVENTIONS.md`; no new files are needed.

- `lib/bookmarks/useDeleteBookmark.ts`: the options object gains `folderId`, the bookmark's `folder_id` at the time `remove` runs (`string | null`). `BookmarkRow` passes `bookmark.folder_id`. `BookmarkView` still passes `{ undo: false }` and needs no change if `folderId` is optional and ignored when `undo` is false; if the types force a change to `BookmarkView`, make the smallest one (an explicit `folderId: null`) and say so in your report.
- The undo sequence stays inside `useDeleteBookmark`, written as one small named function so the two outcomes are readable. Reuse `restoreBookmark` and `updateBookmark` from `lib/api/bookmarks`, `useBookmarkFeedback` (`refresh`, `toastFailure`, `toast`), and `UNDO_FAILED`. Do not add a second hook, and do not call `useMoveBookmark` (it shows the move toast "Moved to …" and belongs to the dialog).
- Add the two new texts as exported constants next to `UNDO_FAILED`, so tests and the component share them.
- The refresh must run exactly once per Undo. `toastFailure` already refreshes by itself (a `401` answers `refresh: true`). So on a step-2 `401` call `toastFailure` and do **not** call `refresh()` again; on every other step-2 failure show the neutral toast directly and call `refresh()` once. A step-2 failure never refreshes twice.
- `remove` stays argument-less. `folderId` is a hook option, listed in the `useCallback` deps like `id` and `undo`. At the top of `remove`, copy it into a local constant and let the Undo closure read that constant, never the option itself, so the Undo uses the folder of the render whose `remove` was called, even if the hook re-renders with another `folderId` before Undo is pressed.
- For the step-2 `401`, call `toastFailure(error, 'move', …)` (the action only picks generic wording, and a `401` ignores it).

## Dependencies

None. Nothing is added to `package.json`.

## Acceptance criteria

All tests mock `lib/api/bookmarks` (no network). The existing tests in `useDeleteBookmark.test.tsx` and `BookmarkRow.test.tsx` keep passing. `useDeleteBookmark.test.tsx` mocks only `deleteBookmark` and `restoreBookmark` today: add `updateBookmark` to that mock and reset it in `beforeEach`. `BookmarkRow.test.tsx` already mocks `updateBookmark`, and its default row has `folder_id: null`, so its existing Undo tests stay on the top-level path.

A tone is checked on the toast's root: `screen.getByText(text).closest('.toast')` has the class `toast--success`, `toast--neutral` or `toast--error` (as `Toast.test.tsx` does). Every toast text in the table under Behavior is asserted together with its tone, including "Couldn't undo. It may have been changed elsewhere." (error).

**`useDeleteBookmark` (hook test)**

- With `undo: true` and `folderId: null`, Undo calls `restoreBookmark('b-1')` once, never calls `updateBookmark`, refreshes once (the three keys `['bookmark-list']`, `['bookmark','b-1']`, `['folders']`) and shows "Restored to the top level." (success).
- With `folderId: 'f-1'`, Undo calls `restoreBookmark('b-1')`, then `updateBookmark('b-1', { folder_id: 'f-1' })` (the body is exactly that, nothing else), in that order, refreshes once after both, and shows "Restored to its folder." (success). It does not show "Restored to the top level.".
- The folder id used is the one of the render whose `remove` was called: call `remove` from the first render's result, re-render with another `folderId`, press Undo, and `updateBookmark` still gets the first one.
- Restore fails, in a folder: for each of `404`, `409 bookmark_not_in_trash`, `429` and a network error, `updateBookmark` is never called and the toast is "Couldn't undo. It may have been changed elsewhere.". A `401` shows "You're logged out." with a "Log in" action.
- Restore succeeds and the move back fails, in a folder: for each of `404 not_found`, `409 bookmark_in_trash`, `429` and a network error, the toast is "Restored to the top level. Couldn't move it back to its folder." (neutral, not the error tone), and the lists are refreshed exactly once. A `401` on the move back shows "You're logged out." with a "Log in" action and refreshes once, and does not show the neutral text.
- `undo: false` still shows no Undo action, whatever `folderId` is.

**`BookmarkRow` (component test)**

- A row whose bookmark has `folder_id: 'f-1'`: delete, press Undo, and `updateBookmark` is called with `('b-1', { folder_id: 'f-1' })` after `restoreBookmark`; the text "Restored to its folder." appears.
- A row whose bookmark has `folder_id: null`: delete, press Undo, `updateBookmark` is not called; "Restored to the top level." appears. (This is the existing test; keep it and check it still passes.)
- A row in a folder, Undo, `updateBookmark` rejected with `404`: the neutral text appears.

**Unchanged behavior, still pinned by the existing tests**

- The trash row's Restore still calls `restoreBookmark` only, and says "Restored to the top level.".
- The bookmark page's Delete shows "Moved to trash." and no Undo.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

- Read the diff: `useDeleteBookmark` is the only place that makes the second call; `useRestoreBookmark`, `TrashRow`, `describeFailure` and `BookmarkView` behave as before (a `BookmarkView` change, if any, is only an explicit `folderId`).
- The remembered folder id is captured when `remove` runs, not read when Undo is pressed (look for the closure; the test with a re-render pins it).
- `refresh` runs once per Undo on every path, including both failures of step 2. Check that `toastFailure` is not used for a step-2 failure other than `401` (it would refresh a second time).
- The body of the second call is exactly `{ folder_id: <id> }`.
- Confirm the tests discriminate: in a scratch copy, (a) make Undo skip the `updateBookmark` call, (b) send `folder_id: null` in it, (c) call `updateBookmark` also when the restore failed, (d) show the success text when the move back failed; each must turn a test red. Revert them.
- Inputs to try to break it: delete from a folder and press Undo after the folder was deleted in another tab (`404` on the second call); press Undo twice quickly (accepted result: the toast closes on the first press, so a second press is not expected; if one gets through, it hits `409 bookmark_not_in_trash` and shows "Couldn't undo. It may have been changed elsewhere."); delete two bookmarks from the same folder and undo both (two toasts, two separate sequences); delete from a folder-scoped search result and Undo; delete at the top level and Undo; a `429` on the second call with and without `Retry-After`; Undo when the session has expired (`401` on the first and on the second call); unmount the toast provider while the second call is in flight (checked by reading the code, no test is required: the expected result is no thrown error and no unhandled rejection; a toast that cannot be shown is simply not shown).

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, or an edit to a spec file (for example if `updateBookmark` rejects `folder_id` for a bookmark that was just restored).
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `npm ci` in `frontend/` first on a fresh checkout, run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), the known gaps, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle, and whether `BookmarkView` needed a change. Run each test file that uses timers or navigation several times before ticking it, so a flaky test is found by you rather than by the verifier.
