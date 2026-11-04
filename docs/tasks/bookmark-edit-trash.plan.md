# Plan: bookmark edit, delete, restore, empty trash (back end)

Branch: `claude/bookmark-edit-trash-6zkvqq`. Paths are under `backend/internal/`. Tick items as they are finished.

Design in brief: a handler operation middleware (`handler/body_keys.go`) records which top-level keys were in the raw PATCH body and which were `null`, and puts that in the request context. The handler turns it into `domain.BookmarkUpdate`, whose `title`, `note` and `folder_id` are each a three-state `domain.Field[T]` (absent / null / value), plus the list of unknown keys. The usecase runs the ordered checks; the store gets only the fields that were present.

## Update (usecase, unit, with fakes) — `usecase/bookmark_update_test.go`
- [ ] Three states for `note` and `folder_id` (absent keeps, null clears, value sets; store receives exactly the present fields) — `usecase/bookmark_update.go`, test `TestBookmarkService_Update_ThreeStates`
- [ ] Check order: unknown key before too-long title; too-long on trashed gives 422 not 409; trashed with unknown folder gives 409 not 404 — `usecase/bookmark_update.go`, test `TestBookmarkService_Update_CheckOrder`
- [ ] Title 300 ok / 301 fails, note 500 ok / 501 fails, both reported together, multi-byte counts once — `usecase/bookmark_update.go`, test `TestBookmarkService_Update_Lengths`
- [ ] Folder not the caller's gives ErrRecordNotFound; folder gone at write time (store reports not found) gives not found — `usecase/bookmark_update.go`, test `TestBookmarkService_Update_Folder`
- [ ] `{}` writes nothing and returns the bookmark; on a trashed bookmark 409 — `usecase/bookmark_update.go`, test `TestBookmarkService_Update_Empty`

## Delete, restore, empty (usecase, unit, with fakes) — `usecase/bookmark_trash_test.go`
- [ ] Delete: not found / in-trash sentinel / success — `usecase/bookmark_trash.go`, test `TestBookmarkService_Delete`
- [ ] Restore: not found / not-in-trash sentinel / success — `usecase/bookmark_trash.go`, test `TestBookmarkService_Restore`
- [ ] Empty returns the store's count — `usecase/bookmark_trash.go`, test `TestBookmarkService_EmptyTrash`

## Handler (unit, with usecase doubles)
- [ ] Success of each operation: status and body shape (200 summary, 204 empty, `{"deleted": n}` incl. 0) — `handler/bookmarks_update.go`, `handler/bookmarks_trash.go`; tests `TestUpdateBookmark_Success`, `TestDeleteBookmark_NoContent`, `TestRestoreBookmark_Success`, `TestEmptyTrash_Counts`
- [ ] `updateBookmark` passes three states correctly for `note` and `folder_id`, and unknown keys / `title: null` / 301-char title reach the usecase as such and answer 422 with `unknown_field` / `invalid` / `too_long` — `handler/body_keys.go` (`body_keys_test.go`) and `handler/bookmarks_update_test.go`, test `TestUpdateBookmark_PassesThreeStates`, `TestUpdateBookmark_ValidationCodes`
- [ ] Error mappings with `application/problem+json` and `code`: 404 `not_found`, 409 `bookmark_in_trash`, 409 `bookmark_not_in_trash`, 422 `validation_error` — `handler/problem.go`, `domain/errors.go`; tests in `handler/bookmarks_update_test.go` and `handler/bookmarks_trash_test.go`
- [ ] Malformed id keeps the generated wrapper's answer — tests `TestUpdateBookmark_MalformedID`, `TestDeleteBookmark_MalformedID`, `TestRestoreBookmark_MalformedID`

## Repository (integration, build tag `integration`)
- [ ] Update writes title, note, folder; absent fields untouched; `updated_at` changes; version +1; search vector follows title; note-only change leaves vector — `repository/bookmark_update.go`, `repository/bookmark_update_integration_test.go`, `TestBookmarkRepository_Update_Fields`, `..._SearchVector`
- [ ] Update never writes a trashed bookmark (nothing changed, trash state reported) — same file, `TestBookmarkRepository_Update_Trashed`
- [ ] Update with another user's folder id and a nonexistent folder id: not found — `TestBookmarkRepository_Update_FolderNotFound`
- [ ] Delete: `deleted_at` set, leaves live list, first in trash, version +1, second delete reports trash state, two concurrent deletes: one wins — `repository/bookmark_trash.go`, `repository/bookmark_trash_integration_test.go`, `TestBookmarkRepository_Trash`, `..._TrashConcurrent`
- [ ] Restore: `deleted_at` and `folder_id` cleared, version +1, `CountByUserID` unchanged, restoring a live bookmark reports not-in-trash — `TestBookmarkRepository_Restore`
- [ ] Empty trash: only caller's trashed rows go, live and other users' stay, `bookmark_content` gone, count right, version +1 once, no bump when empty, `CountByUserID` drops — `TestBookmarkRepository_EmptyTrash`
- [ ] User isolation (NFR-7) for update, delete, restore: not found, nothing changed — `TestBookmarkRepository_UpdateTrashRestore_OtherUser`

## Repo-wide
- [ ] `make check` passes
- [ ] Only allowed paths changed (`backend/**` except `backend/migration/`, plus this plan file)
- [ ] `make test-integration-local` run and result reported
