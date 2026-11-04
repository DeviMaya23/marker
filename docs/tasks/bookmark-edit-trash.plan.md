# Plan: bookmark edit, delete, restore, empty trash (back end)

Branch: `claude/bookmark-edit-trash-6zkvqq`. Paths are under `backend/internal/`. Tick items as they are finished.

Design in brief: a handler operation middleware (`handler/body_keys.go`) records which top-level keys were in the raw PATCH body and which were `null`, and puts that in the request context. The handler turns it into `domain.BookmarkUpdate`, whose `title`, `note` and `folder_id` are each a three-state `domain.Field[T]` (absent / null / value), plus the list of unknown keys. The usecase runs the ordered checks; the store gets only the fields that were present.

## Update (usecase, unit, with fakes) — `usecase/bookmark_update_test.go`
- [x] Three states for `note` and `folder_id` (absent keeps, null clears, value sets; store receives exactly the present fields) — `usecase/bookmark_update.go`, test `TestBookmarkService_Update_ThreeStates`
- [x] Check order: unknown key before too-long title; too-long on trashed gives 422 not 409; trashed with unknown folder gives 409 not 404 — `usecase/bookmark_update.go`, test `TestBookmarkService_Update_CheckOrder`
- [x] Title 300 ok / 301 fails, note 500 ok / 501 fails, both reported together, multi-byte counts once — `usecase/bookmark_update.go`, test `TestBookmarkService_Update_Lengths`
- [x] Folder not the caller's gives ErrRecordNotFound; folder gone at write time (store reports not found) gives not found — `usecase/bookmark_update.go`, test `TestBookmarkService_Update_Folder`
- [x] `{}` writes nothing and returns the bookmark; on a trashed bookmark 409 — `usecase/bookmark_update.go`, test `TestBookmarkService_Update_Empty`

## Delete, restore, empty (usecase, unit, with fakes) — `usecase/bookmark_trash_test.go`
- [x] Delete: not found / in-trash sentinel / success — `usecase/bookmark_trash.go`, test `TestBookmarkService_Delete`
- [x] Restore: not found / not-in-trash sentinel / success — `usecase/bookmark_trash.go`, test `TestBookmarkService_Restore`
- [x] Empty returns the store's count — `usecase/bookmark_trash.go`, test `TestBookmarkService_EmptyTrash`

## Handler (unit, with usecase doubles)
- [x] Success of each operation: status and body shape (200 summary, 204 empty, `{"deleted": n}` incl. 0) — `handler/bookmarks_update.go`, `handler/bookmarks_trash.go`; tests `TestUpdateBookmark_Success`, `TestDeleteBookmark_NoContent`, `TestRestoreBookmark_Success`, `TestEmptyTrash_Counts`
- [x] `updateBookmark` passes three states correctly for `note` and `folder_id`, and unknown keys / `title: null` / 301-char title reach the usecase as such and answer 422 with `unknown_field` / `invalid` / `too_long` — `handler/body_keys.go` (`body_keys_test.go`) and `handler/bookmarks_update_test.go`, tests `TestUpdateBookmark_PassesThreeStates`, `TestUpdateBookmark_ValidationFromTheUsecase`
- [x] Error mappings with `application/problem+json` and `code`: 404 `not_found`, 409 `bookmark_in_trash`, 409 `bookmark_not_in_trash`, 422 `validation_error` — `handler/problem.go`, `domain/errors.go`; tests in `handler/bookmarks_update_test.go` and `handler/bookmarks_trash_test.go`
- [x] Malformed id keeps the generated wrapper's answer — tests `TestUpdateBookmark_BindingFailures`, `TestTrashOperations_MalformedID`

