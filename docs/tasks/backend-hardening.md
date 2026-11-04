# Task: backend hardening (lock order, request media type, error codes)

> One backend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> **Prerequisite:** the contract has `internal_error` and `unsupported_media_type` in `ErrorCode`, the `415` response on the four body operations, and the code is regenerated, so `api.ErrorCodeInternalError` and `api.ErrorCodeUnsupportedMediaType` exist in `backend/internal/api`. If they do not, stop and ask; do not edit `openapi.yaml` or the generated code.

## Goal

Three loose ends from the earlier verifier reports are closed:

1. A bookmark write and a folder write on the same bookmark can deadlock, and Postgres aborts one of them with a 500. Every write takes the user's lock before it touches any row.
2. A body sent without `Content-Type: application/json` is answered with `415 unsupported_media_type`, not a 500.
3. The generic 500 uses the contract's `internal_error` code instead of a string the contract did not have.

Requirements covered: NFR-2 (every write increments `users.version`, and still does), NFR-7 and NFR-13 (unchanged: authentication and CSRF still answer first), NFR-14 (a body that is not JSON is rejected).

Out of scope, and why:

- Retrying a transaction that Postgres aborted for a deadlock: the fix removes the cause; a retry layer is not needed.
- Rate limiting, search, sync, favicons, auth and account operations.
- A test for the foreign-key branch of `repository.Update` (a folder deleted between the existence check and the write): nearly unreachable, left out on purpose.
- Case-insensitive folder name collation; the `not_implemented` placeholder code (it stays a literal until the stubs are gone); any change to the contract or generated code.

## Role and ownership

Role: Backend (see `AGENTS.md`).

You may change `backend/**` except `backend/migration/` and `backend/internal/api/` (generated). You may not change `openapi.yaml`, `oapi-codegen.yaml`, `docs/**` (except your own plan file, `docs/tasks/backend-hardening.plan.md`, see `AGENTS.md`), `CONVENTIONS.md`, the frontend, migrations or the Makefile.

**Shared files.** No other backend task runs now. You change `repository/` (the six write methods and the lock helper), `handler/problem.go`, `handler/router.go` (the operation middleware list) and a new file in `handler/`. The only other open task is front-end.

## Behavior

### 1. The user lock comes first in every write transaction

`SELECT id FROM users WHERE id = ? FOR UPDATE` is the per-user lock. `createBookmark` and the three folder writes already take it at the start of their transaction. The others do not: they write a bookmark row first and take the same lock only at the end, when they increment `users.version`. A folder delete holds the lock and then wants those bookmark rows, while a bookmark edit holds a row and then wants the lock: a cycle.

- Make the helper that takes the lock a general one: rename `lockFolders` in `repository/folder.go` to `lockUser` and move it next to `bumpUserVersion`. It still returns `gorm.ErrRecordNotFound` when the user does not exist. `Create` may use it in place of its inline statement; its behavior must not change.
- Call it as the **first statement** of the transaction in each of: `Update`, `Trash`, `Restore`, `EmptyTrash`, `RecordFetchSuccess` and `RecordFetchFailure` (the last two through `fetchTx`; keep its foreign-key-to-not-found mapping).
- Nothing else changes. Same results, same errors, same one version increment per real write and none when nothing was written. In particular `EmptyTrash` of an empty trash still does not bump, `Update` of a trashed bookmark is still `bookmark_in_trash`, and a fetch result for a bookmark that is gone or no longer pending is still not-found.
- A user that does not exist: the operations that lock now answer not-found at the lock, which is what they answered before for an unknown bookmark.
- After your change, search `repository/` for every `.Transaction(`: each write transaction starts with the lock or is read-only. List them in your plan (name, whether it writes, whether it locks first).

### 2. A body that is not JSON answers 415

Applies to the four operations that take a body: `createBookmark`, `updateBookmark`, `createFolder`, `updateFolder`.

- If the request has a body and its `Content-Type` is not `application/json` (compare the media type only, case-insensitive; parameters such as `; charset=utf-8` are allowed), answer `415` with the problem code `unsupported_media_type`, title "Unsupported media type", through the existing error handler, so the body is `application/problem+json` like every other error.
- A request with an empty body is not affected: it proceeds as it does today (and ends in a 422 or whatever it ended in before). A missing `Content-Type` with a body is a 415.
- Operations without a body (`GET`, `DELETE`, and `POST .../restore`) never get this check, whatever their `Content-Type`.
- Order of answers, first match wins: `401` (no session), `403` (CSRF), `413` (body over the limit), `415`, then everything that already follows (unknown keys, malformed JSON `400`, validation `422`). A text body with broken JSON is a 415, not a 400.
- Where: a small middleware in `handler/` next to the request-body check from `bookmark-edit-trash`, applied through the same per-operation middleware option to those four operations. In addition, map an Echo `HTTPError` with status 415 in `problemFor` to the same problem, so nothing else can answer it with a 500.

### 3. The generic 500 uses the contract's code

- In `problemFor`, the final fallback uses `api.ErrorCodeInternalError` instead of the string `"internal_error"`; remove the comment saying the contract lacks the code. The answer's JSON does not change (`code` is still `internal_error`, status 500, internal text never exposed).
- `not_implemented` stays a literal; its comment is unchanged.
- Update any test or comment that says `internal_error` is not in the contract.

### Known gaps

- The lock serializes one user's writes. That is the intended cost: a handful of users, short transactions.
- Reads (`GET`) take no lock and are unaffected.
- A deadlock between any other pair of statements is not looked for here.

