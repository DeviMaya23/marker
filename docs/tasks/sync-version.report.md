# Verification report: sync version (back end)

**Branch:** `claude/sync-version-verifier-f017ht` (verified code: builder branch `claude/sync-version-s0pa6k` at `a63eff2`)
**Result:** no Blocking findings.

## Commands run

- `make check`: passed (needed `npm ci` in `frontend/` first). Only openapi lint warnings (tag descriptions), none from this task.
- `make test-integration-local`: **run, passed** (PostgreSQL 16). The prompt expected integration tests could not be run by the verifier; the local script started a database fine, so they were run. CI uses 17; not run there.

## Acceptance criteria

| Criterion | Test | Real check? | Status |
|---|---|---|---|
| Usecase: `ErrRecordNotFound` → `ErrUnauthenticated` | `TestSyncService_Version/user row gone…` | Yes. With the mapping disabled it fails. | Met |
| Usecase: other error returned as is | `TestSyncService_Version/any other store error…` | Yes, also asserts not `ErrUnauthenticated`. | Met |
| Handler: 200, `application/json`, `{"version":7}` / `{"version":0}` | `TestGetSyncVersion_OK` (2 rows) | Yes. `JSONEq` against `{"version":0}` proves the key is present. Returning 0 for the value fails the "a number" row. | Met |
| Handler: spy gets session user id | `TestGetSyncVersion_OK` (`callerID`) | Yes. | Met |
| Handler: `ErrUnauthenticated` → 401 problem | `TestGetSyncVersion_Errors/user gone is 401` | Yes (status, code and media type via `requireProblem`). | Met |
| Handler: unclassified error → 500 `internal_error` | `TestGetSyncVersion_Errors/unclassified…` | Yes. | Met |
| No cookie → 401, spy not called | `TestGetSyncVersion_NoCookie` | Yes (`calls == 0`). | Met |
| `?version=5` plus extra header → same 200 | `TestGetSyncVersion_IgnoresQueryAndHeaders` | Yes for the body and user id. "Spy receives only the user id" is true by the interface, so it adds nothing. | Met |
| Reuses `authFor` / `callerID`, no second helper | `sync_test.go` | Yes. | Met |
| Router test probes a stub (`/favicons/<uuid>` → 501) | `TestRouter_APIRequiresASession/valid session reaches the handler` | Yes. | Met |
| Repo: new user is 0 | `TestUserRepository_Version/new user is zero` | Yes (integration only). | Met |
| Repo: +1 for each of 10 writes, one subtest each | `…/increments by one: <write>` | Yes. Dropping the bump in `RecordFetchFailure` fails exactly that subtest. | Met |
| Repo: no increment for empty trash with nothing, or a refused write | `…/no increment: …` | Yes. | Met |
| Repo: isolation (NFR-7), random id → `ErrRecordNotFound` | `…/isolation…`, `…/unknown user…` | Yes. | Met |
| Repo: two reads equal | `…/reading does not write` | Weak: it could not fail unless the read wrote. Fine for the criterion. | Met |
| `make check` passes | run above | n/a | Met |
| Nothing outside allowed paths changed | diff vs `9b69fca` | Only `backend/**` (not `migration/`, not `internal/api/`) and `docs/tasks/sync-version.plan.md`. | Met |

NFR-2 (server half): met via the criteria above.

**Depend only on integration tests:** all repository criteria (new user 0, the 10 increments, no-increment cases, isolation, read-does-not-write). The unit tests cover everything else.

## Plan check

- Every criterion is in the plan. Nothing missing.
- Every ticked item has a test and it checks the behavior.
- Plan test names do not match the code: `TestUserVersion` is really `TestUserRepository_Version`; `other error is unchanged`, `read does not write` and `user row gone` are worded differently; the plan says `Select("version").Scan(...).Limit(1)` but the code puts `Limit(1)` before `Scan`. Non-blocking.
- The plan ticks the integration run but records no result. I ran it (see above).
- The plan says the repository tests do not use `userVersion` and reuse `newBookmark`/`newFolder`. Both match the diff.
- Plan and diff agree otherwise (wiring, four `NewServer(` call sites, shared `userRepo` in `main.go`).

## Rule checks

- Only `handler/` imports `internal/api`: yes (grep).
- Repository queries filter by user id: `Version` filters `id = ?` on `users` (the user's own row, so there is no `user_id` column). One query: `SELECT version … WHERE id = ? LIMIT 1`, no lock, no write, no join.
- `users.version` incremented in every write transaction: no `bumpUserVersion` call added or removed (diff has no change to the repository files other than `user.go`). The ten write paths are covered by subtests.
- `go.mod` (`go 1.26.0`, no toolchain line), `go.sum`, `openapi.yaml`, `oapi-codegen.yaml`, generated code, migrations, Makefile: untouched.
- Usecase maps only `gorm.ErrRecordNotFound`; the handler returns no 404 for this operation.
- `NewServer(` call sites: four tests pass `nil` for the sync argument, but none of them calls the sync route. `router_test.go`'s `newTestRouter` no longer hits `/sync/version`. No hidden nil dereference.
- Mutation checks (all reverted): `Version` returns a constant → 12 integration subtests fail. Not-found mapping disabled → usecase test fails. Handler value 0 → `TestGetSyncVersion_OK/a_number` and `…IgnoresQueryAndHeaders` fail. Bump removed from `RecordFetchFailure` → exactly `increments by one: RecordFetchFailure` fails.

## Tests added (in `repository/user_integration_test.go`)

- `no increment: folder update with no fields` (passes; pins the "not for `{}`" rule).
- `concurrent writes each count once, and another user polling is unaffected`: 12 concurrent bookmark creates by user A while user B reads 20 times; A's version is +12, B's unchanged. Passes (also with `-race -count=3`).

## Findings

### Blocking

None.

### Non-blocking

1. `BookmarkRepository.Update` with an empty `BookmarkUpdate{}` increments `users.version` (the "only when something changed" rule is held by `usecase/bookmark_update.go:57`, not by the repository). Unreachable through the API today; mentioned in case a later caller bypasses the usecase. Not changed.
2. Plan test names and `Limit/Scan` order differ from the code (see above).
3. The "spy receives only the user id" criterion is true by the interface, so that part of the test cannot fail.
