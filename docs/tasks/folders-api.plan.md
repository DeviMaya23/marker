# Plan: folders and the folder filter (back end)

Branch: `claude/folders-api-205txf`. Paths are under `backend/internal/`. Tick items as they are finished.

Design in brief: `domain/folder.go` holds the value types (`FolderWithCount`, `FolderCreate`, `FolderUpdate` with three-state `Field`s, `FolderDeletion`) and one pure function, `PlanMove`, that decides cycle and depth from the moved subtree and the new parent. The usecase calls it for the ordered checks; the repository calls it again under the per-user lock, so the database path rejects a stale decision. The request-body check from `bookmark-edit-trash` (`handler/body_keys.go`, `fieldOf`) is reused for `createFolder` and `updateFolder`, registered as operation middleware in `handler/router.go`.

## Rules (usecase, unit, with fakes) — `usecase/folder_test.go`, fake in `usecase/fakes_test.go`
- [ ] Names: trimmed, empty after trim is `required`, 100 passes, 101 fails, multi-byte counts once, stored name is the trimmed one — `usecase/folder.go`, test `TestFolderService_Names`
- [ ] Create: parent depth 1 and 2 give depth 2 and 3; parent depth 3 is `folder_depth_exceeded`; another user's parent is not found — `usecase/folder.go`, test `TestFolderService_Create_Depth`
- [ ] Update, depth and cycle (into itself, child, grandchild = `folder_cycle`; height-2 subtree under depth-2 parent exceeds, under depth-1 passes; single folder under depth-2 passes; to top passes; cycle before depth) — `usecase/folder.go`, `domain/folder.go`, test `TestFolderService_Update_CycleAndDepth`
- [ ] Update, absent vs `null`: absent keeps the parent, `null` moves to top, value moves under it; `name: null` is `invalid` — test `TestFolderService_Update_ThreeStates`
- [ ] `{}` writes nothing and returns the folder; same name, same name in another case and the current parent are not conflicts — test `TestFolderService_Update_NoOpAndSelfNames`
- [ ] Delete returns the counts the store reports — test `TestFolderService_Delete`
- [ ] Folder filter on the list: another user's or unknown folder is not found; the store receives the folder id — `usecase/bookmark_list.go`, test `TestBookmarkService_List_FolderFilter` in `usecase/bookmark_list_test.go`

## Handler (unit, with usecase doubles) — `handler/folders_test.go`, `handler/bookmarks_list_test.go`
- [ ] Success of each operation: status and `Folder` body incl. `bookmark_count` and `parent_id: null`, 201 create, 200 with both counts for delete, `items: []` for an empty list — `handler/folders.go`, tests `TestListFolders_Success`, `TestCreateFolder_Created`, `TestUpdateFolder_Success`, `TestDeleteFolder_Counts`
- [ ] Request handling: unknown keys (`depth`, `id`, `foo`) give 422 `unknown_field`; missing `name` gives `required`; `name: null` on update gives `invalid`; the three states of `parent_id` reach the usecase as three inputs — tests `TestCreateFolder_RequestHandling`, `TestUpdateFolder_RequestHandling`
- [ ] Error mappings with `application/problem+json` and `code`: 404 `not_found`, 409 `folder_name_conflict`, 422 `folder_cycle`, 422 `folder_depth_exceeded`, 422 `validation_error` — `handler/problem.go`, test `TestFolderOperations_ErrorMappings`
- [ ] `listBookmarks`: `folder_id` alone reaches the usecase; with non-empty `q` still 501; with `trashed=true` 422; unknown folder 404; bad cursor with `folder_id` is 422 before the folder check — `handler/bookmarks_list.go`, tests `TestListBookmarks_FolderFilter` in `handler/bookmarks_list_test.go`

## Repository (integration, build tag `integration`) — `repository/folder_integration_test.go`, `repository/bookmark_list_integration_test.go`
- [ ] List: only the caller's folders, ordered by lower-cased name; `bookmark_count` counts live bookmarks directly in the folder only — `repository/folder.go`, test `TestFolderRepository_List`
- [ ] Create: depth right; same name under the same parent in another case, and at the top, conflict; same name under different parents does not; parent deleted meanwhile is not found; version +1 — test `TestFolderRepository_Create`
- [ ] Update: rename; move to top; move under another folder updates depth of the folder and every descendant; collision conflicts; rename to a different case of its own name works; cycle and depth rejected with the real tree; version +1, and not for `{}` — test `TestFolderRepository_Update`
- [ ] Concurrency: two moves forming a cycle give exactly one success; two creates of one name give exactly one success — tests `TestFolderRepository_Update_ConcurrentCycle`, `TestFolderRepository_Create_ConcurrentSameName`
- [ ] Delete: folder and subfolders gone; live bookmarks in the subtree trashed with one shared `deleted_at`; already-trashed stay and are uncounted; others untouched; counts right; version +1 once; trashed ones in the trash list and not the live list; `folder_id` null afterwards — test `TestFolderRepository_Delete`
- [ ] Folder filter on the list: own plus depth 2 and 3 bookmarks; excludes siblings, top level and trashed; newest first; pages across a boundary without gaps or repeats; another user's folder yields nothing — `repository/bookmark_list.go`, test `TestBookmarkRepository_List_FolderFilter`
- [ ] User isolation (NFR-7): update, delete and the filter on another user's folder report not found and change nothing — tests `TestFolderRepository_OtherUser`, and the filter test above

## Repo-wide
- [ ] `make check` passes
- [ ] Nothing outside the allowed paths changed
- [ ] `make test-integration-local` run and result reported

## Judgment calls

(filled in at the end)