## Structure

Follow `ARCHITECTURE.md` and the test-file rules in `TESTING.md`. The lock helper lives in the repository package; the media-type check is a handler middleware with its own test file; the repository concurrency tests are integration tests (tag `integration`) in the existing `_integration_test.go` files of the methods they cover.

## Dependencies

None. Use only what is in `go.mod`.

## Acceptance criteria

Unit tests need no database. Integration tests carry the `integration` build tag; run them with `make test-integration-local` and say in the report which ran and on which Postgres version.

**Media type (handler, unit, through the real router)**
- For each of the four operations: `application/json`, `application/json; charset=utf-8` and `Application/JSON` reach the usecase double; a missing `Content-Type` with a body, `text/plain`, `application/x-www-form-urlencoded`, `application/xml` and `application/problem+json` each answer `415` with `application/problem+json`, `code: unsupported_media_type` and status 415 in the body, and the usecase double is never called.
- An empty body with no `Content-Type` is not a 415 (the answer is what it was before this task, for each of the four).
- `POST /bookmarks/{id}/restore`, `DELETE /bookmarks/{id}`, `DELETE /trash`, `DELETE /folders/{id}` and the `GET`s answer as before with no `Content-Type` and with `text/plain`.
- Order: an unauthenticated request with a wrong `Content-Type` is `401`; a request without the CSRF header is `403`; a body over the limit with a wrong `Content-Type` is `413`; broken JSON sent as `text/plain` is `415`, and broken JSON as `application/json` is still `400` as before.
- `problemFor` with an Echo `HTTPError` of status 415 gives the 415 problem; with an unknown error it gives `500`, `internal_error`, and no internal text in the body.

**Lock order (repository, integration)**
- A table test over the six methods (`Update`, `Trash`, `Restore`, `EmptyTrash`, `RecordFetchSuccess`, `RecordFetchFailure`): the test holds the lock of one of the target bookmark's rows in another transaction, starts the operation in a goroutine, waits briefly, and then checks from a third connection that the user's row is locked (`SELECT … FOR UPDATE NOWAIT` fails with `lock_not_available`). That shows the operation took the user lock before it reached the bookmark row. Then it releases the row and checks that the operation completes normally. (For `EmptyTrash` hold a trashed bookmark's row.) The test must fail on the code before this change; run it against the old code first and say in the report that it did.
- A race test: many rounds of a folder delete against, in turn, an `Update`, a `Trash`, a `Restore` and a fetch result on a bookmark in that folder. No operation returns a Postgres deadlock error (`40P01`); every outcome is one of the legitimate ones (success, `bookmark_in_trash`, `bookmark_not_in_trash`, not-found); the user's version equals the starting value plus the number of writes that succeeded; run it several times in a row and say how many rounds.
- The existing integration tests for these methods pass unchanged, including the version-bump assertions (`EmptyTrash` of nothing does not bump; a rejected `Update` does not bump).

**Repo-wide**
- `make check` passes.
- Nothing outside the allowed paths changed. `go.mod`, `go.sum`, `openapi.yaml`, `oapi-codegen.yaml` and `backend/internal/api` are untouched.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt:

- List every `.Transaction(` in `backend/internal/repository` yourself. Each write transaction (`Create`, `Update`, `Trash`, `Restore`, `EmptyTrash`, `RecordFetchSuccess`, `RecordFetchFailure`, folder create/update/delete, and any other that writes) takes the lock as its first statement; read-only ones do not. A write that takes any row lock before the user lock fails the check.
- No behavior change in the repository: compare each of the six methods against `origin/main` and confirm that only the lock call (and the helper's rename and move) differs. `users.version` is incremented exactly as before: once per real write, not for `EmptyTrash` of nothing, not for a rejected `Update`.
- The lock test really discriminates: it must fail if the lock call is removed from any one of the six methods. Remove each in turn (revert afterwards) and say what happened.
- The media-type check rejects only requests with a body on the four operations, compares the media type and not the whole header, and is placed after authentication, CSRF and the size limit and before the keys check and JSON parsing. `restore`, the `DELETE`s and the `GET`s never get it.
- `problemFor` still never puts internal error text in a response; the `500` answer's JSON is identical to before; `not_implemented` is untouched.
- `openapi.yaml`, generated code, `go.mod`, `go.sum`, migrations, the Makefile and `CONVENTIONS.md` are untouched; the only new dependency is none.
- Try to break it with: a `PATCH` with `Content-Type: application/json;charset=UTF-8` (no space); `application/json ` with a trailing space; a body with `Content-Type: application/jsonx`; a `POST /folders` with `multipart/form-data`; a `PATCH /bookmarks/{id}` with an empty body and `text/plain`; two concurrent `Update` calls on the same bookmark; a folder delete racing an `EmptyTrash` on a bookmark in that folder that is trashed; a fetch result arriving while its bookmark's folder is being deleted; a user that does not exist (the lock reports not-found).

## Stop and ask when

- The contract (`openapi.yaml`), a requirement or this file conflict with each other.
- The generated `api.ErrorCodeInternalError` or `api.ErrorCodeUnsupportedMediaType` does not exist.
- You think you need a migration, a dependency, a change to the contract or its generated code, a retry layer, or a change outside the allowed paths.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `npm ci` in `frontend/` first on a fresh checkout (the check runs the front end's lint), run `make check`, run `make test-integration-local`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), which integration tests ran and which did not (and the Postgres version), the transaction listing from section 1, whether the lock test failed before the change, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
