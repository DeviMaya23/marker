# Task: save a URL

> Trial slice. One backend agent builds it end to end on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

A signed-in user can save a URL as a bookmark and read it back. The save returns at once; a background job then fetches the page, stores its text and favicon, and sets the fetch status.

Requirements covered: FR-3 (URL entry), FR-4, FR-5, FR-5a, FR-5b, FR-5c, FR-22, FR-23, NFR-5, NFR-8, NFR-9, NFR-11, NFR-14 (limits on the fields below), NFR-17.

## Role and ownership

Role: Backend (see `AGENTS.md`).

You may change `backend/**` except `backend/migration/`. You may not change `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/save-a-url.plan.md`, see `AGENTS.md`), the frontend, existing migrations or the Makefile. You need no migration: the tables exist. If you think you need one, stop and ask.

## Operations

Implement these two by defining methods on `*handler.Server` in `handler/bookmarks.go`, replacing their 501 stubs:

- `createBookmark` (`POST /api/v1/bookmarks`)
- `getBookmark` (`GET /api/v1/bookmarks/{id}`)

Every other operation stays a stub. Authentication, CSRF and the 64 KB body cap are already applied by the router; do not repeat them in handlers.

## Behavior: saving

In this order:

1. **Validate the input.**
   - The URL must parse and use scheme `http` or `https` (FR-4). Otherwise `422 invalid_url`.
   - The URL is at most 2,048 characters and a supplied title at most 300. Otherwise `422 validation_error` with an `errors` entry `{field, code: "too_long"}`.
   - If `folder_id` is given, it must be one of the caller's folders. Otherwise `404 not_found` (another user's folder is also "not found", NFR-7).
2. **Normalize the URL** (FR-22) into `normalized_url`, a pure function in `domain`:
   - `http` and `https` are the same, so store the key with one scheme (`https`).
   - Lowercase the host. Ignore a trailing slash on the path. Drop the fragment.
   - Remove these params: any `utm_*`, plus `fbclid`, `gclid`, `dclid`, `msclkid`, `yclid`, `mc_cid`, `mc_eid`, `igshid`. Keep the list in one place so it is easy to extend.
   - Sort the remaining params by key then value, so order does not matter.
   - `url` stores the URL exactly as submitted.
3. **Duplicate check.** If the caller already has a bookmark with the same `normalized_url`, live or trashed: `409 duplicate_bookmark`, with `existing_bookmark_id` and `in_trash` in the body (the `DuplicateBookmarkProblem` shape). This is checked before the cap.
4. **Cap check** (NFR-17). If the caller already has 1,000 bookmarks, trashed ones included: `409 bookmark_limit_reached`.
5. **Insert** in one transaction: the bookmark with `fetch_status = pending`, the supplied title or an empty string, and `search_vector` set from title and URL with raw SQL. Increment `users.version` in the same transaction (convention 4). Two concurrent saves of the same URL must end with one row and one `duplicate_bookmark`, so rely on the `(user_id, normalized_url)` unique constraint and map its violation, not on the check alone.
6. **After the transaction commits**, enqueue the fetch job (`worker.Queue.EnqueueFetch`), never inside the transaction (convention 9). If the enqueue fails, still return `201`: the sweep recovers the bookmark.
7. Respond `201` with a `BookmarkSummary`. The save never fetches the page (NFR-5).

A supplied title is stored as given and never overwritten by the fetch (FR-5b).

## Behavior: reading

`getBookmark` returns a `BookmarkDetail` for the caller's bookmark, trashed or not. `content` is the stored text, or null while pending or after a failure. `favicon_url` is `/api/v1/favicons/{id}` when a favicon is stored, otherwise null. Another user's bookmark and an unknown id are both `404 not_found`.

## Behavior: the fetch

Replace `placeholderFetcher` in `cmd/server/main.go` with a real usecase that implements `worker.BookmarkFetcher`.

1. **Load the bookmark by id only.** The job has no user, so this one lookup does not filter by `user_id`. This is a second system-level exception to convention 2, like the sweep. Everything after it uses the bookmark's own `user_id`. If the bookmark no longer exists, return nil (discard).
2. If `fetch_status` is not `pending`, return nil. The sweep and the normal enqueue can both run.
3. **Fetch the page** with `safehttp` (`PageLimits`). Never use another HTTP client. The whole job must finish inside the 15 second job timeout (NFR-11): give the fetch an internal deadline of 11 seconds, so there is time left to record the result.
4. **Extract** (in `adaptor`, as a pure function with unit tests):
   - Decode with `golang.org/x/net/html/charset` for non-UTF-8 pages.
   - Text: all visible text, dropping `script`, `style`, `noscript`, `template`, `svg`, `iframe`, `nav`, `header`, `footer` and `aside`. Collapse whitespace runs to single spaces. The result is plain text, never HTML (convention 3).
   - Title: the first `<title>`, else `og:title`. Trim and collapse whitespace.
   - Favicon URL: the first `<link>` whose `rel` contains the token `icon`, resolved against the final page URL; if there is none, `/favicon.ico` on the final URL's origin.
