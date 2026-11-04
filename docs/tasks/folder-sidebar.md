# Task: folder sidebar, folder pages and folder management (front end, part A)

> Trial slice, front end, run in parallel with the back-end slice `docs/tasks/folders-api.md`. One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> **Prerequisite:** the task `bookmark-actions` is merged. This task uses what it added: the `Dialog`, `Menu` and `Toast` wrappers in `components/ui/` (with `useToast`), the shared signed-out message and login-link builder, and the failure-message pattern in `lib/bookmarks/`. If `main` does not have them, stop and ask; do not write second copies.
>
> **Part B** (a later task) adds "Move to…" for bookmarks and folders, the folder field on the bookmark page and the folder picker in the save popup. None of that is in this task.

## Goal

A signed-in user sees their folders in a sidebar, can create, rename and delete folders (3 levels deep at most), and can open a folder to see the bookmarks in it and in its subfolders.

The server side is being built at the same time and is **not available to you**. You build and test against mocks only: every test mocks the API wrappers. The user connects the two later.

Requirements covered: FR-12 (create, view, rename folders), FR-13 (depth 3, shown by disabling "New subfolder" at depth 3), FR-16 (delete a folder; its bookmarks go to the trash, and the dialog says so), FR-26 (sibling name conflicts shown), FR-7 (the folder's bookmark list), FR-1 (a bookmark saved from a folder's page goes into that folder).

Out of scope, and why:

- **Moving** a folder or a bookmark (Part B). No "Move to…" item, no drag and drop.
- The mobile drawer (a later slice): below 768px the sidebar is simply stacked above the content, see "The layout".
- Search and the top bar controls, the sync poll, the account area, the login screen.
- Breadcrumbs and a folder's own page of details.

## The design

Read, in `docs/design/ui-reference/` (read-only reference, not code to copy): `ui-design-brief.md` (the folder and sidebar parts), `DECISIONS.md`, and in `src/`: `components/{Sidebar,FolderTree,FolderFormDialog,ConfirmDialog}.tsx`, `pages/LibraryPage.tsx`, `styles/*.css`.

Same rules as the previous slices: reproduce the look and behavior with your own code in this repo's stack. Do not copy any `.tsx` or `.ts` file; copy only the CSS rules these screens use (`sidebar*`, `folder-row*`, `app-shell*` and what the new pieces need) into `frontend/src/styles/`, keeping the class names. Do not use `@headlessui/react`, the reference's mock API, hooks, router or `react-icons`. The reference's menu styles select on Headless UI's state attributes; use the ones already restyled for Base UI. Icons come from `lucide-react`. Where this file and the reference disagree, this file wins; say so in your report. Known departures: no "Move to…" item and no drawer; the delete dialog is the plain confirmation (no typed phrase); the tree is not drag-sortable.

## Role and ownership

Role: Frontend (see `AGENTS.md`).

You may change `frontend/**`. You may not change `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/folder-sidebar.plan.md`, see `AGENTS.md`), the Makefile, or `frontend/src/lib/api/schema.d.ts` (generated).

**Shared files.** The back-end task changes only `backend/**`. No other front-end task is running. You may change `app-shell/AppShell.tsx`, the router, `pages/BookmarksPage.tsx`, the shared styles and the shared test helpers and builders (`src/test/`).

## Operations used

All are **not implemented on the server yet**; mock them in every test.

- `listFolders` (`GET /api/v1/folders`), response `{ items: Folder[] }`, a flat list ordered by lower-cased name then id. `Folder` has `id`, `name`, `parent_id` (null at the top), `depth`, `bookmark_count` (live bookmarks directly in that folder, not in its subfolders), `created_at`, `updated_at`.
- `createFolder` (`POST /api/v1/folders`), body `{ name, parent_id? }` (omit `parent_id` at the top level), response `201 Folder`.
- `updateFolder` (`PATCH /api/v1/folders/{id}`), body `{ name }` here (this task only renames; never send `parent_id`), response `200 Folder`.
- `deleteFolder` (`DELETE /api/v1/folders/{id}`), response `200 { deleted_folders, trashed_bookmarks }`.
- `listBookmarks` (existing): the new `folder_id` parameter lists the live bookmarks of that folder **and its subfolders**, same paging and response as the plain list. An unknown or foreign folder answers `404 not_found`.
- `createBookmark` (existing): its `folder_id` is the folder to save into.

