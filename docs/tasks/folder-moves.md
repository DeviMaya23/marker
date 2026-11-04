# Task: moving bookmarks and folders, and choosing a folder when saving (front end, part B)

> Trial slice, front end. One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> This is part B of the folder front end. Part A (`folder-sidebar`, merged) built the sidebar, the folder tree, create, rename and delete, and the folder pages. Use what it left: `lib/folders/` (`useFolders`, `buildFolderTree`, `useFolderMutation`, `folderFailureMessage`, `FOLDERS_KEY`), the `Dialog`, `Menu` and `Toast` wrappers, `useBookmarkFeedback`, `describeFailure`.

## Goal

A signed-in user can move a bookmark to another folder or to the top level, move a folder (with everything in it) under another folder or to the top level, see which folder a bookmark is in, and pick a folder when saving from the bookmarklet popup. The sidebar's bookmark counts stay right after bookmark changes.

The server side is done and **is not available to you**: every test mocks the API wrappers. The user connects the two afterwards.

Requirements covered: FR-14 (a bookmark is in one folder or at the top, and the page says which), FR-15 (move a bookmark or a folder with its contents; moves are not undoable, and the dialog says so), FR-13 (an invalid target is not offered; a depth failure from the server is still shown), FR-26 (a name conflict on a folder move is shown), FR-1 (a bookmark saved from the popup goes to the chosen folder), NFR-7 (a folder that is gone is reported, not crashed on).

Out of scope, and why:

- The mobile drawer: its own later task. Below 768px the sidebar stays stacked.
- Drag and drop: the "Move to…" dialog is the only way to move.
- Search and the top bar controls, the sync poll, the account area, the login screen.
- Undo for moves (FR-15: not undoable). The Undo toast of a bookmark delete still restores to the top level; that known gap from `bookmark-actions` is unchanged.
- Moving a bookmark that is in the trash (read-only; Restore goes to the top level).

## The design

Read, in `docs/design/ui-reference/` (read-only reference, not code to copy): `ui-design-brief.md` (screens 2, 3, 5, and the moves section), `DECISIONS.md`, and in `src/`: `components/{MoveDialog,BookmarkRow,FolderTree}.tsx`, `pages/BookmarkDetailPage.tsx`, `styles/*.css`.

Same rules as the previous slices: reproduce the look and behaviour with your own code in this repo's stack. Do not copy any `.tsx` or `.ts` file; copy only the CSS rules these pieces use (`move-picker*` and what the new pieces need) into `frontend/src/styles/`, keeping the class names. Do not use `@headlessui/react`, the reference's mock API, hooks, router or `react-icons`; icons come from `lucide-react`. Where this file and the reference disagree, this file wins; say so in your report. Known departures: the picker uses Base UI's radio group instead of Headless UI's; the dialog's footer goes through `Dialog`'s `footer` prop (do not put the footer inside the dialog body: that is the open bug noted in the backlog for the edit dialog); the save popup uses a select instead of the reference's static field.

## Role and ownership

Role: Frontend (see `AGENTS.md`).

You may change `frontend/**` except `package.json`, `package-lock.json`, `README.md` and any stylelint configuration. You may not change `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/folder-moves.plan.md`, see `AGENTS.md`), the Makefile, or `frontend/src/lib/api/schema.d.ts` (generated).

**Shared files.** One other task, `css-lint`, runs at the same time. It changes only `frontend/package.json`, the lockfile, a new stylelint config file, a test under `frontend/src/styles/`, `frontend/README.md` and the Makefile. You change none of those. You do change shared styles (`styles/*.css`) and the shared test helpers; `css-lint` does not touch them.

## Operations used

Both are implemented on the server; mock them in every test.

- `updateBookmark` (`PATCH /api/v1/bookmarks/{id}`): this task sends `folder_id` alone. A folder id moves it; an explicit `null` moves it to the top level; an absent key means unchanged. Response `BookmarkSummary`.
- `updateFolder` (`PATCH /api/v1/folders/{id}`): this task sends `parent_id` alone. A folder id moves it under that folder; an explicit `null` moves it to the top level. Response `Folder`.
- `createBookmark` (existing): `folder_id` in the body saves into that folder; absent means the top level.
- `listFolders` (existing): what every picker reads.

