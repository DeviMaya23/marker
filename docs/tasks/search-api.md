# Task: search (back end)

> One backend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> **Prerequisite:** `backend-hardening` is merged (every write holds the user lock first; the generic 500 uses the contract's `internal_error`). Start from the current `main`. The contract needs no change: `q`, `include_notes` and `folder_id` already exist on `listBookmarks`. If something here contradicts `openapi.yaml`, stop and ask; do not edit it.

## Goal

A signed-in user can search their live bookmarks by title, URL and page content, optionally also by note, optionally inside one folder and its subfolders, and read the matches best first, a page at a time. This is the server half of search; the search field in the top bar is a later front-end task.

Requirements covered: FR-9 (search by title, URL and content, ranked by relevance), FR-10 (notes included on request, excluded by default), FR-11 (scope to a folder and its subfolders, or all), FR-21 (trashed bookmarks are not found), NFR-7 (another user's bookmarks never appear), NFR-10 (results within 1 second at the scale of NFR-4).

Out of scope, and why:

- The search box, scope control and "include notes" toggle in the UI: the front-end task that follows this one.
- Highlighted snippets, "did you mean", typo tolerance, partial-word (prefix) matching: whole words only, by decision.
- Searching the trash (the contract forbids `trashed=true` with `q`; that check already exists).
- Any change to the contract, the migrations, how `search_vector` is built, or the sync/favicon operations.
- A new index. At hundreds of bookmarks per user (NFR-4) the user filter narrows the rows first; see "Known gaps".

## Role and ownership

Role: Backend (see `AGENTS.md`).

You may change `backend/**` except `backend/migration/` and `backend/internal/api/` (generated). You may not change `openapi.yaml`, `oapi-codegen.yaml`, `docs/**` (except your own plan file, `docs/tasks/search-api.plan.md`, see `AGENTS.md`), `CONVENTIONS.md`, the frontend, migrations or the Makefile. You need no migration: `search_vector` and its GIN index exist. If you think you need one, stop and ask.

**Shared files.** No other backend task runs now; the front-end task that runs at the same time touches only `frontend/**`. You change `handler/bookmarks_list.go`, `usecase/bookmark_list.go`, `usecase/bookmark_store.go` (one method), `domain/` (new files plus the list input and query types) and `repository/` (a new file). You do not need to change `problem.go`, `router.go`, `server.go` or `domain/errors.go`; the new errors reuse `domain.ValidationError` and `domain.FieldCodeTooLong`. If you find you must, stop and ask.

## Operations used

- `listBookmarks` (`GET /api/v1/bookmarks`), the existing handler. Response `BookmarkPage { items: BookmarkSummary[], next_cursor: string | null }`, unchanged: a search result is a list of summaries (no page content, no rank, no snippet).

Authentication, CSRF and rate limiting are already applied by the router. Take the types from `internal/api` (generated); only `handler/` imports it.

## Behavior

### Parameters

| Parameter | Behavior |
|---|---|
| `q` | Trimmed. Empty after trimming: counts as absent (a plain list, exactly as today). More than 200 characters after trimming: `422`. Otherwise a search. |
| `include_notes` | Only means something with a non-empty `q`; ignored otherwise. Default false. |
| `folder_id` | With `q`, the search is limited to that folder and all its subfolders. An unknown folder, or another user's, is `404 not_found` (as the plain folder list already answers). |
| `trashed` | `true` with a non-empty `q` is `422` (unchanged). |
| `cursor`, `limit` | As today (`limit` 1 to 100, default 50). A search cursor is a different kind of cursor, see below. |

Checks run in this order, and the first failure answers (the new check is 3):

1. `limit` below 1 or above 100: `422`, `{field: "limit", code: "out_of_range"}` (unchanged).
2. `trashed=true` with a non-empty `q` or with `folder_id`: `422`, one entry per offending parameter (unchanged).
3. `q` over 200 characters after trimming: `422`, `{field: "q", code: "too_long"}`. Count characters (runes), not bytes.
4. `cursor` that does not decode for this request (see "Paging"): `422`, `{field: "cursor", code: "invalid"}`.
5. The folder does not exist for this user: `404 not_found` (the usecase already does this after the cursor).
6. Otherwise the page.

The `501 not_implemented` answer for `q` is removed. `ErrNotImplemented` itself stays: other stubs use it.

### What matches

The query text is read with Postgres `websearch_to_tsquery('english', q)`: words are combined with AND, `"quoted phrases"` are phrases, `-word` excludes a word, `or` is OR. This function never raises a syntax error, so any text the user types is safe; do not fall back to `plainto_tsquery` or build tsquery text by hand. Matching is by whole words after English stemming ("running" finds "run"); a partial word does not match.

- Without notes: a bookmark matches when `search_vector @@ query`. `search_vector` already holds title (weight A), URL (B) and page content (C) from the earlier slices; do not rebuild it.
- With `include_notes=true`: a bookmark matches when `(search_vector || setweight(to_tsvector('english', note), 'D')) @@ query`. One combined vector, one match test, one rank: a note-only match is found but ranks below title, URL and content matches of the same strength (weight D is the lowest). The note is never copied into `search_vector`.
- A query made only of stop words (for example `the`) produces an empty query: the answer is `200` with `items: []` and no cursor, not an error.
- Only live bookmarks (`deleted_at IS NULL`) and only the caller's (`user_id`) are searched. A bookmark that has not been fetched yet (`pending`) is searchable by title and URL.
- Folder scope reuses the recursive subtree query of the folder list in `repository/bookmark_list.go` (the folder and every descendant, walking only the caller's folders). Do not write a second copy of that SQL: move it into one small helper used by both.

### Order and rank

Results are ordered by relevance, best first: `ts_rank(vector, query) DESC, created_at DESC, id DESC`, where `vector` is the one used for matching above (with the note at weight D when notes are included). `ts_rank` with its default weights and normalization; no tuning in this task. The tie-breakers make the order total, so paging is deterministic. The rank is used for ordering only and is never returned.

### Paging

Search is the one place where `OFFSET` is allowed, because a relevance score is not a stable key to continue from. Everything else stays keyset.

- Read `limit + 1` rows from the current offset; return `limit`, and a `next_cursor` only if the extra row exists. No empty trailing page. No matches: `200` with `items: []` (an empty array) and `next_cursor: null`.
- The search cursor is opaque, defined once in `domain` as two pure functions with unit tests, in a new file next to `cursor.go`: base64url without padding of a small JSON object holding the kind (`search`), the offset (an integer from 0 to 100,000) and a fingerprint of the request. The fingerprint is a short hash (SHA-256, first 8 bytes, hex) of the trimmed `q`, `include_notes` and the folder id (or none); the same inputs always give the same fingerprint.
- A search cursor is accepted only for a search request whose fingerprint equals the cursor's. A cursor from another search (different `q`, `include_notes` or folder), a plain-list cursor, a trash cursor, or one with a negative or too large offset is `422 cursor invalid`. A search cursor sent to a plain list or to the trash is `422 cursor invalid` too. Decoding failures are the same set as for the existing cursor: longer than 512 characters, not base64url, not JSON of the expected shape (unknown keys rejected), missing field.
- The existing cursor functions and their tests do not change behavior.

### Known gaps

- A bookmark saved, edited or trashed between two pages can shift the results of the next page (offset paging). Accepted at this scale.
- With `include_notes`, the combined vector is built per row, so the GIN index cannot be used for that case; the query filters by `user_id` first and scans that user's live bookmarks. At hundreds of bookmarks (NFR-4) this stays far below the 1 second of NFR-10, which the integration test checks.
- Whole-word matching only: typing the start of a word finds nothing until the word is complete.
- No highlighting and no explanation of why a bookmark matched.

## Structure

Follow `ARCHITECTURE.md` and the file-placement and test-file rules in `TESTING.md`.

- `domain/`: `domain/cursor_search.go` (encode, decode, fingerprint) with its test file; add `Query string` and `IncludeNotes bool` to `ListBookmarksInput` and to the query type the store receives (or add a small separate `BookmarkSearchQuery`; your choice, say which in the plan). `Mode()` stays: search is a live-list mode.
- `usecase/`: `usecase/bookmark_list.go` branches: with a non-empty `Query` it decodes the search cursor, checks the folder (as today), asks the store for `limit + 1` rows from the offset, trims, builds the search `next_cursor`. Add one narrow method to `BookmarkStore` in `usecase/bookmark_store.go` and to the fake in `usecase/fakes_test.go`.
- `repository/`: `repository/bookmark_search.go`, a method on `BookmarkRepository`. Every query filters by `user_id` and `deleted_at IS NULL`. Select only the summary columns (never join `bookmark_content`; the content is already in `search_vector`). The user's text and every other value are bound parameters, never concatenated. The shared subtree helper lives in `repository/bookmark_list.go` or a small file next to it.
- `handler/`: `handler/bookmarks_list.go`: remove the 501 branch, add check 3, pass `Query` (trimmed) and `IncludeNotes` down. Update every handler test double that implements the service interface.

## Dependencies

None. Use only what is in `go.mod`.

## Acceptance criteria

Unit tests need no database. Integration tests carry the `integration` build tag; run them with `make test-integration-local` and say in the report which ran, and on which Postgres version.

**Search cursor (domain, unit, table-driven)**
- A cursor round-trips: encode then decode gives the same offset and accepts the same fingerprint.
- The fingerprint changes when `q`, `include_notes` or the folder changes, and does not change when only surrounding whitespace in `q` differs (the trimmed value is hashed).
- Rejected: over 512 characters, not base64url, non-JSON, wrong shape, unknown key, missing field, negative offset, offset 100,001, fingerprint of another request, a plain-list or trash cursor, and a search cursor given to the plain-list decoder (and the reverse).

**List with a query (usecase, unit, with the fake store)**
- The store receives the trimmed query, `include_notes`, the folder, the caller's id, the decoded offset (0 for the first page) and `limit + 1`.
- More rows than `limit`: `limit` items and a search cursor with offset `previous offset + limit`; exactly `limit` rows: no cursor; no rows: an empty, non-nil slice and no cursor.
- A search cursor for a different `q`, a plain-list cursor and a trash cursor are each `ValidationError` on `cursor`.
- A search with an unknown folder: the store's not-found error comes back and the store's search is never called.
- No `q`: the plain list path is used exactly as before (existing tests pass unchanged).

**Handler (unit, with a usecase double)**
- `q=go` reaches the usecase (no `501`); `q=%20%20` (blank) behaves as no query; `q` of exactly 200 characters passes and 201 answers `422` with `{field: "q", code: "too_long"}`; multi-byte characters are counted as characters (200 of `é` passes, 201 fails).
- `trashed=true` with `q`, with `folder_id` and with both: `422` as before. `include_notes=true` without `q` is ignored. `include_notes=true&q=go` passes the flag down.
- Check order: `limit=0&q=<201 chars>` answers on `limit`; `q` too long and a bad cursor answers on `q`.
- Failures assert the `application/problem+json` shape, not only the status.

**Search (repository, integration)**
- A word in the title, in the URL and in the stored page content each find the bookmark. A word only in the note does not, unless `include_notes` is true; with notes, a note-only match is found.
- Ranking: a bookmark with the word in its title ranks above one with it only in the content; a title match ranks above a note-only match with notes included; ties are ordered by newest `created_at`, then `id` descending.
- `websearch_to_tsquery` behavior: a quoted phrase matches only the phrase; `-word` excludes; text such as `"`, `(`, `&`, `'` and `:*` returns normally with no error; a stop-word-only query returns no rows.
- Stemming: searching `running` finds a bookmark titled "How to run".
- Folder scope: a search in a folder finds bookmarks in it and in its subfolders (three levels) and not those in a sibling folder or at the top level; an unknown folder is handled by the usecase and is not tested here.
- Trashed bookmarks are not found; restoring one (it goes to the top level) makes it found; a pending bookmark is found by title and URL.
- User isolation (NFR-7): two users with the same word in their bookmarks each see only their own, including across a page boundary and with a folder.
- Paging: 120 matching bookmarks at `limit=50` give 50, 50 and 20 rows, every row once, in rank order; a page boundary at exactly the end has no empty last page; two searches of the same data give the same order.
- Speed (NFR-10): with about 1,000 live bookmarks for one user, each with page content of several kilobytes, a search with `include_notes=true` returns in under 1 second. Report the measured time.
- The query touches no `bookmark_content` table (the summary columns and `search_vector` only).

**Repo-wide**
- `make check` passes. `make test-integration-local` passes, and the report says so.
- Nothing outside the allowed paths changed. `go.mod`, `go.sum`, `openapi.yaml`, `backend/internal/api` and the migrations are untouched.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt:

- Every query filters by `user_id` and `deleted_at IS NULL`; the user's text, the folder ids and the offset are bound parameters. Search the new code for string concatenation into SQL: the only constants spliced are fixed fragments, never request input.
- The match uses `websearch_to_tsquery('english', ...)` and the same `'english'` configuration as `refreshSearchVector`. No `plainto_tsquery`, no `ILIKE`, no hand-built tsquery text.
- With notes, the note is added with `setweight(..., 'D')` to the combined vector; the stored `search_vector` is not changed and no migration exists.
- The order is exactly `rank DESC, created_at DESC, id DESC`, and `OFFSET` appears only in the search query; the plain list and trash are still keyset (compare with `origin/main`).
- The subtree SQL exists once (shared), and the plain folder-filtered list still passes its tests unchanged.
- The `limit + 1` row never reaches the client, `items` is never `null`, and the cursor's offset is bounded.
- The fingerprint covers `q` (trimmed), `include_notes` and the folder, and a cursor of another request is rejected by the usecase and by the handler's pre-check.
- The 501 branch for `q` is gone; `ErrNotImplemented` and the other stubs are untouched; `problem.go`, `server.go`, `router.go` and `domain/errors.go` are unchanged.
- The `q` length is counted in characters after trimming.
- Run the integration tests yourself. Break the ranking on purpose (remove a tie-breaker, or the note weight) and confirm a test fails; revert afterwards and say what happened.
- Try to break it with: `q` of `"` alone, of `-`, of `'; DROP TABLE bookmarks;--`, of `a:*`, of `or`, of 200 and 201 characters, of emoji; `q` with leading and trailing spaces and the same `q` without them producing the same cursor fingerprint; a cursor from the first search used with `include_notes` flipped; a cursor with offset 100,000 (accepted, returns an empty page); `folder_id` of a folder in another user's account (404, not an empty list); a bookmark moved to another folder between two pages (no error); a search on a user with no bookmarks; two bookmarks with identical rank, `created_at` and different `id`.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement or this file conflict with each other.
- You think you need a migration, a new index, a dependency, a change to the contract or its generated code, a change to `problem.go`, `router.go`, `server.go` or `domain/errors.go`, or a change outside the allowed paths.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for. (The earlier list tasks forbade `OFFSET`; that was a rule of those task files, not of `CONVENTIONS.md`. This file allows it for search only.)
- `websearch_to_tsquery` is not available or behaves differently on the Postgres version in use.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `npm ci` in `frontend/` first on a fresh checkout (the check runs the front end's lint), run `make check`, run `make test-integration-local`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), which integration tests ran and which did not (and the Postgres version), the measured search time, whether breaking the ranking made a test fail, the design choice you made for the query type, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
