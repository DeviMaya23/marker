# Verification report: undo-restores-folder

Verifier branch: `claude/verify-undo-restores-folder-vyn330` (the builder's branch `claude/undo-restores-folder-xsoyl2` at `766d912`, plus this report).

**Result: no Blocking findings.** `make check` passed (exit 0; vitest 72 files, 916 tests). Integration tests: **not run**, because the task touches no `backend/` file (`git diff` against the parent shows no change under `backend/`, `go.mod`, `go.sum`, `openapi.yaml` or `docs/requirements.md`).

## Criteria

Test files: `H` = `frontend/src/lib/bookmarks/useDeleteBookmark.test.tsx`, `R` = `frontend/src/features/bookmark-list/components/BookmarkRow.test.tsx`.

| # | Criterion | Test | Discriminates? | Status |
|---|---|---|---|---|
| 1 | `folderId: null`: one `restoreBookmark`, no `updateBookmark`, one refresh (3 keys), "Restored to the top level." success | H "Undo restores, refreshes and says so" | Yes: asserts `update` not called, tone, exact key list | Met (FR-14, FR-19) |
| 2 | `folderId: 'f-1'`: restore then `updateBookmark('b-1', {folder_id:'f-1'})` in order, one refresh, "Restored to its folder." success, no top-level text | H "restores, then moves it back with a body of folder_id alone…" | Yes: mutations (a) and (b) turn it red | Met (FR-14) |
| 3 | Folder id is the one of the render whose `remove` ran | H "uses the folder of the render whose remove was called" | Partly: `remove` is taken from the first render, and any JS closure over `folderId` gives `f-1` too, so the test would also pass without the local constant. It does catch a ref or "latest value" implementation. The code does copy it into `folderAtDelete`. | Met |
| 4 | Restore fails in a folder (404, 409 not_in_trash, 429, network): no `updateBookmark`, UNDO_FAILED in error tone; 401: "You're logged out." + "Log in" | H `it.each` "restore fails with %s…" and "restore fails with 401…" | Yes: mutation (c) turns them red | Met |
| 5 | Move back fails (404, 409 in_trash, 429, network): neutral toast, one refresh; 401: logged-out + Log in, one refresh, no neutral text | H `it.each` "move back fails with %s…" and "move back fails with 401…" | Yes: mutations (a), (d), (e) turn them red; tone and key list asserted | Met |
| 6 | `undo: false` shows no Undo, whatever `folderId` | H "with undo: false there is no Undo, whatever the folder" | Yes, as far as a hook-level test can | Met |
| 7 | Row in folder: `updateBookmark('b-1', {folder_id:'f-1'})` after restore; "Restored to its folder." | R "Undo of a bookmark that was in a folder restores it, then moves it back" | Yes (mutations a, b) | Met |
| 8 | Row at top level: no `updateBookmark`; "Restored to the top level." | R "Undo of a top-level bookmark does not call updateBookmark" (plus the existing test) | Yes | Met |
| 9 | Row in folder, `updateBookmark` 404: neutral text | R "Undo in a folder whose move back fails with 404…" | Text only (the task asks for text only); mutation (d) turns it red | Met |
| 10 | Trash row Restore unchanged | `TrashRow.test.tsx` line 48 (existing); `TrashRow`/`useRestoreBookmark` not in the diff | Existing test | Met |
| 11 | Bookmark page Delete: "Moved to trash.", no Undo | `BookmarkView.test.tsx` (existing); `BookmarkView` not in the diff | Existing test | Met |
| 12 | Every toast text in the table is asserted with its tone | H: success (top, folder), neutral, error (UNDO_FAILED). The 401 toast has no tone assertion, and the task's table gives "error" for it. | Minor gap, see Non-blocking 1 | Met |
| 13 | `make check` passes | Run by me | n/a | Met |
| 14 | Nothing outside allowed paths changed | Diff: 2 source files, 2 test files, the plan | n/a | Met |

## Plan check

I read the plan only after judging the code against the task file.

- Every task-file criterion appears in the plan. Nothing is missing.
- Each ticked item names a test that exists and checks the behavior (see the table).
- The plan matches the diff. Its judgment calls (an `instanceof ApiError && status === 401` test for the step-2 401, `folderId` optional and defaulting to `null` so `BookmarkView` needed no change, `undoDelete` as a `useCallback` in the same hook) are all what the diff does.
- The plan's "integration tests: not run, task does not touch `backend/`" is correct.
- One small difference: the task says "a small named function"; `undoDelete` is a `useCallback` inside the hook. This matches the spirit and is Non-blocking.

## Rule checks

- Only `handler/` imports `internal/api`: not applicable, no Go change.
- Repository queries filter by `user_id`, and `users.version` is incremented in every write transaction: not applicable, no backend change.
- `go.mod` (go/toolchain lines), `go.sum`, `package.json` and `package-lock.json`: unchanged. No dependency added.
- `useDeleteBookmark` is the only place that makes the second call. `useRestoreBookmark`, `TrashRow`, `describeFailure` and `BookmarkView` are untouched; `BookmarkView` needed no change.
- The folder id is captured when `remove` runs (`const folderAtDelete = folderId`), and the Undo closure passes that constant, not the option.
- `refresh` runs once per Undo on every path:
  - top level: one direct `refresh()`;
  - moved back: one;
  - non-401 move-back failure: one direct `refresh()`;
  - 401 move-back failure: `toastFailure` refreshes by itself and there is no second call. Mutation (e) (extra `refresh()` there) turns the 401 test red.
  - Restore failure: `toastFailure` as before.
- The second call's body is exactly `{ folder_id: folder }`. Mutation (b) turns tests red.
- `toastFailure` is used for step 2 only on a 401.
- Mutation checks on a scratch edit of the source, each reverted (`git status` clean afterwards):
  - (a) the move back not awaited and its result ignored: 9 tests red. This is a stand-in for "skip the call", not an exact skip.
  - (b) `folder_id: null` sent: 3 red.
  - (c) `updateBookmark` also called after a failed restore: 5 red.
  - (d) success text shown when the move back failed: 5 red.
  - (e) extra `refresh()` on the 401: 1 red.

## Integration tests

Not run: the task changes only `frontend/` and a doc, so `make test-integration-local` does not apply. No criterion depends only on integration tests. The plan's tick is consistent with this.

## Findings

### Blocking

None.

### Non-blocking

1. The 401-on-restore and 401-on-move-back tests check the message and the "Log in" button but not the `toast--error` tone. The task's table says error; the tone comes from `toastFailure`'s unchanged code path.
2. The restore-failure tests in a folder do not check the refresh count (the existing top-level test does). The code calls `toastFailure` exactly as before.
3. The re-render test (criterion 3) cannot tell the local constant from reading the option directly (see the table). The code is correct.
4. Cases checked by reading, with no test, as the task allows:
   - Two deletes from the same folder give two independent `undoDelete` calls with their own captured folder.
   - Undo after the provider unmounts: `toast.show` and the invalidations are not awaited in a way that can throw, and a `restoreBookmark` or `updateBookmark` rejection is always caught (`void undoDelete(...)` never rejects). I found no unhandled-rejection path.
   - A second Undo press hits `409 bookmark_not_in_trash` and shows UNDO_FAILED, as the task expects.
   - A `429` on the move back, with or without `Retry-After`, gets the neutral text (task's Known gaps).
   - Folder deleted in another tab: `404` on the second call gives the neutral toast.