Take the types from `src/lib/api/schema.d.ts`; write no second copy. What the server answers (mock exactly this): `404 not_found` for an unknown or someone else's bookmark, folder or target; `409 bookmark_in_trash` (moving a trashed bookmark); `409 folder_name_conflict` (a folder with that name already sits at the target); `422 folder_depth_exceeded`; `422 folder_cycle` (into itself or its own subtree); `401`; `429` with `Retry-After`. A move to the place it already is is not an error and returns the item unchanged.

## Behavior

### API wrappers

- `updateBookmark(id, changes)`: `BookmarkChanges` gains `folder_id?: string | null`. An absent key is not sent; `null` is sent as an explicit `null` (the top level). The edit dialog never passes it, so its requests are unchanged.
- `updateFolder(id, changes)`: `changes` becomes `{ name?: string; parentId?: string | null }`. An absent key is not sent; `parentId: null` is sent as `parent_id: null`; rename keeps sending only `name`. Update its comment, which says this slice never moves a folder.
- Each change gets a small test on the exact body, including `null`, and that the other key is absent.

### Which targets are valid (pure, in `lib/folders/`)

One function takes the folder tree and, optionally, the folder being moved, and returns the picker's rows in display order (depth-first, siblings in the server's order): each row has the folder, its indentation level, and whether it is disabled.

- Moving a **bookmark**: no row is disabled.
- Moving a **folder**: a row is disabled when it is the folder itself or one of its descendants, or when `row depth + height of the moved subtree > 3`. The height counts the moved folder as 1. The current parent is a valid row (choosing it is the same as no change; the dialog handles that).
- "Top level" is not a row of this function; the dialog always offers it first, enabled.
- Table-driven test: a bookmark with an empty tree, a flat tree and a 3-level tree; a folder with no children moved among depth 1, 2 and 3 rows; a folder with a one-level subtree (cannot go under a depth-3 folder, can go under depth 2); a folder with a two-level subtree (cannot go under depth 2 or 3, can go under depth 1); itself and its grandchild disabled; an orphan; server order kept.

### The move dialog

One presentational dialog in `components/ui/`, built on the shared `Dialog` and Base UI's radio group, used for both a bookmark and a folder. It is told what is moving, the current location, the folder list (with its loading and failure states), whether a move is in flight, a failure to show, and what to do on confirm.

- Title "Move bookmark" or "Move folder". Under it, the item's name on one line (the bookmark's title, or its host name when the title is empty; the folder's name; cut with an ellipsis, the full text in `title`), then the line "Moves can't be undone."
- The list is a radio group (`role="radiogroup"`, options `role="radio"`) inside a scroll area with a maximum height: first "Top level", then the folder rows, indented one step per level, a folder icon and the name (one line, full name in `title`). The current location is selected when the dialog opens. A disabled row (folder moves only) is not selectable, is skipped by the arrow keys, and carries the `title` "Can't move here: it is inside this folder, or folders would be nested more than 3 levels deep."
- Footer, through `Dialog`'s `footer`: Cancel and "Move". "Move" is disabled while the selected target is the current location, while the folder list is loading or failed, and while working; while working it reads "Moving…". Enter does not confirm (the radio group owns the keys). Esc, Cancel and the backdrop close the dialog unless it is working.
- While the folders load: the list area shows "Loading folders…". When loading failed: "Couldn't load your folders." with a "Try again" button (refetch), and "Move" stays disabled. On a `401` while loading: the signed-out message in place of the list.
- Confirming moves with the selected id (`null` for "Top level"). Success: the dialog closes (refresh and toast below). Failure: the dialog stays open, shows the message from the table in a banner with `role="alert"` above the list, and keeps the selection.
- Opening the dialog again starts from the current location, not from an earlier selection.
- If the folder the user is moving, or the current location, is no longer in the refreshed list, the dialog does not crash: the selection falls back to "Top level" and "Move" is enabled only if that differs from the current location.

