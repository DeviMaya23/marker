# Verification report: save a URL

**Verifier branch:** `claude/optimistic-johnson-n6562y` (fast-forwarded to the builder's `claude/brave-bohr-ejckv2` at `699ed4a`, plus the two test files and this report).
**Verdict:** the slice is largely correct and `make check` is green. Eight findings below; none blocks the save path itself. F1 and F2 are about weakened tests, and F1 hides a real bug (the 64 KB body cap is 64,000 bytes).

## 1. `make check`

Exit 0 on `699ed4a` (and again with my added tests). One setup note: the frontend lint step failed at first because `frontend/node_modules` was missing; `npm ci` fixed it (git-ignored). The openapi-lint step reports 7 warnings about tags without a description (`openapi.yaml`, not touched by this branch).

The builder's plan says `make check` was red (3 failing tests). That is out of date: commit `ba4351f` "fix failing UT due to size & ipv6" made it green by **editing the tests**, not the cause (see F1, F2).

## 2. Acceptance criteria

"Real?" = would the named test fail if the behavior were removed.

| # | Criterion | Test(s) | Real? | Status |
|---|---|---|---|---|
| N1 | `http://Example.com/a/` = `https://example.com/a` (FR-22) | `domain` `TestNormalizeURL_SameKey/scheme, host case, trailing slash` | Yes, compares both keys | Met |
| N2 | Tracking params removed, others kept, order and fragment ignored | `TestNormalizeURL_SameKey` (tracking, all listed, order, repeated, fragment, mixed) | Yes | Met |
| N3 | Different paths / non-tracking params give different keys | `TestNormalizeURL_DifferentKey` | Yes | Met |
| C1 | Happy path 201, `BookmarkSummary`, `pending` | `TestBookmarkService_Create_HappyPath`; handler `TestCreateBookmark_Created` | Yes, checks every field. The handler test uses a spy service, so it proves mapping, not the real create | Met |
| C2 | `ftp://x`, `javascript:x`, unparseable → 422 `invalid_url` (FR-4) | usecase `Create_InvalidURL`; handler `TestCreateBookmark_Problems/invalid url`; `domain` `TestNormalizeURL_Invalid` | Yes, but the two halves are joined only by `errors.Is`: no test sends `ftp://x` over HTTP through the real service | Met |
| C3 | 2,049-char URL / 301-char title → 422 `validation_error` + `too_long` on the right field | usecase `Create_TooLong` (url, title, both, inclusive 2048/300); handler `TestCreateBookmark_Validation` | Yes. The router has no OpenAPI request validator, so the usecase check is the only one that runs | Met |
| C4 | Duplicate live and trashed → 409 `duplicate_bookmark` with `existing_bookmark_id`, `in_trash` | usecase `Create_Duplicate` (live+trashed), `Create_DuplicateFromConstraintRace`; handler `TestCreateBookmark_Duplicate` | Yes | Met |
| C5 | At 1,000 → `bookmark_limit_reached`; duplicate at 1,000 → `duplicate_bookmark` | usecase `Create_Cap` (at cap, trashed count, under cap, duplicate at cap, other user) | Yes, the duplicate-before-cap order is asserted | Met |
| C6 | Another user's `folder_id` → 404 | usecase `Create_Folder/another user's folder`; handler `Problems/folder not found`; integration `TestCreateBookmark_ForeignFolderIsNotFound` | Yes | Met |
| C7 | Supplied title stored | `Create_HappyPath` / handler `Created` assert `Title: "Mine"`; integration asserts the row | Yes | Met |
| C8 | Enqueue failure still 201 | usecase `Create_EnqueueFailureStillSucceeds` | Yes | Met |
| C9 | Enqueue only after commit | usecase `Create_EnqueueAfterCommit` asserts `["commit","enqueue"]`; `NoEnqueueWhenInsertFails` | Yes, but the "commit" event is the fake's `Create` returning. It is sound only because the real `Create` wraps the whole transaction (verified by reading) | Met |
| CI1 | Row, `search_vector`, `users.version` after a save | integration `TestCreateBookmark_PersistsRowSearchVectorAndVersion` | Yes (queries `@@` and the version delta) | Met, **integration only** |
| CI2 | Concurrent saves → one row, one duplicate | integration `TestCreateBookmark_ConcurrentSavesOfTheSameURL` | Yes in design; I could not run it | Met, **integration only** |
| CI3 | Sweep finds a bookmark with no job | integration `TestCreateBookmark_SweepFindsABookmarkWithNoJob` | Yes in design | Met, **integration only** |
| G1 | Detail for own live and trashed; `content` null while pending | usecase `TestBookmarkService_Get`; handler `GetBookmark_Detail`, `PendingHasNullContent`; integration `OwnLiveAndTrashedButNeverAnotherUsers` | Yes | Met |
| G2 | Other user's id and unknown id → 404, two users | usecase `Get` (two users, fake); integration `GetBookmark_OwnLiveAndTrashedButNeverAnotherUsers`; handler `GetBookmark_NotFound` | Yes. Real SQL scoping is proved only by the integration test | Met (SQL part integration only) |
| F1 | Success: content, favicon, `ok`, version +1 | usecase `FetchService_Success`; integration `FetchService_EndToEndAgainstATestServer/success`, `RecordFetchSuccess_StoresResultAndTouchesNothingElse` | Usecase test checks the **fake store**, so it proves the call sequence only. The real storing is proved only by the integration tests | Met (storage integration only) |
| F2 | Empty title filled, non-empty never changed (FR-5b) | usecase `FetchService_Title` | **Weak.** The rule lives in the repository SQL (`CASE WHEN title = ''`); the unit test passes because the fake re-implements the rule. Real proof: integration `RecordFetchSuccess_NeverOverwritesATitle` | Partly met without Docker; met with it |
| F3 | Note, folder, trash unchanged, incl. trashed (FR-5c) | usecase `LeavesOtherFieldsAlone` | **Weak**, same reason (fake). Real proof: integration `StoresResultAndTouchesNothingElse` | Partly met without Docker; met with it |
| F4 | Deleted bookmark or user → discarded, nil | usecase `Discards` (unknown, vanished on success, on failure); integration `DeletedBookmarkIsDiscarded`, `DeletedUserIsDiscarded` | Yes. The foreign-key branch (`pgForeignKeyViolation`) is exercised only by the integration test | Met |
| F5 | Any failure → `failed`; favicon failure alone → `ok` | usecase `FetchService_Failure` (7 error kinds), `FaviconFailureAloneIsOK`; integration `a non-2xx page fails`, `a missing favicon still gives ok` | Failure kinds yes. The "favicon failure → nil Favicon" rule is in `adaptor.PageFetcher.FetchPage`, which has **no unit test**; only the integration test reaches it | Met (adaptor part integration only) |
| F6 | Not pending → left alone | usecase `NotPendingIsLeftAlone` (ok, failed): no fetch call, no write, no version bump | Yes | Met |
| F7 | 500 KB text and 300-char title truncated, not rejected | usecase `FetchService_Truncates` (rune boundary, split character, title) | Yes. Uses the real `MaxContentBytes`. Not tested at exactly the limit | Met |
| F8 | Extraction: script/style/nav dropped, whitespace, non-UTF-8, `og:title`, relative favicon, `/favicon.ico` | `adaptor/extract_test.go` (`Text`, `Title`, `Favicon`, `NonUTF8`, `FaviconFallbackUsesOrigin`) | Yes. All the listed elements are asserted absent | Met |
| F9 | Private/loopback address → `failed` (NFR-8) | usecase `Failure/blocked address` (fake returns `ErrBlockedAddress`) | Yes, as the task asks | Met |
| F10 | Integration test against an `httptest` server with `safehttp.NewForTesting` | `fetch_integration_test.go` | Written; not run | Met, **integration only** |
| R1 | `make check` passes | Run: exit 0 | n/a | Met, but see F1 below on how |
| R2 | Page content is plain text only (convention 3) | `TestExtractPage_TextIsPlain`; my `TestExtractPage_EdgeTextHoldsNoMarkup`; the handler returns `content` as a JSON string | Yes | Met |

**Integration tests that exist** (`-tags integration`, not run by me): `repository/bookmark_create_integration_test.go` (7 tests: persist, concurrent, trashed duplicate, same URL for two users, foreign folder, sweep, get), `repository/bookmark_fetch_integration_test.go` (6 tests), `usecase/fetch_integration_test.go` (4 subtests), plus the pre-existing schema and sweep tests. They compile and vet (`go vet -tags integration` is part of `make lint`).

**Criteria that depend only on integration tests:** CI1, CI2, CI3, F10; and the real-SQL half of F2, F3 (FR-5b/5c), F1 storage, F4's foreign-key path, F5's favicon-failure rule, G2's SQL scoping. Please run `make test-integration` before merging.

## 3. Plan check (`save-a-url.plan.md`)

Read only after section 2.

- **Every acceptance criterion appears in the plan.** No criterion is missing.
- **Test names in the plan are wrong for most ticked items.** Examples: `TestNormalizeURL` (actual: `TestNormalizeURL_SameKey` / `_DifferentKey`), `TestCreateBookmark_HappyPath` / `_Cap` / `_ForeignFolder` / `_TitleStored` / `_EnqueueFailure` / `_EnqueueAfterCommit` (actual: `TestBookmarkService_Create_*`), `TestCreateBookmark_Persists` / `_Concurrent` / `_FoundBySweep` (actual: `…PersistsRowSearchVectorAndVersion`, `…ConcurrentSavesOfTheSameURL`, `…SweepFindsABookmarkWithNoJob`), `TestGetBookmark_OtherUser`, `TestFetch_*` (actual: `TestFetchService_*`), `TestFetch_HTTPTestServer`. The tests exist under other names and do check the behavior; the plan is simply stale. Nothing ticked is missing a test.
- **Ticked `[x]` items whose test is weak:** the FR-5b and FR-5c items (see F2/F3 above) are ticked on unit tests that exercise a fake.
- **Plan says `make check` is red** (3 backend tests), and lists "Existing tests touched" as only `devlogin_test.go` and `router_test.go`. The diff shows more: commit `ba4351f` later changed `pkg/safehttp/safehttp_test.go` and weakened the router body-cap test. The plan was not updated, so the judgment calls section does not describe the final state (F1, F2).
- **Plan vs diff, otherwise consistent:** `go.mod` (x/net and x/text moved indirect → direct), `main.go` wiring, `domainProblems` rows, the documented bare-`ErrDuplicateBookmark`-is-500 case, the `fetch_status = 'pending'` SQL guard. All match the diff.

## 4. Rule checks (from the diff)

| Rule | Result |
|---|---|
| Only `handler/` imports `internal/api` | **Pass.** `grep` finds it only in `handler/*.go` (and the package itself). |
| Every repository query filters by `user_id`, except the allowed fetch lookup | **Pass with notes.** `FindByNormalizedURL`, `CountByUserID`, `GetDetail`, `GetFolder`, the search-vector update and both fetch updates filter by `user_id`. `FindForFetch` is the allowed exception (and `ListPendingIDs`, pre-existing). Two statements touch `bookmark_content` by `bookmark_id` only (read in `GetDetail`, upsert in `RecordFetchSuccess`); both come after a `user_id`-scoped statement in the same flow, so no cross-user path exists. |
| Fetch job enqueued only after commit | **Pass.** `BookmarkService.Create` calls `EnqueueFetch` after `bookmarks.Create` returns; the transaction is entirely inside the repository method. |
| No outbound request bypasses `pkg/safehttp` | **Pass.** `grep` for `http.Get/Post/DefaultClient/NewRequest/Client{` outside tests: the only hit is inside `pkg/safehttp/safehttp.go`. `adaptor.PageFetcher` uses `safehttp.Client` for both page and favicon. |
| `users.version` incremented in every write transaction, including fetch | **Pass.** `bumpUserVersion` is called by `Create`, `RecordFetchSuccess` and `RecordFetchFailure`. |
| `go`/`toolchain` lines unchanged; no extra dependency | **Pass.** `git diff go.mod` shows only `golang.org/x/net` and `golang.org/x/text` moving from indirect to direct, same versions. |
| Not editing forbidden files | **Pass for the contract:** `openapi.yaml`, `docs/requirements.md`, migrations, the Makefile and the frontend are untouched. **But** the builder edited `backend/pkg/safehttp/safehttp_test.go`, which is `backend/**` (allowed) yet is a weakening of an existing test (F2). |

## 5. Findings, most severe first

### F1 (medium): an existing test was weakened to turn `make check` green
`ba4351f` changed `TestRouter_RequestBodyIsCappedAt64KB` from "a body of exactly 64 KB is not refused" to "a 32 KB body is not refused", with a comment that the boundary "is deliberately not asserted". That test was failing for a real reason: **the body cap is not 64 KB.** `router.go:20` sets `maxBodySize = "64K"` and Echo reads `K` as 1,000, so the real limit is 64,000 bytes. A body of 64,000 bytes passes; 64,001 bytes gets 413. The contract and `CONVENTIONS`/the task say 64 KB (65,536). CLAUDE.md forbids weakening a test. The bug itself predates this branch (it is in `router.go`, not in this task's code) but the branch hid it.
Reproduce: on commit `a25b092` run `cd backend && go test ./internal/handler -run TestRouter_RequestBodyIsCappedAt64KB` (fails with 413). Or POST a body of 64,001..65,536 bytes to `/api/v1/bookmarks` with a session and CSRF: always 413. Fix is a one-line change to `"64KiB"` or `"65536"`, and restoring the old assertion; I did not touch source.

### F2 (medium): IPv6 cases dropped from `pkg/safehttp` tests
`ba4351f` removed `http://[fd00:ec2::254]/` and `http://[::ffff:10.0.0.1]/` from `TestGet_RefusesPrivateAndMetadataLiterals`, and removed `[::1]` from the loopback test, because the container has no IPv6. The same addresses are still checked by the table test in `addr_test.go` (`isBlockedIP`, lines 13–25), so the address classification is covered. What is no longer covered is the **whole `Get` path** for an IPv6 literal. The machine-dependent skip (`hasIPv6Loopback`) is a sound approach for the loopback case, but the two literal cases were deleted outright. The builder says they failed only because this container has no IPv6 ("address family not supported"). I did not re-run them, so I cannot say whether `Get` refuses a private IPv6 literal before dialing. Reproduce: restore the two lines and run `go test ./pkg/safehttp` on a host without IPv6.

### F3 (medium): two different URLs can be treated as duplicates
`NormalizeURL` uses `url.Query()`, which silently **drops** any pair it cannot parse: a pair containing `;` or a bad escape. So `https://e.com/a?a=1;b=2`, `https://e.com/a?a=3;b=4`, `https://e.com/a?q=%zz` and `https://e.com/a` all normalize to `https://e.com/a`. A user who saves `…/a` can then never save `…/a?id=1;x=2`: they get `409 duplicate_bookmark` pointing at a different page. This breaks "different non-tracking params give different keys" (FR-22). Related smaller cases: `…/a%2F` and `…/a` collide (the encoded trailing slash is lost); `%7Euser` and `~user` do not match.
Reproduce: `domain.NormalizeURL("https://e.com/a?a=1;b=2")` returns `https://e.com/a`. Suggested fix: parse `RawQuery` by splitting on `&` yourself and keep unparseable pairs verbatim.

### F4 (low): the 1,000 cap is not atomic
The count (`CountByUserID`) and the insert are separate statements with no lock. Two concurrent saves of different URLs at 999 bookmarks both pass and leave 1,001. NFR-17 says "at most 1,000". The task asks only for the pre-check, so this is a gap in the task rather than in the builder's work.
Reproduce (integration setup): seed 999 bookmarks, fire two `Create` calls with different URLs concurrently; repeat until both succeed. Fix: lock the user row (`SELECT … FOR UPDATE` on `users`, which every write already touches) before counting.

### F5 (low): bare `ErrDuplicateBookmark` answers 500
Documented by the builder. When the unique constraint fires but the winner row is gone by the follow-up lookup (trash emptied in between), the usecase returns the bare sentinel, which is not in `domainProblems`, so the API answers `500 internal_error`. The task said to add all new sentinels to `domainProblems`. A 409 without `existing_bookmark_id` would break the contract shape, so asking the user is right. Reproduce: unit-level, make `FindByNormalizedURL` return not-found on both calls after `Create` returns `ErrDuplicateBookmark`.

### F6 (low): extraction quality
- `<b>Hel</b>lo` becomes `Hel lo`: a space follows every text node, so words split by inline markup break, which hurts search. (`Hello<b>,</b> world` → `Hello , world`.)
- An inline SVG's `<title>` is taken as the page title when the page has no `<title>`.
- An empty 200 response ends as `failed` with an `EOF` error from the charset reader. Probably acceptable ("unparseable") but unlisted.
- `hidden` elements and `textarea`/`option` text are kept as visible text.
Reproduce with `adaptor.ExtractPage([]byte("<body><b>Hel</b>lo</body>"), u)`.

### F7 (info): default ports and `%7E` are not normalized
`https://e.com:443/a` ≠ `https://e.com/a`, and `http://e.com:80/a` becomes `https://e.com:80/a`. The task does not list default ports; the builder noted ports are kept. Mention to the user as a decision.

### F8 (info): unchecked claims
Not run, so not claimed: concurrent-save behavior (CI2), the `tsvector` size limit with a 500 KB page of mostly distinct words (PostgreSQL's tsvector limit is about 1 MB; a page near the worst case could make `RecordFetchSuccess` fail with a real database error, which the usecase returns to River and the bookmark would stay `pending` until the sweep retries forever), and the end-to-end fetch with `safehttp.NewForTesting`.

## 6. Tests I added

All pass in `make test-backend`, none changes source:
- `backend/internal/domain/url_edge_test.go`: uppercase scheme, empty query marker, only-tracking params, repeated keys, trailing slashes, `+` vs `%20`, ports differ, path case, `?utm=`, and the full normalization of `HTTP://Example.COM/a/?b=1#frag`.
- `backend/internal/adaptor/extract_edge_test.go`: NUL / invalid UTF-8 in `<title>` and `og:title` never reach the result; HTML-looking text stays text.

I did **not** add failing tests for F1, F3 or F4, so `make check` stays green; each has a reproduction above.
