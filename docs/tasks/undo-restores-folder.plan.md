# Plan: undo-restores-folder

Branch: `claude/undo-restores-folder-xsoyl2`

Files: hook `frontend/src/lib/bookmarks/useDeleteBookmark.ts` (test `useDeleteBookmark.test.tsx`);
row `frontend/src/features/bookmark-list/components/BookmarkRow.tsx` (test `BookmarkRow.test.tsx`).

## `useDeleteBookmark` (hook test)

- [ ] `folderId: null`: Undo calls `restoreBookmark` once, no `updateBookmark`, refreshes once (3 keys), "Restored to the top level." success. — `useDeleteBookmark.test.tsx`, "Undo restores, refreshes and says so" (extended with tone and no-update checks)
- [ ] `folderId: 'f-1'`: restore then `updateBookmark('b-1', { folder_id: 'f-1' })`, in order, one refresh after both, "Restored to its folder." success, not the top-level text. — `useDeleteBookmark.test.tsx`
- [ ] Folder id is the one of the render whose `remove` ran (re-render with another `folderId`). — `useDeleteBookmark.test.tsx`
- [ ] Restore fails in a folder (404, 409 not_in_trash, 429, network): no `updateBookmark`, "Couldn't undo…" error tone; 401 shows "You're logged out." + "Log in". — `useDeleteBookmark.test.tsx`
- [ ] Restore ok, move back fails (404, 409 in_trash, 429, network): neutral toast, one refresh; 401: logged-out toast + Log in, one refresh, no neutral text. — `useDeleteBookmark.test.tsx`
- [ ] `undo: false` shows no Undo whatever `folderId` is. — `useDeleteBookmark.test.tsx`

## `BookmarkRow` (component test)

- [ ] Row with `folder_id: 'f-1'`: Undo calls `updateBookmark('b-1', { folder_id: 'f-1' })` after restore; "Restored to its folder." — `BookmarkRow.test.tsx`
- [ ] Row with `folder_id: null`: no `updateBookmark`; "Restored to the top level." — existing test in `BookmarkRow.test.tsx`
- [ ] Row in a folder, `updateBookmark` rejected 404: neutral text. — `BookmarkRow.test.tsx`

## Unchanged

- [ ] Trash row Restore and bookmark page Delete behaviour — existing tests (`TrashRow`, `BookmarkView`) still pass.

## Repo-wide

- [ ] `make check` passes.
- [ ] Nothing outside allowed paths changed.
- [ ] `make test-integration-local`: not run: task does not touch `backend/`.
- [ ] Timer/navigation test files run several times.

## Judgment calls

(filled in at the end)