Take the types from `src/lib/api/schema.d.ts`; write no second copy. What the server will answer (mock exactly this): `404 not_found` for an unknown or someone else's folder or parent; `409 folder_name_conflict`; `422 folder_depth_exceeded`; `422 validation_error` with `errors: [{field: "name", code: "required" | "too_long"}]`; `401`; `429` with `Retry-After`.

## Behavior

### API wrappers

Create `lib/api/folders.ts` with `listFolders()`, `createFolder({ name, parentId? })`, `updateFolder(id, { name })` and `deleteFolder(id)`, typed from the schema, using the existing `apiRequest`. Add an optional `folderId` to the existing `listBookmarks` wrapper and make sure it reaches the request as `folder_id` and is absent when not given. Check in the schema whether the existing bookmark-saving wrapper can send `folder_id`; if it takes it, pass it through (see "Saving into the current folder"); if it does not, stop and ask. Each wrapper gets a small test on the exact method, path and body.

### Folder data and the tree (shared, in `lib/folders/`)

- `useFolders()`: a `useQuery` with the key `['folders']` calling `listFolders`, `retry: false`, returning the items.
- `buildFolderTree(items)`: a pure function from the flat list to nested nodes, **keeping the order the server gave** among siblings (do not sort again) and putting a folder whose parent is missing from the list at the top level. Each node carries its folder, its children and `subtreeCount`, the folder's `bookmark_count` plus those of all its descendants. It also offers lookups by id and the set of a folder's descendants. Table-driven test: empty, flat, 3 levels, an orphan, siblings keeping server order, counts adding up.
- `folderFailureMessage(action, error)`: one pure function, table-driven test, for the failures below.

### Messages shown for failures

Every message is final wording.

| Failure | Create / rename (inside the dialog) | Delete (inside its dialog) |
|---|---|---|
| `422 required` on `name` | "Give the folder a name." under the name | n/a |
| `422 too_long` on `name` | "Name is too long (100 characters at most)." under the name | n/a |
| `409 folder_name_conflict` | "A folder with this name already exists here." under the name | n/a |
| `422 folder_depth_exceeded` | "Folders can only be nested 3 levels deep." in the dialog | n/a |
| `404` | "This folder no longer exists." in the dialog | "This folder no longer exists." |
| `401` | the signed-out message | the signed-out message |
| `429` | "Too many requests. Try again in about N seconds." when `retryAfter` is a number of seconds, otherwise "Too many requests. Try again in a moment." | same text |
| anything else, including a network failure | create: "Couldn't create the folder." rename: "Couldn't rename the folder." | "Couldn't delete the folder." |

In every case except `422` and `409`, the screen also refreshes (see "Refreshing"). Field messages sit under the name field; the others in a banner inside the dialog with `role="alert"`.

### Refreshing

There is no sync poll yet. After every successful folder change, and after a `404` on any of the calls, invalidate `['folders']` and everything under the `bookmark-list` key (a delete changes the trash and the lists; the counts change). A delete also invalidates every `['bookmark', id]`. Do not update the cache by hand and do not change the tree optimistically: it changes after the server has answered.

### The layout

A sidebar on the left replaces the top navigation of `AppShell`. It contains, in this order: the app's name or logo as the top bar has it now, the link "All bookmarks" (to `/`), the link "Trash" (to `/trash`), then a "Folders" section with its heading, a "New folder" icon button on the heading's row, and the tree. The current location is marked with `aria-current="page"` (an `NavLink` does this): "All bookmarks" on `/`, "Trash" on `/trash`, the folder on `/folder/:id`. Whatever else the top bar holds today stays where it is, in the content area's header. Below **768px** the sidebar is not a drawer: it is stacked above the content, full width, and the tree is shown as it is (this is a known gap, see below). Pages and features do not know about the layout: only `app-shell/` composes it.

### The tree

