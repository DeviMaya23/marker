# Plan: backend hardening (lock order, request media type, error codes)

Branch: `claude/backend-hardening-k5jzid`. Paths are under `backend/internal/`. Tick items as they are finished.

Prerequisite checked: `api.ErrorCodeInternalError` and `api.ErrorCodeUnsupportedMediaType` exist in `api/api.gen.go`.

## Media type (handler, unit, through the real router) — `handler/media_type.go`, `handler/media_type_test.go`
- [x] Each of the four operations: `application/json`, `; charset=utf-8`, `Application/JSON` reach the double; missing type with body, `text/plain`, `x-www-form-urlencoded`, `application/xml`, `application/problem+json` answer 415 problem and the double is never called — tests `TestMediaType_JSONReachesTheUsecase` and `TestMediaType_NonJSONBodiesAre415` (operation x content type)
- [x] Empty body with no `Content-Type` is not a 415, for each of the four — test `TestMediaType_EmptyBodyIsNotRejected`
- [x] `restore`, `DELETE`s and `GET`s answer as before with no `Content-Type` and with `text/plain` — test `TestMediaType_OnlyBodyOperationsAreChecked`
- [x] Order: 401 before 415, 403 before 415, 413 before 415, broken JSON as `text/plain` is 415, as `application/json` still 400 — test `TestMediaType_Order`
- [x] `problemFor` with Echo 415 gives the 415 problem; unknown error gives 500 `internal_error` with no internal text — `handler/problem.go`, test `TestProblemFor` in `handler/media_type_test.go` (there is no `problem_test.go`; one test file per source file is kept for the new middleware, and `problemFor` is exercised there)
- [x] Wiring: middleware added to the four operations — `handler/router.go`

## Generic 500 uses the contract's code — `handler/problem.go`
- [x] Fallback uses `api.ErrorCodeInternalError`, stale comment removed; `not_implemented` untouched — covered by the `problemFor` test above and the existing 500 tests

## Lock order (repository, integration)
- [x] `lockFolders` renamed `lockUser`, moved next to `bumpUserVersion` in `repository/bookmark.go`; `Create` uses it
- [x] `lockUser` is the first statement in `Update`, `Trash`, `Restore`, `EmptyTrash`, `RecordFetchSuccess`, `RecordFetchFailure` — `repository/bookmark_update.go`, `bookmark_trash.go`, `bookmark.go`
- [x] Lock-order table test over the six methods (hold a bookmark row, run op, third connection sees the user row locked via `NOWAIT`, release, op completes) — `repository/bookmark_update_integration_test.go`, `TestWritesTakeTheUserLockFirst` (the six methods live in three files; the test lives in the file of `Update`, the first of them). Run against the old code first; must fail.
- [x] Race test: folder delete vs Update / Trash / Restore / fetch result, many rounds, no `40P01`, outcomes legitimate, version = start + successful writes — `repository/folder_integration_test.go`, `TestFolderDelete_RacesWithBookmarkWrites` (60 rounds per operation, six operations; run 6 times in a row, all passed)
- [x] Existing integration tests for these methods pass unchanged

## Repo-wide
- [x] `make check` passes; `make test-integration-local` run
- [x] Nothing outside the allowed paths changed

## Transactions in `repository/` (`.Transaction(`)

| Method | File | Writes | Locks first |
|---|---|---|---|
| `BookmarkRepository.Create` | bookmark.go | yes | yes (already) |
| `BookmarkRepository.fetchTx` (`RecordFetchSuccess`, `RecordFetchFailure`) | bookmark.go | yes | yes (now) |
| `BookmarkRepository.Update` | bookmark_update.go | yes | yes (now) |
| `BookmarkRepository.Trash` | bookmark_trash.go | yes | yes (now) |
| `BookmarkRepository.Restore` | bookmark_trash.go | yes | yes (now) |
| `BookmarkRepository.EmptyTrash` | bookmark_trash.go | yes | yes (now) |
| `FolderRepository.Create` | folder.go | yes | yes (already) |
| `FolderRepository.Update` | folder.go | yes | yes (already) |
| `FolderRepository.Delete` | folder.go | yes | yes (already) |

No read-only transactions exist.

## Results

- Lock test against the old code: failed for all six methods. Race test against the old code: failed with `deadlock detected (40P01)` for all six.
- After the change: passes. Removing the lock call from each of the six methods in turn made exactly that method's subtest fail (Create's call is not covered by this test, by design; its existing behavior is unchanged).
- Integration tests: `make test-integration-local`, run, passed, PostgreSQL 16.15. Not run on 17 (no Docker).

## Judgment calls

- **Echo's binder compares the media type case-sensitively.** `Application/JSON` passed my check and was then answered 415 by Echo's own binder. After accepting a request, `requireJSON` rewrites the media-type part of the request's `Content-Type` to lower case (parameters kept), so the generated code decodes it.
- **Undeclared body length (chunked).** A declared `Content-Length` decides "has a body". For an undeclared one the middleware reads the body (the 64 KiB limit applies) and puts it back, so 413 still beats 415 there.
- **Order 401/403 vs 413.** The size limit is a global middleware that already runs before the session check, for a declared oversize body. I did not change that; the task asks for "413 before 415", which holds.
- **A trailing space or a `;charset=` without a space** are accepted (`application/json `, `application/json;charset=UTF-8`); `application/jsonx` and `multipart/form-data` are 415.
- **`problemFor` test location.** Put in `handler/media_type_test.go` rather than a new `problem_test.go`, to avoid a test file for a source file that had none.
- **Race test outcomes.** The folder delete itself must always succeed; the other operation's allowed errors are listed per operation in the test. The Restore and EmptyTrash rows seed a trashed bookmark.
- **Existing tests that write the literal `"internal_error"`** were left alone: none says the contract lacks the code.
- **Local `main` is stale** (it lacks the prerequisite contract change), so "nothing outside allowed paths changed" was checked against the branch base `3695781`.