Two connected pieces in `components/ui/` wire it up so features only render them: `MoveBookmarkDialog` (takes the bookmark's id, title, url and `folder_id`) and `MoveFolderDialog` (takes the folder). Each reads `useFolders()` and the matching move hook.

### Failure messages (pure, table-driven; every message is final wording)

| Failure | Move a bookmark | Move a folder |
|---|---|---|
| `404` | "That bookmark or folder no longer exists." | "That folder no longer exists." |
| `409 bookmark_in_trash` | "This bookmark is in the trash and can't be moved." | n/a |
| `409 folder_name_conflict` | n/a | "A folder with this name already exists there." |
| `422 folder_depth_exceeded` | n/a | "Folders can only be nested 3 levels deep." |
| `422 folder_cycle` | n/a | "A folder can't be moved into itself or one of its own subfolders." |
| `401` | the signed-out message | the signed-out message |
| `429` | "Too many requests. Try again in about N seconds." when `retryAfter` is a number of seconds, otherwise "Too many requests. Try again in a moment." | same |
| anything else, including a network failure | "Couldn't move the bookmark." | "Couldn't move the folder." |

Add the bookmark column to `describeFailure` as a new action `move`, and the folder column to `folderFailureMessage` as a new action `move`; for a folder move all of its messages show in the dialog's banner (kind `dialog`), none under a field. In every case except `409 folder_name_conflict` and `422`, the screen also refreshes (nothing changed on the server in those two).

### Refreshing, and the sidebar counts

There is no sync poll. After a successful move, and after a `404` or `409 bookmark_in_trash` on a move, refresh: for a **bookmark** move, every list (the `bookmark-list` prefix), the bookmark page's `['bookmark', id]` and the folder list `['folders']` (the counts changed); for a **folder** move, the folder list and every list (the existing folder refresh). Nothing is updated by hand, nothing is optimistic.

**A fix that belongs here:** the sidebar's counts are stale today after a bookmark is saved, deleted, restored or the trash is emptied, because those only refresh the lists. Make `useBookmarkFeedback.refresh` also invalidate `['folders']`, and make `AddUrlForm` do the same after a successful save. Add a test to each affected hook or component that shows the folder list being invalidated.

### Success messages

A success toast: "Moved to “<folder name>”." for a bookmark moved into a folder, "Moved to the top level." at the top; "Folder moved to “<folder name>”." or "Folder moved to the top level." for a folder. The name is the target's name at the moment the user confirmed.

### Where "Move to…" appears

- **A live bookmark's row menu** (`bookmark-list`): items in this order: "Open original link", "Edit title & note", "Move to…", "Delete". "Move to…" opens `MoveBookmarkDialog`. A trashed bookmark's row has no such item (the trash row is unchanged).
- **The bookmark page** (`bookmark-detail`): the facts row gains a "Folder" fact. It shows the folder's name from `useFolders()` (text, never HTML), "Top level" for a bookmark at the top, a quiet placeholder while the folders are loading, and "Unknown folder" when the folder list failed or the id is not in it. Next to it a "Move" button (small, secondary) opens `MoveBookmarkDialog`. For a **trashed** bookmark the Folder fact and the button are not shown (the schema says the folder is not meaningful in the trash). Everything else on the page is unchanged. A `401` or `404` from the move replaces the page the same way loading it would.
- **A folder's row menu** (`folder-sidebar`): items in this order: "New subfolder", "Rename", "Move to…", "Delete". "Move to…" opens `MoveFolderDialog`. After a successful move the user stays where they are; the tree changes after the refresh (the moved folder's expanded or collapsed state is not carried, see known gaps).

### The save popup's folder choice

In `features/save/`, the disabled select in the popup becomes a real folder choice built on a new Base UI select wrapper in `components/ui/`.

- The "Folder" field keeps its label and `id="save-folder"`. The first option is "Top level" (the default), then every folder in the server's order, indented one step per level (indentation in the list; the closed control shows just the name). Names render as text.
- While the folders load: the control is disabled and reads "Loading…"; Save is not blocked and saves to the top level. When loading failed (any failure, including a `401`): the control is disabled and reads "Top level", and under it "Couldn't load your folders. It will be saved to the top level." with a "Try again" button that refetches. A later success makes the control usable again.
- Saving sends `folder_id` only when a folder is chosen; at "Top level" the key is absent. Everything else about the popup's request (title only when not empty after trimming) is unchanged.
- `createBookmark` can now answer `404` (the chosen folder was deleted meanwhile). `describeSaveFailure` maps `404` to "That folder no longer exists." (kind `error`); the popup's alert shows it, dismissing returns to the form, and the folder list is refetched so the choice is current. The selection resets to "Top level" if the chosen folder is gone from the refreshed list. The add field on the pages uses the same function and shows the same message.
- Keys: while the folder select's list is open, Enter and Esc belong to the select (they choose an option and close the list); the popup's window-level handlers must not save or close the window because of them. Enter on the select's closed control opens it and does not save. Enter and Esc elsewhere work as before.

