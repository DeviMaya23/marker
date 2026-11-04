# Verification report: search-api

**Branch:** `claude/search-api-task-8d7ryb-ag1e53` (this session's branch, reset to `origin/claude/search-api-task-8d7ryb` at 929069e, plus one test commit).
**Result:** no Blocking findings. 1 Non-blocking test gap found and closed with a test; 2 other Non-blocking notes.

## Runs

- `make check`: passed (after `npm ci` in `frontend/`). OpenAPI lint shows 7 pre-existing tag-description warnings, no errors.
- `make test-integration-local`: **run, passed**, PostgreSQL 16 (the local script's version; CI uses 17, not run here). All packages ok, including `repository` and `worker`.
- Speed (NFR-10), 1,000 live bookmarks with several KB of content each, `include_notes=true`: 51 rows in 13.6 ms (`keyword`), 13.6 ms (`lorem item`), 63.3 ms (`"dolor sit" -zzz`). Limit is 1 s.
- Mutation checks on `repository/bookmark_search.go`, each reverted afterwards (`git checkout`, tree clean):

| Mutation | Result |
|---|---|
| Remove `id DESC` tie-breaker | `Search_Ranking` and `QueryShape` fail |
| Note weight `'D'` → `'A'` | `Search_Ranking/title…above…note-only` and `QueryShape` fail |
| Remove `created_at DESC` | **Only `QueryShape` failed** (a text check of the SQL). Behavior tests passed. See N1; fixed with a new test, which now fails under this mutation |

## Criteria

| # | Criterion | Test (file) | Exercises the behavior? | Status |
|---|---|---|---|---|
| 1 | Cursor round-trip, same offset and fingerprint | `TestSearchCursor_RoundTrip` (domain/cursor_search_test.go) | Yes | Met |
| 2 | Fingerprint changes with q / include_notes / folder, not with surrounding whitespace | `TestSearchFingerprint` | Yes; inner-whitespace row shows trimming is only at the edges | Met |
| 3 | Cursor rejections (all listed cases, both directions) | `TestDecodeSearchCursor_Rejects` (19 rows), `TestSearchCursor_NotAcceptedByPlainDecoder` | Yes | Met |
| 4 | Store receives trimmed q, notes, folder, user, offset, limit+1 | `TestBookmarkService_List_Search_PassesQueryToStore` | Yes, asserts the fake's captured query | Met |
| 5 | limit+1 → limit items + cursor offset prev+limit; exact → none; none → empty non-nil | `…Search_Paging` | Yes | Met |
| 6 | Other-q, plain, trash cursor → ValidationError on `cursor` | `…WrongCursorIsRejected` | Yes | Met |
| 7 | Unknown folder: error returned, search never called | `…Search_UnknownFolder` | Yes | Met |
| 8 | No `q`: plain path unchanged | existing list tests, unmodified | Yes | Met |
| 9 | `q=go` reaches usecase; blank q is no query; 200/201 chars; multi-byte counted as characters | `TestListBookmarks_Query` (200/201 ASCII, `é`, emoji, with surrounding spaces) | Yes | Met |
| 10 | `trashed=true` with q / folder / both → 422; `include_notes` without q ignored; with q passed down | `TestListBookmarks_TrashedCombinations` (unchanged), `TestListBookmarks_PassesParametersDown` | Yes | Met |
| 11 | Check order (limit before q; q before cursor) | `TestListBookmarks_CheckOrder` | Yes | Met |
| 12 | Failures assert problem+json shape | `requireListProblem` | Yes | Met |
| 13 | Title / URL / content match; note only with `include_notes` | `Search_FieldsMatched` | Yes (integration) | Met |
| 14 | Ranking: title > content; title > note-only; ties by created_at then id | `Search_Ranking` | Title/content and note cases yes. The tie case could pass **without** `created_at` (UUIDs are time-ordered, rows were seeded oldest first) | Partly met → Met after my added subtest (N1) |
| 15 | Quoted phrase, `-word`, `or`, odd text (`" ( & ' :*`, injection, emoji), stop words only | `Search_QuerySyntax` (notes on and off) | Yes; also checks the table survives | Met |
| 16 | Stemming `running` → "How to run" | `Search_Stemming` | Yes | Met |
| 17 | Folder scope, three levels, not sibling or top | `Search_FolderScope` | Yes | Met |
| 18 | Trashed not found, restored found, pending found | `Search_TrashedAndPending` | Yes | Met |
| 19 | User isolation across a page boundary and with a folder (NFR-7) | `Search_UserIsolation` | Yes | Met |
| 20 | Paging 50/50/20, exact end, determinism | `Search_Paging` | Yes. Row order relies on `created_at`, same caveat as 14, now covered by the new subtest | Met |
| 21 | Speed under 1 s | `Search_Speed` | Yes, measured above | Met |
| 22 | No `bookmark_content` in the query | `Search_QueryShape` (captures SQL) | Yes, checks the generated SQL text | Met |
| 23 | `make check` passes; integration passes; nothing outside allowed paths | runs above; `git diff --stat` | | Met |

**Requirement IDs:** FR-9 (13, 14, 16), FR-10 (13, 14), FR-11 (17), FR-21 (18), NFR-7 (19, and `user_id` in every query), NFR-10 (21).

**Depend only on integration tests:** 13–22 (all repository behavior). Criteria 1–12 are unit tests.

## Plan check (`search-api.plan.md`, read after the above)

- Every acceptance criterion appears in the plan. None missing.
- Every ticked item has a test that exists. One does not fully check what the plan says: the tie-order item (plan: "ties by created_at then id desc") was ticked on a test that passes without `created_at`. Fixed by adding a subtest (N1).
- "Break ranking on purpose" ticked: I reproduced it myself; results above.
- Branch name in the plan (`claude/search-api-task-8d7ryb`) differs from the actual session branch (`…-ag1e53`). Cosmetic.
- Plan vs. diff: the diff matches the plan. 13 files, all in allowed paths. The plan's note about flaky frontend tests did not occur in my `make check` run.
- Judgment calls 1–12 are reasonable; none contradicts the task file.

## Rule checks (from the diff)

- Only `handler/` imports `internal/api`: yes (`grep` of the diff shows no other new imports).
- Every repository query filters by `user_id`: `Search` filters `user_id = ? AND deleted_at IS NULL`; the folder subtree helper filters folders by `user_id` in both steps of the recursion. The folder existence lookup is the existing user-scoped `GetFolder`.
- `users.version`: search is read-only, so no write transaction was added. Not applicable.
- `go.mod`, `go.sum`, `openapi.yaml`, `backend/internal/api`, migrations, `problem.go`, `router.go`, `server.go`, `domain/errors.go`: unchanged (empty diff against `origin/main`). No new dependency.
- Task "Verifier checks":
  - User text, folder ids and offset are bound parameters. The only spliced strings are two fixed constants (`searchVector`, `searchVectorNotes`) chosen by a boolean. Yes.
  - `websearch_to_tsquery('english', ?)`; no `plainto_tsquery`, `ILIKE` or hand-built tsquery anywhere in non-test code. Yes. `'english'` matches `refreshSearchVector`.
  - Notes: `setweight(to_tsvector('english', COALESCE(note,'')), 'D')` concatenated to the vector at query time. `search_vector` and the migrations are untouched. Yes.
  - Order is `ts_rank(...) DESC, created_at DESC, id DESC`. `OFFSET` appears only in `bookmark_search.go`; list and trash are still keyset. Yes.
  - Subtree SQL exists once (`inFolderSubtree`), used by list and search; existing list tests pass unchanged. Yes. (`folder.go`'s `subtreeOf` is a different query that returns folders; see plan call 9.)
  - `limit+1` row trimmed in the usecase; `items` never nil; offset bounded 0 to 100,000 in the decoder. Yes.
  - Fingerprint covers trimmed q, notes, folder; rejected in the usecase and in the handler pre-check (`TestListBookmarks_SearchCursor`: other q, notes flipped, other folder, no folder, plain cursor, search cursor to plain list and trash). Yes.
  - 501 branch for `q` removed; `ErrNotImplemented` untouched. Yes.
  - `q` length counted with `utf8.RuneCountInString` after trimming. Yes.
- Breaking inputs from the task list: `"`, `(`, `-`, `or`, `a:*`, `'; DROP TABLE…`, emoji, 200/201 characters (including multi-byte), padded q, flipped `include_notes` cursor, offset 100,000 empty page: all covered by existing tests, which pass. User with no bookmarks, folder of another user (404 through the user-scoped `GetFolder`), and a bookmark moved between pages (offset paging reads fresh data, no state to break) need no further test.

## Findings

### Blocking

None.

### Non-blocking

- **N1 (fixed by a test): `created_at` tie-breaker was not covered by behavior.** Removing `created_at DESC` from the ORDER BY kept every behavioral test green, because IDs are time-ordered and the tie tests inserted rows oldest first; only the SQL-text test `QueryShape` failed. Reproduce: delete `created_at DESC,` in `repository/bookmark_search.go` and run `make test-integration-local`. Added subtest `created_at decides before id when the newer row was inserted first` to `Search_Ranking` in `bookmark_search_integration_test.go`; it fails with the mutation and passes without it.
- **N2: next-page cursor can exceed the offset cap.** At offset 99,990 with limit 50 and more rows, the usecase encodes offset 100,040; the decoder rejects it, so the following request is `422 cursor invalid`. It would take over 100,000 matches for one user, far past NFR-4, so not reachable in practice.
- **N3: `ListBookmarksInput.IsSearch` trims `Query` again** though the handler already trims. Harmless duplication, deliberate per plan call 4.
