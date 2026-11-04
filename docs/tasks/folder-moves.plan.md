# Plan: folder-moves (front end, part B)

Branch: `claude/folder-moves-task-kyi515`. All paths under `frontend/src/`. One item per acceptance criterion in `docs/tasks/folder-moves.md`; tick when done and tested. One test file per source file, colocated; edge cases are rows or subtests in that file.

## Findings before coding

- Stop-and-ask checks: the installed `@base-ui/react` has `radio-group`, `radio` and `select`; `schema.d.ts` is generated and is read before use; no dependency, backend or contract change is planned.
- The depth rule matches `docs/tasks/folders-api.md` ("Depth"): the deepest descendant sits at `d + h - 1` with `d = row depth + 1`, so a row is disabled when `row depth + h > 3`.

## API wrappers
- [x] `updateBookmark` sends `folder_id` as a string, as an explicit `null`, and not at all; `title` and `note` unaffected — `lib/api/bookmarks.ts`, test `lib/api/bookmarks.test.ts`
- [x] `updateFolder` sends `parent_id` as a string, as an explicit `null`, and not at all; a rename sends only `name` — `lib/api/folders.ts`, test `lib/api/folders.test.ts`

## Valid targets and messages (pure, table-driven)
- [x] Valid targets: bookmark with empty, flat and 3-level tree; folder with no children among depth 1, 2, 3; one-level subtree; two-level subtree; itself and grandchild disabled; orphan; server order kept — `lib/folders/moveTargets.ts`, test `lib/folders/moveTargets.test.ts`
- [x] Failure table, bookmark column (`move` in `describeFailure`), incl. `retryAfter` number / 0 / null, other 409, network failure — `lib/bookmarks/describeFailure.ts`, test `lib/bookmarks/describeFailure.test.ts`
- [x] Failure table, folder column (`move` in `folderFailureMessage`), same extras — `lib/folders/folderFailureMessage.ts`, test `lib/folders/folderFailureMessage.test.ts`

## Move dialog
- [x] Opens with current location selected; Move disabled until another target; "Top level" sends `null`; a folder sends its id — `components/ui/MoveDialog.tsx`, test `components/ui/MoveDialog.test.tsx`
- [x] Folder move: disabled rows not selectable, skipped by Up/Down, carry the `title`; bookmark move: none disabled — `MoveDialog.tsx`, `MoveDialog.test.tsx`
- [x] Loading text; failed state with working "Try again" and Move disabled; `401` signed-out message — `MoveDialog.tsx`, `MoveDialog.test.tsx`
- [x] Esc, Cancel and backdrop close; while working they do nothing, all disabled, "Moving…", second confirm sends nothing — `MoveDialog.tsx`, `MoveDialog.test.tsx`
- [x] Each failure of its column shows in a `role="alert"` banner, keeps dialog open and selection; `401` signed-out message — `MoveDialog.tsx`, `MoveDialog.test.tsx`
- [x] Reopening starts at the current location; vanished current location or moved folder: no crash, selection "Top level" — `MoveDialog.tsx`, `MoveDialog.test.tsx`
- [x] Connected pieces read `useFolders()` and the move hook — `components/ui/MoveBookmarkDialog.tsx`, `MoveFolderDialog.tsx`, tests `MoveBookmarkDialog.test.tsx`, `MoveFolderDialog.test.tsx`

## Move hooks and refreshing
- [x] Bookmark move: sends once; invalidates lists, `['bookmark', id]` and `['folders']`; toasts "Moved to “X”." / "Moved to the top level."; `409 bookmark_in_trash` and `404` refresh — `lib/bookmarks/useMoveBookmark.ts`, test `lib/bookmarks/useMoveBookmark.test.tsx`
- [x] Folder move: invalidates folders and lists; toast "Folder moved to …"; `409 folder_name_conflict` and `422` do not refresh, `404` does — `lib/folders/useMoveFolder.ts`, test `lib/folders/useMoveFolder.test.tsx`
- [x] `useBookmarkFeedback.refresh` invalidates `['folders']` (asserted for delete and restore; empty-trash and edit tests still pass) — `lib/bookmarks/useBookmarkFeedback.ts`, tests `useBookmarkFeedback.test.tsx`, `useDeleteBookmark.test.tsx`, `useRestoreBookmark.test.tsx`
- [x] `AddUrlForm` invalidates `['folders']` after a successful save, not after a failed one — `features/bookmark-list/components/AddUrlForm.tsx`, test `AddUrlForm.test.tsx`

## Where it appears
- [x] Bookmark row menu order "Open original link", "Edit title & note", "Move to…", "Delete"; opens the dialog; trashed row has none — `features/bookmark-list/components/BookmarkRow.tsx`, tests `BookmarkRow.test.tsx`, `TrashRow.test.tsx`
- [x] Bookmark page: Folder fact (name, "Top level", placeholder, "Unknown folder" for failed list and unknown id), "Move" button, hidden when trashed; move refreshes and shows the new folder; `404`/`401` replace the page — `features/bookmark-detail/components/BookmarkView.tsx`, test `BookmarkView.test.tsx`
- [x] Folder row menu order "New subfolder", "Rename", "Move to…", "Delete"; "New subfolder" disabled at depth 3; "Move to…" opens the dialog with subtree and too-deep rows disabled — `features/folder-sidebar/components/FolderTree.tsx`, `FolderSection.tsx`, tests `FolderTree.test.tsx`, `FolderSection.test.tsx`

