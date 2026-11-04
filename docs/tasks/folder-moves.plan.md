# Plan: folder-moves (front end, part B)

Branch: `claude/folder-moves-task-kyi515`. All paths under `frontend/src/`. One item per acceptance criterion in `docs/tasks/folder-moves.md`; tick when done and tested. One test file per source file, colocated; edge cases are rows or subtests in that file.

## Findings before coding

- Stop-and-ask checks: the installed `@base-ui/react` has `radio-group`, `radio` and `select`; `schema.d.ts` is generated and is read before use; no dependency, backend or contract change is planned.
- The depth rule matches `docs/tasks/folders-api.md` ("Depth"): the deepest descendant sits at `d + h - 1` with `d = row depth + 1`, so a row is disabled when `row depth + h > 3`.

## API wrappers
- [ ] `updateBookmark` sends `folder_id` as a string, as an explicit `null`, and not at all; `title` and `note` unaffected — `lib/api/bookmarks.ts`, test `lib/api/bookmarks.test.ts`
- [ ] `updateFolder` sends `parent_id` as a string, as an explicit `null`, and not at all; a rename sends only `name` — `lib/api/folders.ts`, test `lib/api/folders.test.ts`

## Valid targets and messages (pure, table-driven)
- [ ] Valid targets: bookmark with empty, flat and 3-level tree; folder with no children among depth 1, 2, 3; one-level subtree; two-level subtree; itself and grandchild disabled; orphan; server order kept — `lib/folders/moveTargets.ts`, test `lib/folders/moveTargets.test.ts`
- [ ] Failure table, bookmark column (`move` in `describeFailure`), incl. `retryAfter` number / 0 / null, other 409, network failure — `lib/bookmarks/describeFailure.ts`, test `lib/bookmarks/describeFailure.test.ts`
- [ ] Failure table, folder column (`move` in `folderFailureMessage`), same extras — `lib/folders/folderFailureMessage.ts`, test `lib/folders/folderFailureMessage.test.ts`

## Move dialog
- [ ] Opens with current location selected; Move disabled until another target; "Top level" sends `null`; a folder sends its id — `components/ui/MoveDialog.tsx`, test `components/ui/MoveDialog.test.tsx`
- [ ] Folder move: disabled rows not selectable, skipped by Up/Down, carry the `title`; bookmark move: none disabled — `MoveDialog.tsx`, `MoveDialog.test.tsx`
- [ ] Loading text; failed state with working "Try again" and Move disabled; `401` signed-out message — `MoveDialog.tsx`, `MoveDialog.test.tsx`
- [ ] Esc, Cancel and backdrop close; while working they do nothing, all disabled, "Moving…", second confirm sends nothing — `MoveDialog.tsx`, `MoveDialog.test.tsx`
- [ ] Each failure of its column shows in a `role="alert"` banner, keeps dialog open and selection; `401` signed-out message — `MoveDialog.tsx`, `MoveDialog.test.tsx`
- [ ] Reopening starts at the current location; vanished current location or moved folder: no crash, selection "Top level" — `MoveDialog.tsx`, `MoveDialog.test.tsx`
- [ ] Connected pieces read `useFolders()` and the move hook — `components/ui/MoveBookmarkDialog.tsx`, `MoveFolderDialog.tsx`, tests `MoveBookmarkDialog.test.tsx`, `MoveFolderDialog.test.tsx`

## Move hooks and refreshing
- [ ] Bookmark move: sends once; invalidates lists, `['bookmark', id]` and `['folders']`; toasts "Moved to “X”." / "Moved to the top level."; `409 bookmark_in_trash` and `404` refresh — `lib/bookmarks/useMoveBookmark.ts`, test `lib/bookmarks/useMoveBookmark.test.tsx`
- [ ] Folder move: invalidates folders and lists; toast "Folder moved to …"; `409 folder_name_conflict` and `422` do not refresh, `404` does — `lib/folders/useMoveFolder.ts`, test `lib/folders/useMoveFolder.test.tsx`
- [ ] `useBookmarkFeedback.refresh` invalidates `['folders']` (asserted for delete and restore; empty-trash and edit tests still pass) — `lib/bookmarks/useBookmarkFeedback.ts`, tests `useBookmarkFeedback.test.tsx`, `useDeleteBookmark.test.tsx`, `useRestoreBookmark.test.tsx`
- [ ] `AddUrlForm` invalidates `['folders']` after a successful save, not after a failed one — `features/bookmark-list/components/AddUrlForm.tsx`, test `AddUrlForm.test.tsx`

## Where it appears
- [ ] Bookmark row menu order "Open original link", "Edit title & note", "Move to…", "Delete"; opens the dialog; trashed row has none — `features/bookmark-list/components/BookmarkRow.tsx`, tests `BookmarkRow.test.tsx`, `TrashRow.test.tsx`
- [ ] Bookmark page: Folder fact (name, "Top level", placeholder, "Unknown folder" for failed list and unknown id), "Move" button, hidden when trashed; move refreshes and shows the new folder; `404`/`401` replace the page — `features/bookmark-detail/components/BookmarkView.tsx`, test `BookmarkView.test.tsx`
- [ ] Folder row menu order "New subfolder", "Rename", "Move to…", "Delete"; "New subfolder" disabled at depth 3; "Move to…" opens the dialog with subtree and too-deep rows disabled — `features/folder-sidebar/components/FolderTree.tsx`, `FolderSection.tsx`, tests `FolderTree.test.tsx`, `FolderSection.test.tsx`

## Save popup
- [ ] Select wrapper — `components/ui/Select.tsx`, test `components/ui/Select.test.tsx`
- [ ] Default "Top level"; a folder saves with `folder_id`; "Top level" saves without the key; title rule unchanged — `features/save/components/SavePopup.tsx`, `FolderChoice.tsx`, tests `SavePopup.test.tsx`, `FolderChoice.test.tsx`
- [ ] Loading: control disabled, Save works to top level; failed (incl. `401`): message and working "Try again", control usable afterwards — `FolderChoice.tsx`, `FolderChoice.test.tsx`, `SavePopup.test.tsx`
- [ ] `404` on save: "That folder no longer exists."; dismiss returns to form with "Top level" and folders refetched; same text on the add field — `lib/bookmarks/saveFailure.ts`, tests `saveFailure.test.ts`, `SavePopup.test.tsx`, `AddUrlForm.test.tsx`
- [ ] Enter/Esc with the list open do not save or close; Enter on the closed control does not save; existing key handling unchanged — `SavePopup.tsx`, `SavePopup.test.tsx`
- [ ] Folder names rendered as text — `FolderChoice.tsx`, `MoveDialog.tsx`, `BookmarkView.tsx`; tests with HTML in a name in `FolderChoice.test.tsx`, `MoveDialog.test.tsx`, `BookmarkView.test.tsx`

## Repo-wide
- [ ] `make check` passes; no `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`; `package.json`, lockfile, README, Makefile, stylelint config unchanged; nothing under `backend/`, `docs/` (except this file), `openapi.yaml`; no reference `.ts`/`.tsx` copied (CSS only)
- [ ] Each test file that uses timers or navigation run several times

## Judgment calls
(filled in at the end)
