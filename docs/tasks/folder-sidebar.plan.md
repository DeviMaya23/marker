# Plan: folder-sidebar (front end, part A)

Branch: `claude/folder-sidebar-jp4yri`. All paths under `frontend/src/`. One item per acceptance criterion in `docs/tasks/folder-sidebar.md`; tick when done and tested.

## Findings before coding

- Prerequisite is on `main`: `components/ui/{Dialog,Menu,Toast,useToast,SignedOutMessage}`, `lib/loginHref.ts`, `lib/bookmarks/describeFailure.ts` (failure pattern) are all there.
- Stop-and-ask checks: `CreateBookmarkRequest` in `schema.d.ts` has `folder_id`, so the existing `createBookmark` wrapper can send it; the `folder_id` list parameter exists in the schema. No conflict with `openapi.yaml`, no dependency, no backend change needed.
- The add field is `AddUrlForm` (`features/bookmark-list/components/AddUrlForm.tsx`), rendered by `pages/BookmarksPage.tsx` (the page, not the shell). `FolderPage` renders the same component with a `folderId` prop.
- `AppShell` is used by `BookmarksPage` and `TrashPage` only; `/save` and `/bookmarks/:id` do not use it and are not touched.

## API wrappers
- [ ] `createFolder` omits `parent_id` at top level and sends it for a subfolder; `updateFolder` sends only `name`; `deleteFolder` returns both counts; `listFolders` GET `/folders` — `lib/api/folders.ts`, test `lib/api/folders.test.ts`
- [ ] `listBookmarks` sends `folder_id` only when given — `lib/api/bookmarks.ts`, test `lib/api/bookmarks.test.ts`

## Tree and messages (pure, table-driven)
- [ ] `buildFolderTree`: empty, flat, 3 levels, orphan to top level, siblings keep server order, counts add up, lookups by id and descendant set — `lib/folders/buildFolderTree.ts`, test `lib/folders/buildFolderTree.test.ts`
- [ ] `folderFailureMessage`: every cell of the table, `retryAfter` number / 0 / null, network failure — `lib/folders/folderFailureMessage.ts`, test `lib/folders/folderFailureMessage.test.ts`
- [ ] `useFolders` (key `['folders']`, `retry: false`, returns the items) — `lib/folders/useFolders.ts`, test `lib/folders/useFolders.test.tsx`

## Sidebar
- [ ] Loading skeleton, loaded tree, "No folders yet.", "Couldn't load your folders." with working "Try again", 401 signed-out message; "All bookmarks" and "Trash" links present in every state — `features/folder-sidebar/components/FolderSection.tsx` (+ `app-shell/AppShell.tsx` for the two links), tests `FolderSection.test.tsx`, `app-shell/AppShell.test.tsx`
- [ ] Expanded by default; chevron collapses/expands (`aria-expanded`, label); indentation; subtree count shown and hidden at 0; long name cut by CSS with full name in `title` — `features/folder-sidebar/components/FolderTree.tsx`, test `FolderTree.test.tsx`
- [ ] `aria-current="page"` for "All bookmarks", "Trash" and a folder — `app-shell/AppShell.tsx`, `FolderTree.tsx`, tests `AppShell.test.tsx`, `FolderTree.test.tsx`
- [ ] Row menu: "New subfolder", "Rename", "Delete" in order, no "Move to…"; "New subfolder" disabled at depth 3, enabled at 1 and 2 — `FolderTree.tsx` (row), `components/ui/Menu.tsx` gains optional `disabled`/`title` per item, tests `FolderTree.test.tsx`, `components/ui/Menu.test.tsx`

## Create and rename
- [ ] New folder, new subfolder (shows parent name, sends `parent_id`), rename (prefilled; Save disabled while unchanged, enabled for case-only change) — `features/folder-sidebar/components/FolderFormDialog.tsx`, test `FolderFormDialog.test.tsx`; calls in `lib/folders/useCreateFolder.ts`, `useRenameFolder.ts` with tests
- [ ] Name rules: trimmed when sent; empty/spaces-only disable Save, no message before typing; 100 and 101 code points, emoji counts once; counter — `FolderFormDialog.tsx` + pure `features/folder-sidebar/lib/nameLength.ts`, tests `FolderFormDialog.test.tsx`, `lib/nameLength.test.ts`
- [ ] Enter submits; Esc and Cancel discard; second Enter while saving sends nothing; all disabled and Esc ignored while saving — `FolderFormDialog.test.tsx`
- [ ] Success closes, refreshes `['folders']` and `bookmark-list`, toasts "Folder created."/"Folder renamed."; each failure keeps dialog open with message in the right place and typed text; 401 signed-out message; 409 (and 422) do not refresh — `lib/folders/useCreateFolder.test.tsx`, `useRenameFolder.test.tsx`, `FolderFormDialog.test.tsx`, `FolderSection.test.tsx`

## Delete
- [ ] Dialog text: empty; one subfolder only; bookmarks only; both; "1 subfolder"/"1 bookmark"; numbers from the loaded list (a parent counts its child's bookmarks) — `features/folder-sidebar/components/DeleteFolderDialog.tsx` + `lib/deleteFolderText.ts`, tests `DeleteFolderDialog.test.tsx`, `lib/deleteFolderText.test.ts`
- [ ] Confirming calls `deleteFolder` once, closes, refreshes folders, lists and bookmark pages, toast "Folder deleted." for 0 and "Folder deleted. N bookmarks moved to the trash." otherwise — `lib/folders/useDeleteFolder.ts`, tests `useDeleteFolder.test.tsx`, `FolderSection.test.tsx`
- [ ] Deleting while on the deleted folder's page or a descendant's navigates to `/` (replace); unrelated folder does not — `FolderSection.tsx` (descendants taken from the list before the call), test `FolderSection.test.tsx`
- [ ] Esc, Cancel and backdrop do nothing while working; failure keeps dialog open with message; 404 refreshes — `DeleteFolderDialog.test.tsx`, `useDeleteFolder.test.tsx`

## Folder page
- [ ] List requested with the route's folder id and shows bookmarks; two folders do not share a cache entry (key under `['bookmark-list']` with folder id); paging works — `features/bookmark-list/hooks/useBookmarkList.ts`, `lib/bookmarks/queryKeys.ts`, `pages/FolderPage.tsx`, tests `useBookmarkList.test.tsx`, `pages/FolderPage.test.tsx`
- [ ] Heading shows the folder name; empty folder text; unknown folder (not in list, and list 404) shows "This folder doesn't exist." with link; 401 signed-out — `pages/FolderPage.tsx`, `BookmarkList.tsx` (generic `empty` and `notFound` props), test `pages/FolderPage.test.tsx`
- [ ] "All bookmarks" still requests no `folder_id`, its tests pass unchanged — `App.test.tsx`, `useBookmarkList.test.tsx` (only the new mock for `lib/api/folders` is added to tests that render the shell)
- [ ] Saving from the folder page sends that folder's id; from any other page sends none — `AddUrlForm.tsx` (`folderId` prop), tests `AddUrlForm.test.tsx`, `pages/FolderPage.test.tsx`

## Repo-wide
- [ ] `make check` passes
- [ ] No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`
- [ ] `package.json`, lockfile, `backend/`, `openapi.yaml`, Makefile, `docs/` (except this file) unchanged; nothing copied from the reference except CSS

## Judgment calls

(filled in at the end)
