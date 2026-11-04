# Verification report: folders-api

Branch: `claude/folders-api-205txf-xiterk` (checked out from `origin/claude/folders-api-205txf`, commit 5c6282d).
Verdict: **no Blocking findings**; two Non-blocking.

`make check`: passed (exit 0) after `npm ci` in `frontend/`. Without `npm ci` the frontend lint step fails on a missing `@eslint/js`; that is the fresh-checkout case `AGENTS.md` describes. Redocly reports 7 tag-description warnings in `openapi.yaml`, which this branch does not touch.
Integration tests: **not run by me** (verifier cannot). The builder's plan says `make test-integration-local` ran and passed on PostgreSQL 16.15, not on 17; I have not confirmed that.
I added no tests and changed no source: the existing tests already pin every boundary I tried.

## 1. Acceptance criteria

"Real?" = would the test fail if the behavior were removed. U = unit, I = integration (not run by me).

| Criterion | Test | Real? | Status |
|---|---|---|---|
| Names: trim, empty→required, 100 pass/101 fail, multibyte, stored trimmed (FR-12, NFR-14) | U `TestFolderService_Names` (create and update rows, incl. spaces only, 100/101 `é`/`日`) | Yes, asserts field/code and stored name | Met |
| Create depth 2/3, depth-3 parent refused, other user's parent not found (FR-13, NFR-7) | U `TestFolderService_Create_Depth` | Yes (fake `Get` scopes by user; asserts nothing written) | Met |
| Update cycle (self, child, grandchild), depth boundaries, to top, cycle before depth (FR-13, FR-15) | U `TestFolderService_Update_CycleAndDepth` (10 rows + order subtest) | Yes; runs the real `domain.PlanMove` | Met |
| Absent vs null vs value; `name:null` invalid | U `TestFolderService_Update_ThreeStates` | Yes | Met |
| `{}` writes nothing; same/other-case name and current parent not conflicts (FR-26) | U `TestFolderService_Update_NoOpAndSelfNames` | Yes (asserts no store write, version 0) | Met |
| Delete returns store counts | U `TestFolderService_Delete` | Weak by design (pass-through); the real counts are an I test | Met (U) |
| Folder filter: other user's/unknown not found; store gets id | U `TestBookmarkService_List_FolderFilter` | Yes | Met |
| Handler success of each op, `parent_id:null`, 201, delete counts, `items: []` | `TestListFolders_Success`, `TestCreateFolder_Created`, `TestUpdateFolder_Success`, `TestDeleteFolder_Counts` | Yes, through the real router | Met |
| Handler request handling: unknown keys, missing name, `name:null`, 3 `parent_id` states | `TestCreateFolder_RequestHandling`, `TestUpdateFolder_RequestHandling` | Yes (body-key middleware is registered in `router.go`) | Met |
| Handler error mappings (404, 409, 2×422, validation) with problem+json | `TestFolderOperations_ErrorMappings` | Yes, per operation | Met |
| `listBookmarks`: folder alone, `q`+folder 501, trashed+folder 422, 404, cursor before folder | `TestListBookmarks_FolderFilter` | Yes | Met |
| Repo List: own folders, lower-case order, live direct count | I `TestFolderRepository_List` | Cannot run here | Met, I only |
| Repo Create: depth, case/root conflicts, different parents, delete race, version | I `TestFolderRepository_Create` | Cannot run here | Met, I only |
| Repo Update: rename, case rename, move depths, collision, cycle/depth on real tree, version, `{}` | I `TestFolderRepository_Update` | Cannot run here | Met, I only |
| Concurrency: two cycle moves, two same-name creates | I `…_ConcurrentCycle` (10 rounds), `…_ConcurrentSameName` (6 goroutines, root and under parent, mixed case) | Cannot run here; design is sound | Met, I only |
| Repo Delete: subtree gone, shared `deleted_at`, trashed untouched/uncounted, others untouched, version +1, lists, null `folder_id` | I `TestFolderRepository_Delete` | Cannot run here | Met, I only |
| Repo folder filter: depths 2–3, excludes siblings/top/trashed, order, paging (120 rows, limit 51 pages), other user | I `TestBookmarkRepository_List_FolderFilter` | Cannot run here | Met, I only |
| User isolation (NFR-7) | I `TestFolderRepository_OtherUser` + filter test; U not-found rows | Cannot run here | Met, I only |
| `make check` passes | run by me | — | Met |
| Nothing outside allowed paths | `git diff origin/main...HEAD --stat`: only `backend/**` (no `migration/`) and `docs/tasks/folders-api.plan.md` | — | Met |