## Repository (integration, build tag `integration`)
- [x] Update writes title, note, folder; absent fields untouched; `updated_at` changes; version +1; search vector follows title; note-only change leaves vector — `repository/bookmark_update.go`, `repository/bookmark_update_integration_test.go`, `TestBookmarkRepository_Update_Fields`, `TestBookmarkRepository_Update_SearchVector`
- [x] Update never writes a trashed bookmark (nothing changed, trash state reported) — same file, `TestBookmarkRepository_Update_Trashed`
- [x] Update with another user's folder id and a nonexistent folder id: not found — `TestBookmarkRepository_Update_FolderNotFound`
- [x] Delete: `deleted_at` set, leaves live list, first in trash, version +1, second delete reports trash state, two concurrent deletes: one wins — `repository/bookmark_trash.go`, `repository/bookmark_trash_integration_test.go`, `TestBookmarkRepository_Trash`, `TestBookmarkRepository_Trash_ConcurrentDeletes`
- [x] Restore: `deleted_at` and `folder_id` cleared, version +1, `CountByUserID` unchanged, restoring a live bookmark reports not-in-trash — `TestBookmarkRepository_Restore`
- [x] Empty trash: only caller's trashed rows go, live and other users' stay, `bookmark_content` gone, count right, version +1 once, no bump when empty, `CountByUserID` drops — `TestBookmarkRepository_EmptyTrash`
- [x] User isolation (NFR-7) for update, delete, restore: not found, nothing changed — `TestBookmarkRepository_Mutations_OtherUser`

## Repo-wide
- [x] `make check` passes
- [x] Only allowed paths changed (`backend/**` except `backend/migration/`, plus this plan file)
- [x] `make test-integration-local` run and result reported

## Judgment calls

1. **Note storage.** `bookmarks.note` is `NOT NULL DEFAULT ''` and the domain field is a `string`, so "stored as null" means the empty string; the handler already maps `''` to `null` in the response. No migration needed. A whitespace note is stored as given.
2. **Where the checks live.** All validation (unknown keys, `title: null`, lengths) is in the usecase, as the check order requires. The handler tests therefore use a usecase double that returns the `ValidationError`, and assert (a) what the handler passed down (unknown keys sorted, the three states, the 301-character title unchanged) and (b) how a `ValidationError` renders (422, `validation_error`, per-field codes). The end-to-end "301 characters answers `too_long`" is covered by the usecase test `TestBookmarkService_Update_Lengths`; there is no test that wires both layers (TESTING.md forbids it).
3. **Atomic folder ownership in the store.** The usecase checks the folder with `FolderLookup`. The repository also puts `EXISTS (SELECT 1 FROM folders WHERE id = ? AND user_id = ?)` in the same UPDATE, so a folder that is another user's or does not exist writes nothing and is not-found even if called without the usecase. When zero rows change, the re-read decides: missing is 404, trashed is 409, live (so the folder was the cause) is 404. A foreign key violation is also 404.
4. **Store methods.** Added `Get` (a bookmark without its content text) rather than reusing `GetDetail`, to avoid loading the page text on every edit. `Update` returns the stored row, so the response needs no second read outside the transaction.
5. **`UnknownKeys` in the domain type.** `domain.BookmarkUpdate` carries the unknown keys so the usecase can apply the check order (unknown keys first, together with a too-long title). The handler sorts them so the `errors` order is stable.
6. **Wrong-typed known keys** (`{"title": 5}`, `{"folder_id": "nope"}`) and bodies that are an array, a string or malformed JSON are `400 validation_error` from the generated binder, before the middleware's result is used (the task says to keep that). A body of `null` or an empty body behaves as `{}`, because the generated code decodes them to an empty request.
7. **Duplicate keys.** The middleware keeps the last occurrence, which is also what the JSON decoder keeps, so presence and value always agree. Covered in `body_keys_test.go` and `TestUpdateBookmark_PassesThreeStates`.
8. **Key matching is case-sensitive.** The decoder matches field names case-insensitively, so `{"Title": "x"}` would otherwise be accepted as a title; the middleware records `Title` as an unknown key and the request is rejected with `unknown_field`.
9. **Existing router test changed.** `TestRouter_WritesNeedCSRFProtection` used `DELETE /api/v1/trash` as an example of a not-yet-implemented write. That operation is now real (and the test's server has no bookmark service), so the row now uses `DELETE /api/v1/folders/{id}`, which is still a stub. Nothing else in that test changed.
10. **Router registration.** `NewRouter` now calls `RegisterHandlersWithOptions` with an `OperationMiddlewares` entry for `updateBookmark`, instead of `RegisterHandlers`. `FieldCodeInvalid` already existed in `domain/bookmark_list.go`, so I reused it and only added `FieldCodeUnknownField` and `MaxNoteLength`.
11. **Unreachable branch.** If a guarded UPDATE changes no row and the re-read shows nothing wrong (live, and no folder condition), the repository returns an internal error (`errNotWritten`, a 500) rather than guessing a status. It cannot happen under row locking.
