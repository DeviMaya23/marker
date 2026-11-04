# Plan: undo-restores-folder

Branch: `claude/undo-restores-folder-xsoyl2`

Files: hook `frontend/src/lib/bookmarks/useDeleteBookmark.ts` (test `useDeleteBookmark.test.tsx`);
row `frontend/src/features/bookmark-list/components/BookmarkRow.tsx` (test `BookmarkRow.test.tsx`).

## `useDeleteBookmark` (hook test)

- [x] `folderId: null`: Undo calls `restoreBookmark` once, no `updateBookmark`, refreshes once (3 keys), "Restored to the top level." success. — `useDeleteBookmark.test.tsx`, "Undo restores, refreshes and says so" (extended with tone and no-update checks)
- [x] `folderId: 'f-1'`: restore then `updateBookmark('b-1', { folder_id: 'f-1' })`, in order, one refresh after both, "Restored to its folder." success, not the top-level text. — `useDeleteBookmark.test.tsx`
- [x] Folder id is the one of the render whose `remove` ran (re-render with another `folderId`). — `useDeleteBookmark.test.tsx`
- [x] Restore fails in a folder (404, 409 not_in_trash, 429, network): no `updateBookmark`, "Couldn't undo…" error tone; 401 shows "You're logged out." + "Log in". — `useDeleteBookmark.test.tsx`
- [x] Restore ok, move back fails (404, 409 in_trash, 429, network): neutral toast, one refresh; 401: logged-out toast + Log in, one refresh, no neutral text. — `useDeleteBookmark.test.tsx`
- [x] `undo: false` shows no Undo whatever `folderId` is. — `useDeleteBookmark.test.tsx`

## `BookmarkRow` (component test)

- [x] Row with `folder_id: 'f-1'`: Undo calls `updateBookmark('b-1', { folder_id: 'f-1' })` after restore; "Restored to its folder." — `BookmarkRow.test.tsx`
- [x] Row with `folder_id: null`: no `updateBookmark`; "Restored to the top level." — existing test in `BookmarkRow.test.tsx`
- [x] Row in a folder, `updateBookmark` rejected 404: neutral text. — `BookmarkRow.test.tsx`

## Unchanged

- [x] Trash row Restore and bookmark page Delete behaviour — existing tests (`TrashRow`, `BookmarkView`) still pass.

## Repo-wide

- [x] `make check` passes.
- [x] Nothing outside allowed paths changed.
- [x] `make test-integration-local`: not run: task does not touch `backend/`.
- [x] The two test files ran 3 times in a row: 44 passed each time.

## Judgment calls

- Step-2 `401` is detected with `error instanceof ApiError && error.status === 401` in the hook, then `toastFailure(error, 'move')` (which refreshes itself). Every other move-back failure shows the neutral toast and calls `refresh()` once.
- `folderId` is optional and defaults to `null`, so `BookmarkView` needed no change.
- The Undo sequence is a small `useCallback` (`undoDelete`) in the same hook; `remove` passes it the folder it captured.
- `make check` was run twice: the first run's output was truncated by `tail`, so I reran it and it exited 0.
