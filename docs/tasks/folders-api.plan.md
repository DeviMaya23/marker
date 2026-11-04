# Plan: folders and the folder filter (back end)

Branch: `claude/folders-api-205txf`. Paths are under `backend/internal/`. Tick items as they are finished.

Design in brief: `domain/folder.go` holds the value types (`FolderWithCount`, `FolderCreate`, `FolderUpdate` with three-state `Field`s, `FolderDeletion`) and one pure function, `PlanMove`, that decides cycle and depth from the moved subtree and the new parent. The usecase calls it for the ordered checks; the repository calls it again under the per-user lock, so the database path rejects a stale decision. The request-body check from `bookmark-edit-trash` (`handler/body_keys.go`, `fieldOf`) is reused for `createFolder` and `updateFolder`, registered as operation middleware in `handler/router.go`.

## Rules (usecase, unit, with fakes) — `usecase/folder_test.go`, fake in `usecase/fakes_test.go`
- [x] Names: trimmed, empty after trim is `required`, 100 passes, 101 fails, multi-byte counts once, stored name is the trimmed one — `usecase/folder.go`, test `TestFolderService_Names`
- [x] Create: parent depth 1 and 2 give depth 2 and 3; parent depth 3 is `folder_depth_exceeded`; another user's parent is not found — `usecase/folder.go`, test `TestFolderService_Create_Depth`
- [x] Update, depth and cycle (into itself, child, grandchild = `folder_cycle`; height-2 subtree under depth-2 parent exceeds, under depth-1 passes; single folder under depth-2 passes; to top passes; cycle before depth) — `usecase/folder.go`, `domain/folder.go`, test `TestFolderService_Update_CycleAndDepth`
- [x] Update, absent vs `null`: absent keeps the parent, `null` moves to top, value moves under it; `name: null` is `invalid` — test `TestFolderService_Update_ThreeStates`
- [x] `{}` writes nothing and returns the folder; same name, same name in another case and the current parent are not conflicts — test `TestFolderService_Update_NoOpAndSelfNames`
- [x] Delete returns the counts the store reports — test `TestFolderService_Delete`
- [x] Folder filter on the list: another user's or unknown folder is not found; the store receives the folder id — `usecase/bookmark_list.go`, test `TestBookmarkService_List_FolderFilter` in `usecase/bookmark_list_test.go`

## Handler (unit, with usecase doubles) — `handler/folders_test.go`, `handler/bookmarks_list_test.go`
- [x] Success of each operation: status and `Folder` body incl. `bookmark_count` and `parent_id: null`, 201 create, 200 with both counts for delete, `items: []` for an empty list — `handler/folders.go`, tests `TestListFolders_Success`, `TestCreateFolder_Created`, `TestUpdateFolder_Success`, `TestDeleteFolder_Counts`
- [x] Request handling: unknown keys (`depth`, `id`, `foo`) give 422 `unknown_field`; missing `name` gives `required`; `name: null` on update gives `invalid`; the three states of `parent_id` reach the usecase as three inputs — tests `TestCreateFolder_RequestHandling`, `TestUpdateFolder_RequestHandling`
- [x] Error mappings with `application/problem+json` and `code`: 404 `not_found`, 409 `folder_name_conflict`, 422 `folder_cycle`, 422 `folder_depth_exceeded`, 422 `validation_error` — `handler/problem.go`, test `TestFolderOperations_ErrorMappings`
- [x] `listBookmarks`: `folder_id` alone reaches the usecase; with non-empty `q` still 501; with `trashed=true` 422; unknown folder 404; bad cursor with `folder_id` is 422 before the folder check — `handler/bookmarks_list.go`, tests `TestListBookmarks_FolderFilter` in `handler/bookmarks_list_test.go`