- Built from `useFolders()`. Every folder is **expanded by default**; a chevron button on a folder with children collapses and expands it (`aria-expanded`, `aria-label` "Collapse <name>" / "Expand <name>"). The expanded state is plain local state, not stored anywhere, and a folder created or renamed later is expanded.
- A row is a link to `/folder/{id}` showing a folder icon, the name (one line, ellipsis when long, the full name in `title`), and the folder's `subtreeCount` on the right (hidden when `0`). Children are indented by one step per level.
- Each row has a "more actions" button, an ellipsis, `aria-label` "Actions for folder <name>", always visible. It opens the Menu with, in this order: "New subfolder" (disabled at depth 3, with its title "Folders can only be nested 3 levels deep."), "Rename", "Delete". There is no "Move to…".
- **Loading:** a few skeleton rows. **Failed to load:** a short message "Couldn't load your folders." with a "Try again" button (refetch); the two nav links above still work. **No folders:** the text "No folders yet." under the heading; the "New folder" button stays.
- A `401` while loading the folders shows the signed-out message in place of the tree, the same one the list uses.

### Create and rename

One dialog component for both, built on the shared `Dialog`.

- **New folder** (the heading button): title "New folder", one field "Name" (single line, placeholder "Folder name"), no parent. **New subfolder** (row menu): title "New subfolder", and a line under the title "In <parent name>"; the new folder is created with that `parent_id`. **Rename**: title "Rename folder", the field prefilled with the current name, Save disabled while the trimmed name equals the current one exactly (changing only the case counts as a change).
- The field has focus when the dialog opens. A counter "n/100" counts **code points**, as the server does; do not use `maxLength`. Over 100: show the counter and "Name is too long (100 characters at most)." and disable Save. An empty or spaces-only name disables Save and shows no message until the user has typed in the field (so an untouched dialog is not an error). The name is sent trimmed.
- Footer: Cancel and Create (or Save). Enter submits when Save is enabled. Esc and Cancel close the dialog and discard. While saving, the field and both buttons are disabled, Esc and the backdrop do nothing, and a second Enter does nothing.
- Success: close, refresh, success toast "Folder created." or "Folder renamed.". After a successful **create**, the new folder's ancestors are expanded (they are by default), and the app does not navigate. Failure: the dialog stays open, shows the message from the table and keeps what was typed.
- Opening the dialog again starts from the current values.

### Delete

"Delete" in the row menu opens a plain confirmation dialog from the shared `Dialog` (no typed phrase). Title: "Delete folder?". The text is built from the folder list already loaded (no extra request) and names what will happen:

- With no subfolders and no bookmarks in it: "Delete “<name>”? This folder is empty."
- Otherwise: "Delete “<name>”?" followed by a sentence listing what goes: "Its N subfolder(s) will be deleted too." when it has descendants ("1 subfolder"), and "M bookmark(s) in it will be moved to the trash." where M is the folder's `subtreeCount` ("1 bookmark"), each only when its number is more than zero.

Buttons: Cancel and "Delete folder" (danger). Esc and Cancel close it unless it is working; while working both buttons are disabled. Confirming calls `deleteFolder`. Success: close, refresh, and a toast built from the server's numbers: "Folder deleted." when `trashed_bookmarks` is `0`, otherwise "Folder deleted. N bookmark(s) moved to the trash." ("1 bookmark"). If the user is on `/folder/:id` of the deleted folder **or of one of its descendants** when the delete succeeds, navigate to `/` (replace). Failure: the dialog stays open with the message from the table.

### The folder page (`/folder/:id`)

- A new route and a thin `pages/FolderPage.tsx`. It reuses the bookmark list of the `bookmark-list` feature with a `folderId`; do not copy the list. The list's query key stays under `['bookmark-list']` and now includes the folder id, so that two folders never share a cache entry. Paging, rows, row actions, loading and error states are those of "All bookmarks", unchanged.
- The heading is the folder's name (from `useFolders()`; while the folders load, no heading text but no flash of another name).
- **Empty folder:** the text "This folder is empty." with the line "Save a bookmark here with the field above." if the page has the add field (see below), else only the first sentence.
- **Unknown folder:** when the folders are loaded and the id is not among them, or the list answers `404`, show "This folder doesn't exist." and a link "Back to all bookmarks", and no list. A `401` shows the signed-out message as the other pages do.
- The existing "All bookmarks" page keeps listing **all** live bookmarks, in any folder.

