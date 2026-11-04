# Verifier report: backend hardening

Branch: `claude/backend-hardening-verify-tm0zbi` (the session's branch, reset to the builder's `claude/backend-hardening-k5jzid` at `2c728a3`, plus the test changes below).

**Result: no Blocking findings.** `make check` passed (exit 0). Integration tests were **not run** by me (not allowed in this role); the builder reports them run and passed on PostgreSQL 16.15 only.

Test changes by me (tests only): one subtest in `media_type_test.go` (`TestMediaType_Order`: a body of exactly 65,536 bytes, declared and undeclared length, is 415 and not 413); `TestProblemFor` moved from `media_type_test.go` to a new `problem_test.go`, because TESTING.md says one test file per source file and `problem.go` is the source of that test.

## Acceptance criteria

| Criterion | Test | Real? | Status |
|---|---|---|---|
| Four ops: `application/json`, `; charset=utf-8`, `Application/JSON` reach the double (also `;charset=UTF-8`, trailing space) | `TestMediaType_JSONReachesTheUsecase` | Yes: asserts the double was called. Fails if the check rejected them. | Met (NFR-14) |
| Four ops: missing type, `text/plain`, form, xml, `application/problem+json` (also `jsonx`, multipart) answer 415 problem, double not called | `TestMediaType_NonJSONBodiesAre415` | Yes: checks status, content type, code, title and the double. | Met |
| Empty body, no Content-Type, is not 415 | `TestMediaType_EmptyBodyIsNotRejected` | Yes (also with `text/plain`). | Met |
| restore, DELETEs, GETs unaffected with no type / `text/plain` | `TestMediaType_OnlyBodyOperationsAreChecked` | Yes. | Met |
| Order: 401, 403, 413, broken JSON as text 415, as JSON 400 | `TestMediaType_Order` | Yes for each listed case. See Non-blocking 1 for 401 vs oversize. | Met |
| `problemFor` 415 and unknown → 500 `internal_error`, no internal text | `TestProblemFor` | Yes. | Met |
| Lock test over six methods, discriminating | `TestWritesTakeTheUserLockFirst` (integration) | Design is sound: holds the bookmark row, checks `NOWAIT` on the user row, then releases and checks the version. Builder reports it failed on old code and each removal failed its own subtest. I did not rerun it. | Met on the builder's word; depends only on integration tests |
| Race test, no `40P01`, legitimate outcomes, version = start + successes, several runs | `TestFolderDelete_RacesWithBookmarkWrites` (integration) | Design is sound: 60 rounds × 6 ops, builder ran it 6 times. Not rerun by me. | Met on the builder's word; integration only |
| Existing integration tests pass unchanged | existing files, only additions in the diff | The diff only adds to them; I did not run them. | Met by diff; integration only |
| `make check` passes | — | Ran it. | Met |
| Nothing outside allowed paths; `go.mod`, `go.sum`, `openapi.yaml`, `oapi-codegen.yaml`, `internal/api` untouched | `git diff 3695781 HEAD --stat` over those paths | Empty. | Met |

## Plan check

- Every acceptance criterion appears in the plan; none is missing.
- Every ticked item names a test or file that exists. The ticked unit-test items check the behavior. The integration items (lock test, race test, existing tests pass, mutation and old-code results) are claims I could not verify.
- Plan vs diff: they match. The diff has the 11 files the plan describes. The plan's transaction table matches the nine `.Transaction(` sites I listed myself. The plan's judgment call about `problemFor` tests living in `media_type_test.go` conflicted with TESTING.md; I moved them.

## Rule checks

- Only `handler/` imports `internal/api`: the diff adds no new import of it outside `handler/` (`repository/` files have none).
- Every repository query filters by `user_id`: the new `lockUser` selects `users WHERE id = ?`, which is the user's own row (the same statement as before); nothing else added.
- `users.version` increments: unchanged. Each of the six methods keeps its existing `bumpUserVersion` call; the diff only adds `lockUser` as the first statement. Compared to main, nothing else in those methods differs.
- `go.mod` / `go.sum` untouched; no dependency added.
- `.Transaction(` listing: `Create`, `fetchTx` (Success, Failure), `Update`, `Trash`, `Restore`, `EmptyTrash`, folder `Create`, `Update`, `Delete`. All are writes and all lock first. No read-only transactions. `lockFolders` no longer exists anywhere.
- Media-type check: only on the four body operations, middleware order is `requireJSON` before `recordBodyKeys`; media type compared with `;` split and `EqualFold`; empty body skipped. `restore`, DELETEs, GETs are not wired.
- `problemFor`: 500 uses `api.ErrorCodeInternalError`, text still generic; `not_implemented` untouched.
- Migrations, Makefile, `CONVENTIONS.md`, frontend: untouched.
- Break-it cases run (all via unit tests): `;charset=UTF-8` without space accepted; `application/json ` accepted; `application/jsonx` 415; multipart 415; empty `PATCH` with `text/plain` not 415; exact-limit body 415; limit+1 413 (declared and undeclared). Not run: concurrent `Update`s, folder delete vs `EmptyTrash`, fetch vs folder delete, unknown user (all need the database; the first four are covered by the builder's race test, the unknown user is not tested for the six methods).

## Findings

### Blocking

None.

### Non-blocking

1. **413 beats 401/403 for an oversize declared body.** `POST /api/v1/bookmarks` with no session and a body over 64 KiB answers `413`, not `401`, because Echo's global `BodyLimit` runs before the session middleware. The task's order text says 401, 403, 413. This is not new (the global limit comes from `bookmark-edit-trash`, and no requirement ID fixes the order), the builder flagged it, and the listed cases pass. I did not add a test for it since it would fail; the user may want it moved in the router or the task wording changed.
2. The lock test does not cover `Create`'s lock (by design); the unknown-user answer for the six methods is not tested.
3. `requireJSON` rewrites the request's `Content-Type` to lower case so Echo's binder accepts `Application/JSON`. It works and is tested, but it mutates the request.