## Save popup
- [x] Select wrapper — `components/ui/Select.tsx`, test `components/ui/Select.test.tsx`
- [x] Default "Top level"; a folder saves with `folder_id`; "Top level" saves without the key; title rule unchanged — `features/save/components/SavePopup.tsx`, `FolderChoice.tsx`, tests `SavePopup.test.tsx` (FolderChoice has no file of its own: it is only used by the popup and every branch is driven through it)
- [x] Loading: control disabled, Save works to top level; failed (incl. `401`): message and working "Try again", control usable afterwards — `FolderChoice.tsx`, test `SavePopup.test.tsx`
- [x] `404` on save: "That folder no longer exists."; dismiss returns to form with "Top level" and folders refetched; same text on the add field — `lib/bookmarks/saveFailure.ts`, tests `saveFailure.test.ts`, `SavePopup.test.tsx`, `AddUrlForm.test.tsx`
- [x] Enter/Esc with the list open do not save or close; Enter on the closed control does not save; existing key handling unchanged — `SavePopup.tsx`, `SavePopup.test.tsx`
- [x] Folder names rendered as text — `FolderChoice.tsx`, `MoveDialog.tsx`, `BookmarkView.tsx`; tests with HTML in a name in `SavePopup.test.tsx`, `MoveDialog.test.tsx`, `BookmarkView.test.tsx`, `Select.test.tsx`

## Repo-wide
- [x] `make check` passes; no `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`; `package.json`, lockfile, README, Makefile, stylelint config unchanged; nothing under `backend/`, `docs/` (except this file), `openapi.yaml`; no reference `.ts`/`.tsx` copied (CSS only)
- [x] Each test file that uses timers or navigation run several times

## Judgment calls

Things `docs/tasks/folder-moves.md` did not settle, and what I did.

1. **Row depth for the depth rule** uses the server's `depth` field of each row, as the server's own check does, while the indentation uses the level as drawn (an orphan is drawn at level 0 but keeps its stored depth). `moveTargets` takes the moved `Folder` object, not an id, so a folder that has just vanished from the list still works.
2. **Any `422` on a folder move does not refresh**, even one with a code the table does not list (it shows "Couldn't move the folder."). The task says "except `409 folder_name_conflict` and `422`"; the existing create/rename mapping refreshes on an unknown 422, so this differs on purpose for `move` only.
3. **The edit and empty-trash hook tests** also had exact lists of invalidated keys; I added `['folders']` to those lists (the task asked for the extra assertion on delete and restore only). The row tests that count invalidations went from 2 to 3 for the same reason.
4. **`BookmarkRow` takes an optional `onMove`** like its `onEdit`: the list owns the move dialog so a 404/409 refresh that drops the row does not take the dialog and its message with it (a test shows it). Without `onMove` the row shows its own dialog (used by the row's own tests).
5. **Selection fall-back in the move dialog:** besides the moved folder or the current location vanishing, a chosen target that is no longer selectable (gone or now disabled) also falls back to "Top level". The dialog hands `onConfirm` the folder row it knows (or `null`), so the toast uses the target's name at the moment of confirming.
6. **The saved-popup refetch after a failed save** runs on any failed save made with a folder chosen (not only a 404), because `describeSaveFailure` must keep `{ kind: 'error', message }` and the message text is not a thing to branch on. The selection itself is derived: a chosen id missing from the list reads as "Top level", so no reset effect is needed.
7. **Popup keys:** a capture-phase listener notes, before the select sees a key, whether Enter or Esc belongs to the select (its list is open, or Enter on its closed button). The existing window-level handler is unchanged apart from ignoring those keys.
8. **Select wrapper:** the closed control's text comes from `items` (just the name); `valueText` overrides it for "Loading…" and for the failed state. The list items reuse the `dropdown` CSS and add `select__*` rules.
9. **CSS:** the `move-picker*` rules are copied from the reference with the same class names; `move-dialog__*`, `select__*`, `move-picker__name` and `detail-page__fact-quiet`/`__move` are new, written for this repo.
10. **Bookmark page:** the "Move" button sits in the facts row after the Folder fact (small, secondary, with a folder icon). While the folders load a bookmark that is at the top level already reads "Top level" (no placeholder needed); only a bookmark in a folder shows the quiet "Loading…".
11. **Reference vs this file:** the reference used Headless UI for the picker and a static save field; this file's choices (Base UI radio group and select, the dialog footer through `footer`) win, as it says. The reference's picker shows the check mark with the row; I kept that.
12. **Tests for `FolderChoice`** live in `SavePopup.test.tsx` (it is used only by the popup). Radio and select tests that press options use a down/up/click sequence because Base UI ignores a bare `click` in jsdom, and click the selected radio first to put focus in the group (the dialog's focus guards take the first Tab stops).