### Saving into the current folder

Where the add field of "All bookmarks" lives today, find out in the code and say in your plan. On `/folder/:id` the field is available (if it is in the shell or the page, make it available there too, reusing the same component) and saves with that folder's `folder_id`; on every other page it saves without one, as now. After a save on the folder page, the same refresh as today. Do not add a folder picker (Part B). If the add field does not exist on any page yet, skip this section and say so in your report.

### Known gaps

- Below 768px the sidebar is stacked, not a drawer: with many folders it pushes the content down.
- Folders cannot be moved yet (Part B), and a bookmark cannot be put in a folder from the UI yet except by saving it on a folder's page.
- The expanded/collapsed state is not remembered across reloads.
- The delete confirmation says "moved to the trash" from the counts the page has; if another device changed the folder meanwhile, the toast shows the server's real numbers.
- No optimistic updates and no sync poll; the server is mocked and nothing here is checked against real data.

## Structure

Follow `ARCHITECTURE.md`. `app-shell/` and `pages/` may import from any feature; features never import each other; code used by two features moves to a shared folder.

- `lib/api/folders.ts` and `lib/folders/` (`useFolders`, `buildFolderTree`, `folderFailureMessage`, one hook each for create, rename and delete with the call, the in-flight state, the mapped failure and the refresh), all with colocated tests.
- `features/folders/`: `components/` (the tree and its rows, the create/rename dialog, the delete dialog, the sidebar section that composes them), `hooks/` as needed. It imports `lib/` and `components/ui/` only.
- `app-shell/`: the sidebar layout composing "All bookmarks", "Trash" and the folders section. `pages/FolderPage.tsx` is thin and `main.tsx`'s or the router's route table gets `/folder/:id`.
- `features/bookmark-list/`: gains only the `folderId` pass-through in the list hook and its key. The empty-folder text is passed in from the page or is a prop; the list does not learn about folders.
- One hook per concern with a colocated test, written with it. Update the test helpers that wrap components so they include what the sidebar needs (router, query client, toast provider).

## Dependencies

None. `@base-ui/react`, `@tanstack/react-query`, `react-router` and `lucide-react` are installed; use them as they are. `package.json` and `package-lock.json` must not change.

## Acceptance criteria

All of these must have a test, run by `npm test`. Use Vitest and Testing Library, mock the API wrappers with value-return spies, use fake timers where time matters, and build a `QueryClient` with `retry: false` in tests.

**API wrappers**
- Each folder wrapper sends the right method, path and body: `createFolder` omits `parent_id` at the top level and sends it for a subfolder; `updateFolder` sends only `name`; `deleteFolder` returns both counts. `listBookmarks` sends `folder_id` only when given.

**Tree and messages (pure, table-driven)**
- `buildFolderTree`: every case in "Folder data and the tree". `folderFailureMessage`: every cell of the table, including `retryAfter` of a number, zero and null, and a network failure (not an `ApiError`).

**Sidebar**
- Loading skeleton, loaded tree, empty ("No folders yet."), failed ("Couldn't load your folders." with a working "Try again"), and `401` (signed-out message). The "All bookmarks" and "Trash" links are present in every state.
- Folders are expanded by default; the chevron collapses and expands (`aria-expanded` and its label follow); children are indented and the subtree count shows and hides at `0`. A long name is cut by CSS and carries its full name in `title`.
- The current location is marked `aria-current="page"` for "All bookmarks", "Trash" and a folder.
- The row menu holds "New subfolder", "Rename", "Delete", in that order, no "Move to…"; "New subfolder" is disabled at depth 3 and enabled at depth 1 and 2.