### Known gaps

- A folder's expanded or collapsed state in the sidebar is not carried across a move: the moved folder follows its new parent's state.
- Undo of a bookmark delete restores to the top level, as the server's restore does (unchanged, from `bookmark-actions`); a bookmark deleted from a folder loses that folder.
- No drag and drop, and no mobile drawer.
- The popup does not remember the last folder used.
- The server is mocked; nothing here is checked against real data.

## Structure

Follow `ARCHITECTURE.md`: features never import each other; what two features use is shared (`components/ui/`, `lib/`).

- `lib/api/`: the two wrapper changes. `lib/folders/`: the valid-targets function, `useMoveFolder` (built on `useFolderMutation`, with the new `move` action and its toast), the `move` messages. `lib/bookmarks/`: `useMoveBookmark(id)` (like `useEditBookmark`, with its own toast; it resolves true on success), the `move` action in `describeFailure`, the `useBookmarkFeedback` refresh change.
- `components/ui/`: the presentational move dialog, `MoveBookmarkDialog`, `MoveFolderDialog`, and the select wrapper. These three are used by more than one feature (or are base wrappers), so they live here.
- `features/bookmark-list/` (row item), `features/bookmark-detail/` (fact and button), `features/folder-sidebar/` (menu item, dialog state in the section that already holds its dialogs), `features/save/` (the folder choice, its component stays in the feature because only the popup uses it).
- One hook per concern with a colocated test, written with it. Pages stay thin.

## Dependencies

None. Base UI is installed and `STACK.md` allows its radio group and select; use the current installed version. If the installed `@base-ui/react` has no radio group or no select, stop and ask. `package.json` and `package-lock.json` must not change.

## Acceptance criteria

All of these must have a test, run by `npm test`. Use Vitest and Testing Library, mock the API wrappers with value-return spies, use fake timers where time matters, and build a `QueryClient` with `retry: false` in tests.

**API wrappers**
- `updateBookmark` sends `folder_id` as a string, as an explicit `null`, and not at all when absent; `title` and `note` are unaffected. `updateFolder` sends `parent_id` as a string, as an explicit `null`, and not at all; a rename sends only `name`.

**Valid targets and messages (pure, table-driven)**
- Every case listed under "Which targets are valid". Every cell of the failure table, for both columns, including `retryAfter` of a number, zero and null, a `409` that is not `bookmark_in_trash` or `folder_name_conflict`, and a network failure (not an `ApiError`).

**Move dialog**
- Opens with the current location selected; "Move" is disabled until another target is selected; "Top level" sends `null`; a folder sends its id.
- For a folder move, the disabled rows are not selectable and are skipped by Up and Down; their `title` is the text above. For a bookmark move none are disabled.
- Loading text, the failed state with a working "Try again" (and "Move" disabled), the `401` signed-out message.
- Esc, Cancel and the backdrop close it; while working they do nothing, everything is disabled and the button reads "Moving…"; a second confirm sends nothing more.
- Each failure of its column shows the message in a `role="alert"` banner, keeps the dialog open and keeps the selection; a `401` shows the signed-out message.
- Reopening starts from the current location; if the current location or the moved folder disappears from the list, no crash and the selection is "Top level".

**Move hooks and refreshing**
- A bookmark move sends once, then invalidates the lists, the bookmark page query and the folder list, and shows "Moved to “X”." or "Moved to the top level."; a folder move invalidates the folder list and the lists and shows its toast. A `409 folder_name_conflict` and a `422` do not refresh; a `404` does.
- `useBookmarkFeedback.refresh` invalidates the folder list; the delete, restore, empty-trash and edit hooks still pass their tests, with this extra invalidation asserted for delete and restore. `AddUrlForm` invalidates the folder list after a successful save and not after a failed one.

