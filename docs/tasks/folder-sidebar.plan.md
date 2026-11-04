# Plan: folder-sidebar (front end, part A)

Branch: `claude/folder-sidebar-jp4yri`. All paths under `frontend/src/`. One item per acceptance criterion in `docs/tasks/folder-sidebar.md`; tick when done and tested.

## Findings before coding

- Prerequisite is on `main`: `components/ui/{Dialog,Menu,Toast,useToast,SignedOutMessage}`, `lib/loginHref.ts`, `lib/bookmarks/describeFailure.ts` (failure pattern) are all there.
- Stop-and-ask checks: `CreateBookmarkRequest` in `schema.d.ts` has `folder_id`, so the existing `createBookmark` wrapper can send it; the `folder_id` list parameter exists in the schema. No conflict with `openapi.yaml`, no dependency, no backend change needed.
- The add field is `AddUrlForm` (`features/bookmark-list/components/AddUrlForm.tsx`), rendered by `pages/BookmarksPage.tsx` (the page, not the shell). `FolderPage` renders the same component with a `folderId` prop.
- `AppShell` is used by `BookmarksPage` and `TrashPage` only; `/save` and `/bookmarks/:id` do not use it and are not touched.

## API wrappers
- [x] `createFolder` omits `parent_id` at top level and sends it for a subfolder; `updateFolder` sends only `name`; `deleteFolder` returns both counts; `listFolders` GET `/folders` — `lib/api/folders.ts`, test `lib/api/folders.test.ts`
- [x] `listBookmarks` sends `folder_id` only when given — `lib/api/bookmarks.ts`, test `lib/api/bookmarks.test.ts`

## Tree and messages (pure, table-driven)
- [x] `buildFolderTree`: empty, flat, 3 levels, orphan to top level, siblings keep server order, counts add up, lookups by id and descendant set — `lib/folders/buildFolderTree.ts`, test `lib/folders/buildFolderTree.test.ts`
- [x] `folderFailureMessage`: every cell of the table, `retryAfter` number / 0 / null, network failure — `lib/folders/folderFailureMessage.ts`, test `lib/folders/folderFailureMessage.test.ts`
- [x] `useFolders` (key `['folders']`, `retry: false`, returns the items) — `lib/folders/useFolders.ts`, test `lib/folders/useFolders.test.tsx`

## Sidebar
- [x] Loading skeleton, loaded tree, "No folders yet.", "Couldn't load your folders." with working "Try again", 401 signed-out message; "All bookmarks" and "Trash" links present in every state — `features/folder-sidebar/components/FolderSection.tsx` (+ `app-shell/AppShell.tsx` for the two links), tests `FolderSection.test.tsx`, `app-shell/AppShell.test.tsx`
- [x] Expanded by default; chevron collapses/expands (`aria-expanded`, label); indentation; subtree count shown and hidden at 0; long name cut by CSS with full name in `title` — `features/folder-sidebar/components/FolderTree.tsx`, test `FolderTree.test.tsx`
- [x] `aria-current="page"` for "All bookmarks", "Trash" and a folder — `app-shell/AppShell.tsx`, `FolderTree.tsx`, tests `AppShell.test.tsx`, `FolderTree.test.tsx`
- [x] Row menu: "New subfolder", "Rename", "Delete" in order, no "Move to…"; "New subfolder" disabled at depth 3, enabled at 1 and 2 — `FolderTree.tsx` (row), `components/ui/Menu.tsx` gains optional `disabled`/`title` per item, tests `FolderTree.test.tsx`, `components/ui/Menu.test.tsx`

## Create and rename
- [x] New folder, new subfolder (shows parent name, sends `parent_id`), rename (prefilled; Save disabled while unchanged, enabled for case-only change) — `features/folder-sidebar/components/FolderFormDialog.tsx`, test `FolderFormDialog.test.tsx`; calls in `lib/folders/useCreateFolder.ts`, `useRenameFolder.ts` with tests
- [x] Name rules: trimmed when sent; empty/spaces-only disable Save, no message before typing; 100 and 101 code points, emoji counts once; counter — `FolderFormDialog.tsx` (counting reuses `codePointLength` from `lib/bookmarks/editChanges.ts`, no new file), test `FolderFormDialog.test.tsx`
- [x] Enter submits; Esc and Cancel discard; second Enter while saving sends nothing; all disabled and Esc ignored while saving — `FolderFormDialog.test.tsx`
- [x] Success closes, refreshes `['folders']` and `bookmark-list`, toasts "Folder created."/"Folder renamed."; each failure keeps dialog open with message in the right place and typed text; 401 signed-out message; 409 (and 422) do not refresh — `lib/folders/useCreateFolder.test.tsx`, `useRenameFolder.test.tsx`, `FolderFormDialog.test.tsx`, `FolderSection.test.tsx`

