# Verification report: get favicon (back end)

Branch: `claude/get-favicon-49x88t-9rp0iz` (this session's branch, reset to the builder's `claude/get-favicon-49x88t` at `bf9fd25`; the verifier commit sits on top).

Verdict: **no Blocking findings.** Source was not changed; no test was added (see "Findings").

`make check`: passed (exit 0) after `npm ci` in `frontend/` (a fresh checkout has no `node_modules`; the first run failed only on that). Go unit tests, `go vet` including the `integration` tag, 747 frontend tests, build and `openapi-lint` (7 existing tag-description warnings, none from this task).

## Criteria

| # | Criterion | Test | Exercises the behavior? | Status |
|---|---|---|---|---|
| U1 | Five served types return same type and bytes | `TestFaviconService_Get_ServedTypes` (usecase) | Yes: compares served type and bytes per row | Met |
| U2 | `image/vnd.microsoft.icon` becomes `image/x-icon` | same table, last row | Yes: mutation "drop alias" fails it | Met |
| U3 | `image/svg+xml`, `text/html`, `IMAGE/PNG`, `""` give `ErrRecordNotFound` and no favicon | `TestFaviconService_Get_NotServableIsNotFound` | Yes: `ErrorIs` plus empty `domain.Favicon{}` | Met |
| U4 | Store receives caller's user id and favicon id | `TestFaviconService_Get_PassesTheCallersIDs` | Yes: two distinct uuids, a swap would fail | Met |
| U5 | Non-not-found store error is not turned into not-found | `TestFaviconService_Get_OnlyNotServableBecomesNotFound` | Yes: `ErrorIs` boom and `NotErrorIs` not-found | Met |
| H1 | Five types: 200, Content-Type, body, Content-Length, exact Cache-Control, ETag present | `TestGetFavicon_OK` | Yes: all asserted exactly; mutation on Cache-Control fails it | Met |
| H2 | ETag form and value from the rule (computed independently) | `TestGetFavicon_ETag/form and rule` | Yes: `wantETag` in the test uses `crypto/sha256` itself; regex checks form | Met |
| H3 | Same input same ETag; byte change differs; type change differs | `TestGetFavicon_ETag` subtests | Yes: dropping the type from the hash fails it | Met |
| H4 | Spy gets session user id and path id | `TestGetFavicon_PassesSessionUserAndPathID` | Yes: `callerID` and a random path id | Met |
| H5 | `If-None-Match` (own ETag, `*`) and `Range` still give full 200 | `TestGetFavicon_IgnoresConditionalAndRangeHeaders` | Partly structural: the generated request object has no header params, so the handler cannot see them. The test is correct, and a 304 mutation is not expressible in the handler; it would pass only if the handler stayed unaware. Fine. | Met |
| H6 | Spy not-found gives 404 `not_found` | `TestGetFavicon_Errors/not found is 404` | Yes | Met |
| H7 | Unclassified error gives 500 `internal_error` | `.../unclassified error is 500` | Yes | Met |
| H8 | Type with no response gives 500, body not the image | `.../a type with no response is 500...` | Yes: status, code and `NotContains` body | Met |
| H9 | No cookie: 401, spy not called | `TestGetFavicon_NoCookie` | Yes: `spy.calls == 0` | Met |
| H10 | Malformed id: 400, spy not called | `TestGetFavicon_MalformedID` | Yes | Met |
| H11 | Reuses `authFor`/`callerID`, no second helper | `favicon_test.go` | Yes: only `faviconSpy`, `faviconRouter`, `wantETag` are new | Met |
| R1 | Router probe replaced with `DELETE /api/v1/account` + session + CSRF, comment updated | `TestRouter_APIRequiresASession` | Yes: putting the old favicon probe back fails (nil pointer panic) | Met |
| DB1 | `Find` returns type and bytes byte for byte | `TestFaviconRepository_Find_ReturnsStoredBytes` | Uses `0x00 0xFF 0x89`; **integration only** | Met (not run by me) |
| DB2 | Another user's id and a random id give `ErrRecordNotFound`; owner can still read | `TestFaviconRepository_Find_IsolatedPerUser` | Yes by reading; **integration only** | Met (not run by me) |
| DB3 | Overwrite from same host: same id returns new bytes | `TestFaviconRepository_Find_SeesOverwrittenBytes` | Also asserts same row id; **integration only** | Met (not run by me) |
| DB4 | `Find` does not change `users.version` | `TestFaviconRepository_Find_DoesNotChangeUserVersion` | Yes by reading (`userVersion` before/after); **integration only** | Met (not run by me) |
| W1 | `make check` passes | — | Run above | Met |
| W2 | Nothing outside allowed paths changed | `git diff origin/main...HEAD --name-only` | Only `backend/**` (no `migration/`, no `internal/api/`) and `docs/tasks/get-favicon.plan.md` | Met |