## Repository (integration, build tag `integration`) — `repository/folder_integration_test.go`, `repository/bookmark_list_integration_test.go`
- [x] List: only the caller's folders, ordered by lower-cased name; `bookmark_count` counts live bookmarks directly in the folder only — `repository/folder.go`, test `TestFolderRepository_List`
- [x] Create: depth right; same name under the same parent in another case, and at the top, conflict; same name under different parents does not; parent deleted meanwhile is not found; version +1 — test `TestFolderRepository_Create`
- [x] Update: rename; move to top; move under another folder updates depth of the folder and every descendant; collision conflicts; rename to a different case of its own name works; cycle and depth rejected with the real tree; version +1, and not for `{}` — test `TestFolderRepository_Update`
- [x] Concurrency: two moves forming a cycle give exactly one success; two creates of one name give exactly one success — tests `TestFolderRepository_Update_ConcurrentCycle`, `TestFolderRepository_Create_ConcurrentSameName`
- [x] Delete: folder and subfolders gone; live bookmarks in the subtree trashed with one shared `deleted_at`; already-trashed stay and are uncounted; others untouched; counts right; version +1 once; trashed ones in the trash list and not the live list; `folder_id` null afterwards — test `TestFolderRepository_Delete`
- [x] Folder filter on the list: own plus depth 2 and 3 bookmarks; excludes siblings, top level and trashed; newest first; pages across a boundary without gaps or repeats; another user's folder yields nothing — `repository/bookmark_list.go`, test `TestBookmarkRepository_List_FolderFilter`
- [x] User isolation (NFR-7): update, delete and the filter on another user's folder report not found and change nothing — tests `TestFolderRepository_OtherUser`, and the filter test above

## Repo-wide
- [x] `make check` passes
- [x] Nothing outside the allowed paths changed
- [x] `make test-integration-local` run and result reported

## Judgment calls

1. **Cycle and depth are decided in one place, used twice.** `domain.PlanMove` holds the arithmetic. The usecase calls it for the ordered checks and unit tests; the repository calls it again on the tree it reads under the per-user lock. The task asks for the rules in the usecase and for the database path to reject cycle and depth as well, and a check made before the lock can be stale, so both run. The repository tests cover the database path, the usecase tests the ordering.
2. **Create's depth.** The usecase computes `depth` and passes it in `domain.Folder`; the repository ignores it and stores the depth from the parent it read under the lock (`TestFolderRepository_Create` proves a wrong proposed depth is not trusted).
3. **Store shape.** `FolderStore` has `List`, `Get` (with count), `Subtree`, `Create`, `Update`, `Delete`. `Subtree` (a recursive query, always with `user_id`) serves cycle and height in one read. `Delete` is a thin usecase method over the store: not-found and the counts are decided under the lock in the repository. `repository.GetFolder` stays for `FolderLookup`.
4. **`updateFolder` with only `name` (or the parent unchanged in effect).** Steps 4 to 6 (parent, cycle, depth) run only when `parent_id` is present. A rename alone writes name and `updated_at`, never depth. A same-name rename, or a case change, still counts as a write (version +1, `updated_at` set); only `{}` writes nothing.
5. **`{}` on another user's folder** is `404`, not a silent `200`: the folder check (step 3) runs before the no-op answer, as the task orders it.
6. **`name: null` on create** is treated as a missing name (`required`), because the generated request has a plain `string` there and the task says a missing key is `required`. On update `name: null` is `invalid`, as specified.
7. **Unknown keys are checked before `name: null`** on update, since step 1 comes before step 2.
8. **List ordering** is `lower(name), id` using the database's default collation; the task names no collation.
9. **Folder filter in the usecase** is applied only to the live list and only after the cursor decodes. The handler already refuses `trashed=true` with `folder_id` (422), so the usecase ignores a folder on a trash query rather than failing.
10. **`bookmark_count` in create and update responses** is read in the same transaction as the write. For delete there is no folder to return.
11. **`NewServer` signature** is now `NewServer(bookmarks, folders)`; every handler test call site was updated (`NewServer(spy, nil)`, `NewServer(nil, nil)`). A server built without a folder service panics on a folder route, as one built without a bookmark service does on a bookmark route.
12. **Existing router test changed.** `router_test.go` used the folder routes as its examples of a stub operation. They are real now, so those rows use `GET /api/v1/sync/version` and `DELETE /api/v1/account`, which are still stubs. Nothing else in that test changed. I also removed the `someFolderID` constant it no longer uses.
13. **Existing list test changed.** `TestListBookmarks_SearchAndFolderAreNotImplemented` became `TestListBookmarks_SearchIsNotImplemented`: its `folder_id` rows are no longer 501. It gained a row for `q` with `folder_id`.
14. **Integration run.** `make test-integration-local` ran and passed on PostgreSQL 16.15; the concurrency tests were also repeated with `-count=3`. I did not run against PostgreSQL 17 (no Docker in this session).