**Where it appears**
- The row menu holds "Open original link", "Edit title & note", "Move to…", "Delete", in that order; "Move to…" opens the dialog for that bookmark; a trashed row has no menu item.
- The bookmark page shows the Folder fact and "Move" for a live bookmark: the name, "Top level", the loading placeholder, and "Unknown folder" for a failed list and for an id that is not in the list. A trashed bookmark shows neither. Moving refreshes and the page shows the new folder; a `404` or `401` from the move replaces the page as loading it would.
- The folder row menu holds "New subfolder", "Rename", "Move to…", "Delete", in that order, "New subfolder" still disabled at depth 3; "Move to…" opens the dialog with that folder's own subtree and too-deep rows disabled.

**Save popup**
- Default "Top level"; choosing a folder saves with its `folder_id`; "Top level" saves without the key; the title rule is unchanged.
- Loading: the control is disabled, Save works and saves to the top level. Failed (including `401`): the message and a working "Try again"; after it succeeds the control is usable.
- A `404` on save shows "That folder no longer exists.", dismissing returns to the form with "Top level" selected and the folder list refetched. The same text shows on the add field.
- Enter and Esc while the select's list is open do not save or close the window; Enter on the closed control does not save; the existing key handling (Enter saves, Esc cancels, alerts dismissed) passes its tests unchanged.
- Folder names are rendered as text.

**Repo-wide**
- `make check` passes.
- No `any`, `@ts-ignore`, `@ts-expect-error` or `eslint-disable`.
- `package.json`, `package-lock.json`, `README.md`, the Makefile and any stylelint file are unchanged. Nothing under `backend/`, `docs/` (except the plan file) or `openapi.yaml` changed, and nothing copied from the reference except CSS.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt. The verifier cannot run a browser, so these are by reading the code and the tests:

- `package.json`, the lockfile, `README.md`, the Makefile and any stylelint file are untouched. Only files in `components/ui/` import `@base-ui/react`; icons come only from `lucide-react`; no other UI package.
- Request bodies and types come from `schema.d.ts`; no hand-written copy of `Folder`, `UpdateBookmarkRequest` or `UpdateFolderRequest`. `null` versus absent survives to the request body for both `folder_id` and `parent_id`; a rename never sends `parent_id`; the edit dialog never sends `folder_id`.
- The valid-target rule matches the server's: a folder cannot go under itself or a descendant, and `row depth + moved height > 3` is disabled. Check the arithmetic against `docs/tasks/folders-api.md` ("Depth"), not only the tests.
- No `.ts` or `.tsx` file is a copy of a reference file (compare against `docs/design/ui-reference/src`); only CSS carries over.
- No feature imports another feature. The dialog, hooks and message functions are shared, not duplicated per feature.
- No optimistic cache writes (`setQueryData`, `onMutate`), no `setInterval`; every call site handles every row of the failure table; `401` and `404` are never swallowed.
- Dialog: Esc and the backdrop are ignored while busy; focus returns to the opener; the footer goes through the `footer` prop. The radio group is Base UI's, not hand-written.
- Names (folders, bookmark titles, hosts) are rendered as text, never as HTML.
- The popup's window-level key handler ignores Enter and Esc that belong to the open select; check the condition in the code and its test.
- The sidebar count refresh: `useBookmarkFeedback.refresh` and `AddUrlForm` invalidate `['folders']`, and the folder mutations still invalidate the lists.
- Try to break it with: moving a folder into its own grandchild (disabled); moving a depth-3 chain under a depth-1 folder; moving a folder to the parent it already has; a folder list that fails and then succeeds through "Try again"; the folder being moved vanishing from a refreshed list while the dialog is open; double-clicking "Move"; Esc while moving; a move answering `409 folder_name_conflict`, `422 folder_cycle` and `404`; moving a bookmark that was trashed from another tab (`409`); a bookmark on the page whose folder is not in the list; saving from the popup into a folder deleted meanwhile; Enter pressed with the select open; a folder name of 100 characters and one with HTML in it; 30 folders in the picker.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, the design brief or this file conflict with each other.
- You think you need a change to the backend or the contract, a dependency, or another UI library, or the installed Base UI lacks a radio group or a select.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `npm ci` in `frontend/` first on a fresh checkout, run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), any place you departed from the reference design and why, the known gaps, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle. Run each test file that uses timers or navigation several times before ticking it, so a flaky test is found by you rather than by the verifier.