Requirements: FR-5 (server half) is covered by U1–U5, H1–H3 and DB1/DB3; NFR-7 by DB2 (integration only) plus the repository query's `user_id` condition.

## Plan check

- Every acceptance criterion appears in the plan; none is missing.
- Every ticked item names a test that exists and, by the table above, checks the behavior.
- Plan vs diff: no difference found. The plan's repo-wide line "`make test-integration-local` run and result reported" is ticked, but the plan itself records the result only in the judgment calls ("PostgreSQL 16"), not "run, passed". I did not rerun it (verifier cannot). Non-blocking.
- The judgment calls listed in the plan match the code (`If-None-Match: *` covered, inline store interface, `slog.Warn` with id and type).

## Rule checks

- Only `handler/` imports `internal/api`: yes. `repository/` and `usecase/` do not import it.
- Every repository query filters by `user_id`: `FaviconRepository.Find` uses `id = ? AND user_id = ?`. Single `First`, no second query, no `FOR UPDATE`, no write.
- `users.version`: `Find` is a read and does not call `bumpUserVersion`; no write transaction is added by this task, so there is nothing to increment.
- `go.mod`, `go.sum`: untouched (`git diff origin/main...HEAD` shows no change); no new dependency; `openapi.yaml`, `oapi-codegen.yaml`, `api.gen.go`, migrations, `RecordFetchSuccess` untouched.
- Usecase alone decides servable types and the alias; the handler only switches on the five normalized types and returns a plain `fmt.Errorf` (500) otherwise; it never returns 404 itself.
- Not-found vs other user: repository returns the same `gorm.ErrRecordNotFound`; no branch, message or log in usecase or handler looks at the owner. The `slog.Warn` only fires after a successful owner-scoped read.
- Every `NewServer(` call site passes four arguments (`main.go` and the five test files). The tests that pass `nil` for `favicons` never call the favicon route, except `router_test.go`, which no longer probes it.
- Mutations (revert after each; tree clean at the end):
  - delete the alias mapping: `TestFaviconService_Get_ServedTypes` fails.
  - change the `Cache-Control` string: `TestGetFavicon_OK` fails.
  - leave the type out of the ETag (two ways): `TestGetFavicon_ETag` fails.
  - old favicon probe back in the router test: fails.
  - 304 on matching `If-None-Match`: not expressible, the generated request object carries no headers.
  - drop the `user_id` condition from `Find`: **not run**, the isolation test is integration-only. By reading, `DB2` would fail (`other.ID` would find the row).

## Findings

### Blocking

None.

### Non-blocking

1. Criteria DB1–DB4 depend only on integration tests, which I cannot run; they exist, are tagged `integration`, import only `domain`, `repository` and `testutil`, and `go vet -tags integration ./...` compiles them. The user should rely on the builder's recorded run (PostgreSQL 16) or run `make test-integration-local`.
2. Break-it cases: another user's id and a never-stored uuid (both `ErrRecordNotFound`, DB2); a row edited to `image/svg+xml` (usecase test `NotServable` covers the same mapping, 404 plus warn; no DB-level test); `If-None-Match: *` (covered by H5); two bookmarks of one host fetched in turn (DB3). Boundary and concurrency: there is no size or count limit in this route to probe, malformed id is covered (H10), and a read-only single-row query has no write race to exploit. I found no failing input, so I added no tests.
3. The `slog.Warn` for a non-servable type is not asserted by any test; the task file does not require it.
4. The plan's integration line says only "PostgreSQL 16" and not "run, passed".

## Integration tests

Exist (all `//go:build integration`, `backend/internal/repository/favicon_integration_test.go`): `TestFaviconRepository_Find_ReturnsStoredBytes`, `_IsolatedPerUser`, `_SeesOverwrittenBytes`, `_DoesNotChangeUserVersion`. Not run by the verifier. Criteria DB1–DB4 are covered only by these.