**Create and rename**
- New folder, new subfolder (shows the parent's name and sends `parent_id`) and rename (prefilled; Save disabled while the name is unchanged, enabled for a case-only change).
- Name rules: trimmed when sent; empty and spaces-only disable Save and show no message before typing; exactly 100 and 101 code points (and an emoji counting once); the counter.
- Enter submits; Esc and Cancel discard; second Enter while saving sends nothing more; everything disabled and Esc ignored while saving.
- Success closes, refreshes `['folders']` and `bookmark-list`, and toasts "Folder created." or "Folder renamed.". Each failure in the table's first column keeps the dialog open with the right message in the right place and keeps what was typed; `401` shows the signed-out message; `409` also does not refresh.

**Delete**
- The dialog text for: empty folder; one subfolder only; bookmarks only; both; "1 subfolder" and "1 bookmark" singulars; numbers taken from the loaded list (a parent whose child holds bookmarks counts them).
- Confirming calls `deleteFolder` once, closes, refreshes (folders, lists, bookmark pages) and shows "Folder deleted." for `0` trashed bookmarks and "Folder deleted. N bookmarks moved to the trash." otherwise ("1 bookmark").
- Deleting while on the deleted folder's page, or a descendant's, navigates to `/`; deleting an unrelated folder does not navigate.
- Esc, Cancel and the backdrop do nothing while working; a failure keeps the dialog open with its message; `404` refreshes.

**Folder page**
- The list is requested with the route's folder id and shows the bookmarks; two folders do not share a cache entry; paging works as on "All bookmarks".
- Heading shows the folder's name; empty folder shows the empty text; unknown folder (not in the loaded list, and a `404` from the list) shows "This folder doesn't exist." with the link; `401` shows the signed-out message.
- "All bookmarks" still requests no `folder_id` and its tests pass unchanged.
- Saving from the folder page sends that folder's id; saving from any other page sends none (or, if there is no add field, the report says so).

**Repo-wide**
- `make check` passes.
- No `any`, `@ts-ignore`, `@ts-expect-error` or `eslint-disable`.
- `package.json` and `package-lock.json` unchanged. Nothing under `backend/`, `docs/` (except the plan file), the Makefile or `openapi.yaml` changed, and nothing copied from the reference except CSS.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt. The verifier cannot run a browser, so these are by reading the code and the tests:

- `package.json` and the lockfile are untouched; only files in `components/ui/` import `@base-ui/react`; the only icon import is from `lucide-react`; no other UI package.
- Types come from `schema.d.ts`; no hand-written copy of `Folder` or the request bodies. `parent_id` is never sent by rename, and absent at the top level on create. No `bookmark_count` or depth arithmetic is invented on the client beyond the subtree sums.
- The tree keeps the server's order and does not sort; `subtreeCount` sums the folder and all descendants and nothing else; an orphan does not crash.
- No `.ts` or `.tsx` file is a copy of a reference file (compare against `docs/design/ui-reference/src`); only CSS carries over.
- No feature imports another feature. The dialogs, hooks and message function are not duplicated; `bookmark-list` has no folder-specific code beyond the `folderId` pass-through.
- No optimistic cache writes (`setQueryData`, `onMutate`), no `setInterval`; every call site handles every row of the failure table, and `401` and `404` are never swallowed.
- Query keys: the folder list's key includes the folder id and sits under `['bookmark-list']`, so invalidating the prefix refreshes it.
- Delete: navigation happens only after success, only when the current folder is the deleted one or its descendant, and uses the folder list as it was before the refresh.
- Names are rendered as text, never as HTML; links to saved URLs elsewhere keep `noopener noreferrer`.
- Dialog: Esc and the backdrop are ignored while busy; focus returns to the opener. Menu: keyboard behaviour as in the earlier slice, untouched.
- Try to break it with: a name of 100 and 101 code points and emoji; a name of only spaces; changing a name's case only; double-clicking Create, Save and Delete folder; Enter twice quickly; Esc while saving; a folder with 3 levels and "New subfolder" on the third; deleting a parent while viewing its grandchild; deleting a folder while viewing another; opening `/folder/<random uuid>`; a folder list that fails and then succeeds through "Try again"; a folder whose parent is missing from the list; a 429 with and without `Retry-After`; a very long folder name; 30 folders at once.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, the design brief or this file conflict with each other.
- You think you need a change to the backend or the contract, a dependency, or another UI library.
- The bookmark-saving wrapper cannot send `folder_id`.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `npm ci` in `frontend/` first on a fresh checkout, run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), any place you departed from the reference design and why, the known gaps, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