5. **Fetch the favicon** with `safehttp` (`FaviconLimits`). A favicon over 32 KB, or any favicon failure, means "no favicon". It never fails the bookmark.
6. **Record the result** in one transaction, and increment `users.version` in it:
   - Truncate the text to 500 KB and the title to 300 characters, on rune boundaries. Truncating is correct here, not an error (NFR-14).
   - Upsert `bookmark_content` and update `search_vector` with raw SQL (title, URL and content).
   - Set the title **only if the stored title is empty** (FR-5b).
   - Store the favicon in `favicons` (upsert on `(user_id, host)`) and set `favicon_id`.
   - Set `fetch_status = ok`.
   - Touch nothing else: not the note, folder, trash state or a non-empty title (FR-5c). A trashed bookmark is still updated.
   - If the bookmark or its user was deleted meanwhile (zero rows affected, or a foreign key error from the user's deletion), discard silently and return nil.
7. **On failure** (a blocked or invalid address, timeout, non-2xx, wrong content type, too large, unparseable): set `fetch_status = failed` in a transaction that also increments `users.version`, and return nil. The worker has a single attempt, so the usecase records the failure itself.

## Structure

Follow `ARCHITECTURE.md`. In short:

- `domain/`: URL normalization, new sentinel errors (`ErrInvalidURL`, `ErrDuplicateBookmark`, `ErrBookmarkLimitReached`), and any value types.
- `usecase/`: `BookmarkService` (create, get) and `FetchService`. Each defines the interfaces it needs (bookmark store, folder lookup, queue, page fetcher). Follow the file placement rule for interfaces.
- `repository/`: extend `BookmarkRepository`; add favicon and folder lookups as needed. Every query filters by `user_id`, except the single load in the fetch.
- `adaptor/`: the page fetcher built on `pkg/safehttp`, plus the extraction functions.
- `handler/`: `bookmarks.go`. Map API types to domain types. Add the new sentinels to `domainProblems`, and map `gorm.ErrRecordNotFound` to `404 not_found`. The duplicate problem carries extra fields, so give it its own mapping.
- `cmd/server/main.go`: wiring. Add the new dependency to `NewServer` and construct one `safehttp.New()` client.

## Dependencies

You may use `golang.org/x/net` (`html`, `html/charset`), and `golang.org/x/text` if `charset` requires it. Nothing else. After any dependency change, check `git diff go.mod` against the rule in `CONVENTIONS.md`.

## Acceptance criteria

All of these must have a test. Unit tests need no database; integration tests carry the `integration` build tag, are written but not run by you, and the report must say so.

**Normalization (unit, table-driven)**
- `http://Example.com/a/` and `https://example.com/a` give the same key (FR-22).
- Tracking params are removed, other params kept, order ignored, fragment ignored.
- Different paths, or different non-tracking params, give different keys.

**Create (usecase unit tests with fakes, plus handler tests)**
- Happy path returns `201` with a `BookmarkSummary` and `fetch_status: pending`.
- `ftp://x`, `javascript:x`, an unparseable string: `422 invalid_url` (FR-4).
- A URL of 2,049 characters and a title of 301: `422 validation_error`, with `too_long` on the right field.
- A duplicate live bookmark and a duplicate trashed one: `409 duplicate_bookmark`, with `existing_bookmark_id` and the right `in_trash`.
- At 1,000 bookmarks: `409 bookmark_limit_reached`. A duplicate at 1,000 gives `duplicate_bookmark`, not the cap.
- Another user's `folder_id`: `404 not_found`.
- A supplied title is stored. An enqueue failure still returns `201`.
- The job is enqueued only after the commit (fake the store and the queue and assert the order).

**Create (integration)**
- The row, `search_vector` and the `users.version` increment exist after a save.
- Two concurrent saves of the same URL leave one row and one `duplicate_bookmark`.
- A saved bookmark is found by the sweep if no job was enqueued.

**Get**
- Returns the detail for own live and trashed bookmarks; `content` is null while pending.
- Another user's id and an unknown id are both `404` (NFR-7), shown by a test with two users.

**Fetch (usecase unit tests with a fake page fetcher; extraction unit tests; one integration test against an `httptest` server using `safehttp.NewForTesting`)**
- Success: content, favicon and `fetch_status: ok` are stored, and `users.version` is incremented.
- An empty title is filled from `<title>`; a non-empty title is never changed (FR-5b).
- Note, folder and trash state are unchanged after a fetch, including for a trashed bookmark (FR-5c).
- A deleted bookmark or user: the result is discarded and no error is returned.
- A failure of any kind sets `failed`; a favicon failure alone still gives `ok`.
- A bookmark that is not `pending` is left alone.
- Text over 500 KB and a title over 300 characters are truncated, not rejected.
- Extraction: script, style and nav text are absent from the output; whitespace is collapsed; a non-UTF-8 page is decoded correctly; `og:title` is the fallback; a relative favicon link is resolved; `/favicon.ico` is the fallback.
- A private or loopback address in the URL ends as `failed` (NFR-8). Use a fake fetcher returning `safehttp.ErrBlockedAddress`; `safehttp` has its own tests.

**Repo-wide**
- `make check` passes. `make test-integration` is for the user to run.
- Page content is only ever stored and returned as plain text, never as HTML (convention 3).

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt:

- The fetch job is enqueued only after the transaction commits, never inside it.
- No outbound request bypasses `pkg/safehttp`: look for `http.Get`, `http.DefaultClient` and `http.Client`.
- `users.version` is incremented in the fetch's write transactions too, including the failure path.
- The only repository lookup without a `user_id` filter is the fetch's load by bookmark id.
- Try to break it with: normalization edge cases (ports, uppercase scheme, empty query, repeated params, malformed queries), a title of exactly 300 characters, a URL of exactly 2,048, and concurrent saves.

## Stop and ask when

- The contract (`openapi.yaml`) or a requirement conflicts with this file, or with itself.
- You think you need a migration, a dependency beyond the list above, a new `pkg/` package, or an edit to a spec file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), integration tests written but not run, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