Criteria that depend only on integration tests: all of the Repository section, plus FR-16 (delete semantics), FR-26 (index mapping at the top level), NFR-2 (version increments) and the concurrency guarantees.

## 2. Plan check

- Every criterion in the task file appears in the plan, in the same groups, all ticked. No criterion is missing.
- Every ticked item names a test that exists, and I read each one: they check the behavior (see table).
- Plan vs diff: no unexplained difference. Changes to `router_test.go` (folder routes were the stub examples; the CSRF test rows for the folder writes were dropped because that test expects 501 after CSRF passes) and to the list test (`…SearchAndFolderAreNotImplemented` → `…SearchIsNotImplemented`) are declared as judgment calls 12 and 13.
- The plan header names `claude/folders-api-205txf`; the session branch carries the `-xiterk` suffix. Cosmetic.

## 3. Rule checks

- Only `handler/` imports `internal/api` (grep, non-test files): yes.
- Every repository query filters by `user_id`: yes: `GetFolder`, `getFolderWithCount`, `subtreeOf` (start and every recursive step), the count subquery, the descendant-depth `UPDATE`, the bookmark trash `UPDATE`, the folder `DELETE`, the list filter's recursive query. `lockFolders` and `bumpUserVersion` address `users` by id, which is the user.
- Folder lock before reading the tree, `users.version` in the same transaction: yes for Create, Update, Delete. The empty update writes and bumps nothing, and the usecase never reaches the store for `{}`.
- `go.mod`/`go.sum`, `openapi.yaml`, `oapi-codegen.yaml`, `api.gen.go`, migrations, Makefile: untouched. No new dependency.
- Request-body check reused (`recordBodyKeys`, `bodyKeysFrom`, `fieldOf`), not copied.
- Depth arithmetic (code, not only tests): `PlanMove` uses `newDepth + height - 1 > 3` with `height = deepest - folder.Depth + 1`. Depth-3 chain under a non-top folder: refused; single folder under depth 2: ok, under depth 3: refused. Cycle check iterates the subtree, which includes the folder itself, so self/child/grandchild are covered, and it runs before depth. It is re-run in the store under the lock.
- Sibling names: enforced by `folders_sibling_name_key` (lower-cased, root coalesced to a zero UUID) and mapped from the violation by constraint name; a folder's own row is not a collision for itself.
- Delete: one `UPDATE … SET deleted_at = now()` statement (one value), `deleted_at IS NULL` filter (trashed untouched, uncounted), then the folder delete; the foreign key nulls `folder_id`, including for already-trashed bookmarks.
- List filter: applied only in live mode; check order in the handler is limit, trashed combos, cursor, `q` 501, then the folder 404 in the usecase.
- Sources of `bookmark_count`: live, direct only.

## 4. Findings

### Blocking
None.

### Non-blocking
1. **Lock order differs from the bookmark writes.** Folder writes take the `users` row lock first, then touch bookmark rows (`Delete` updates them; a bookmark folder move takes a key-share lock on the folder). `Update`/`Trash` in `bookmark_update.go`/`bookmark_trash.go` update the bookmark row first and `bumpUserVersion` last. A bookmark edit and a folder delete that overlap on the same bookmark could deadlock; Postgres aborts one, which surfaces as a 500. Not reproduced and not in a task requirement; I could not run a database. Worth a backlog item.
2. **Case-insensitivity of names is the database's `lower()` under its default collation.** ASCII is exact; other scripts depend on the collation (judgment call 8 already notes this).

Also noted, no action: the CSRF test no longer lists the folder write routes. CSRF is router-wide middleware and the account/logout rows still cover it.
