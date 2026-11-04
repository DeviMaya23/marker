# Plan: backend hardening (lock order, request media type, error codes)

Branch: `claude/backend-hardening-k5jzid`. Paths are under `backend/internal/`. Tick items as they are finished.

Prerequisite checked: `api.ErrorCodeInternalError` and `api.ErrorCodeUnsupportedMediaType` exist in `api/api.gen.go`.

## Media type (handler, unit, through the real router) — `handler/media_type.go`, `handler/media_type_test.go`
- [ ] Each of the four operations: `application/json`, `; charset=utf-8`, `Application/JSON` reach the double; missing type with body, `text/plain`, `x-www-form-urlencoded`, `application/xml`, `application/problem+json` answer 415 problem and the double is never called — test `TestMediaType_RejectsNonJSONBodies` (table over operation x content type)
- [ ] Empty body with no `Content-Type` is not a 415, for each of the four — test `TestMediaType_EmptyBodyIsNotRejected`
- [ ] `restore`, `DELETE`s and `GET`s answer as before with no `Content-Type` and with `text/plain` — test `TestMediaType_OnlyBodyOperationsAreChecked`
- [ ] Order: 401 before 415, 403 before 415, 413 before 415, broken JSON as `text/plain` is 415, as `application/json` still 400 — test `TestMediaType_Order`
- [ ] `problemFor` with Echo 415 gives the 415 problem; unknown error gives 500 `internal_error` with no internal text — `handler/problem.go`, test `TestProblemFor_UnsupportedMediaTypeAndFallback` in `handler/problem_test.go`
- [ ] Wiring: middleware added to the four operations — `handler/router.go`

## Generic 500 uses the contract's code — `handler/problem.go`
- [ ] Fallback uses `api.ErrorCodeInternalError`, stale comment removed; `not_implemented` untouched — covered by the `problemFor` test above and the existing 500 tests

## Lock order (repository, integration)
- [ ] `lockFolders` renamed `lockUser`, moved next to `bumpUserVersion` in `repository/bookmark.go`; `Create` uses it
- [ ] `lockUser` is the first statement in `Update`, `Trash`, `Restore`, `EmptyTrash`, `RecordFetchSuccess`, `RecordFetchFailure` — `repository/bookmark_update.go`, `bookmark_trash.go`, `bookmark.go`
- [ ] Lock-order table test over the six methods (hold a bookmark row, run op, third connection sees the user row locked via `NOWAIT`, release, op completes) — `repository/bookmark_update_integration_test.go`, `TestWritesTakeTheUserLockFirst` (the six methods live in three files; the test lives in the file of `Update`, the first of them). Run against the old code first; must fail.
- [ ] Race test: folder delete vs Update / Trash / Restore / fetch result, many rounds, no `40P01`, outcomes legitimate, version = start + successful writes — `repository/folder_integration_test.go`, `TestFolderDelete_RacesWithBookmarkWrites`
- [ ] Existing integration tests for these methods pass unchanged

## Repo-wide
- [ ] `make check` passes; `make test-integration-local` run
- [ ] Nothing outside the allowed paths changed

## Transactions in `repository/` (`.Transaction(`)

| Method | File | Writes | Locks first |
|---|---|---|---|
| `BookmarkRepository.Create` | bookmark.go | yes | yes (already) |
| `BookmarkRepository.fetchTx` (`RecordFetchSuccess`, `RecordFetchFailure`) | bookmark.go | yes | to do |
| `BookmarkRepository.Update` | bookmark_update.go | yes | to do |
| `BookmarkRepository.Trash` | bookmark_trash.go | yes | to do |
| `BookmarkRepository.Restore` | bookmark_trash.go | yes | to do |
| `BookmarkRepository.EmptyTrash` | bookmark_trash.go | yes | to do |
| `FolderRepository.Create` | folder.go | yes | yes (already) |
| `FolderRepository.Update` | folder.go | yes | yes (already) |
| `FolderRepository.Delete` | folder.go | yes | yes (already) |

No read-only transactions exist.