## Delete
- [x] Dialog text: empty; one subfolder only; bookmarks only; both; "1 subfolder"/"1 bookmark"; numbers from the loaded list (a parent counts its child's bookmarks) — `features/folder-sidebar/components/DeleteFolderDialog.tsx` + `lib/deleteFolderText.ts`, tests `DeleteFolderDialog.test.tsx`, `lib/deleteFolderText.test.ts`
- [x] Confirming calls `deleteFolder` once, closes, refreshes folders, lists and bookmark pages, toast "Folder deleted." for 0 and "Folder deleted. N bookmarks moved to the trash." otherwise — `lib/folders/useDeleteFolder.ts`, tests `useDeleteFolder.test.tsx`, `FolderSection.test.tsx`
- [x] Deleting while on the deleted folder's page or a descendant's navigates to `/` (replace); unrelated folder does not — `FolderSection.tsx` (descendants taken from the list before the call), test `FolderSection.test.tsx`
- [x] Esc, Cancel and backdrop do nothing while working; failure keeps dialog open with message; 404 refreshes — `DeleteFolderDialog.test.tsx`, `useDeleteFolder.test.tsx`

## Folder page
- [x] List requested with the route's folder id and shows bookmarks; two folders do not share a cache entry (key under `['bookmark-list']` with folder id); paging works — `features/bookmark-list/hooks/useBookmarkList.ts`, `lib/bookmarks/queryKeys.ts`, `pages/FolderPage.tsx`, tests `useBookmarkList.test.tsx`, `pages/FolderPage.test.tsx`
- [x] Heading shows the folder name; empty folder text; unknown folder (not in list, and list 404) shows "This folder doesn't exist." with link; 401 signed-out — `pages/FolderPage.tsx`, `BookmarkList.tsx` (generic `empty` and `notFound` props), test `pages/FolderPage.test.tsx`
- [x] "All bookmarks" still requests no `folder_id`, its tests pass unchanged — `App.test.tsx`, `useBookmarkList.test.tsx` (only the new mock for `lib/api/folders` is added to tests that render the shell)
- [x] Saving from the folder page sends that folder's id; from any other page sends none — `AddUrlForm.tsx` (`folderId` prop), tests `AddUrlForm.test.tsx`, `pages/FolderPage.test.tsx`

## Repo-wide
- [x] `make check` passes
- [x] No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`
- [x] `package.json`, lockfile, `backend/`, `openapi.yaml`, Makefile, `docs/` (except this file) unchanged; nothing copied from the reference except CSS

## Judgment calls

1. **Feature directory is `features/folder-sidebar/`, not `features/folders/`.** The task's Structure section says `features/folders/`; `ARCHITECTURE.md` ("Naming") says the feature directory must be `folder-sidebar`, not `folders`, so it stays greppable apart from `lib/folders/`. The task says to follow `ARCHITECTURE.md`, so I used its name. Move it if you meant the task's name.
2. **`Menu` gained optional `disabled` and `title` per item** (`components/ui/Menu.tsx`, test added, one `[data-disabled]` style). "New subfolder" needs a disabled item with a tooltip and the wrapper had neither. Existing items behave as before.
3. **Shared mutation helper `lib/folders/useFolderMutation.ts`** under the three hooks (create, rename, delete), so the one-at-a-time guard, failure mapping and refresh live once. It has no test file of its own; it is covered through the three hooks' tests.
4. **Refresh after folder calls.** `['folders']` and `['bookmark-list']` after every success and after every failure except 422 and 409. Create and rename do not invalidate `['bookmark', id]`; delete does, on success and on failure.
5. **Counter and limit use the trimmed name** (what is sent). The counter is always shown, in red over 100.
6. **Typing in the name field clears a shown field message** (409 or server 422) so it does not outlive the text it was about; banner messages (depth, 404, 429, generic) stay until the next attempt or until the dialog is closed.
7. **Delete counts and "where am I" are taken when the user opens the Delete dialog** (the loaded list at that moment). The current path is read when the delete answers, through a ref, so a navigation during the request is respected. Subfolder count = descendants in the loaded list; bookmark count = the folder's `subtreeCount`.
8. **The not-found state of a folder page is generic in `bookmark-list`:** the list hook has a `not-found` phase (list answered 404 on the first page) and `BookmarkList` takes `empty` and `notFound` nodes. The page supplies the folder wording; the list knows nothing about folders.
9. **The add field stays visible above a "doesn't exist" message that came from the list's 404** (the page only hides it when the folder list says the id is unknown). Saving there would 404 and show the existing error banner.
10. **While the folders load, the folder page shows an empty `<h1>`** (no text, `aria-busy`), and requests the list at once rather than waiting for the folders.
11. **Collapsed state is kept per folder id in the tree component.** A folder created or renamed later is expanded because it is not in the collapsed set. A collapsed parent stays collapsed when a child is created inside it.
12. **Row menu and count placement:** the subtree count sits next to the link, not inside it, so a link's accessible name is just the folder name. The "more actions" button is always visible (the reference only shows it on hover), as the task says.
13. **`App.test.tsx`:** only a mock of `lib/api/folders` was added (the shell now loads folders); no assertion changed. Test helpers in `src/test/` gained a `folder` builder.
14. **CSS:** the old `.app-nav*` rules were removed (the top bar is gone); `app-shell*`, `sidebar*` and `folder-row*` rules were carried over from the reference and adapted (stacked layout below 768px, always-visible menu, active state from `aria-current`). No `.ts`/`.tsx` was copied.
15. **Focus return** to the row's "Actions for folder …" button after Cancel is covered by a test; I did not add manual focus handling.
16. **Departures from the reference design** (task file wins): no "Move to…", no drawer, no drag sorting, plain delete confirmation with no typed phrase, menu button always visible.
