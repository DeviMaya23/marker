# Bookmark Manager — Requirements and Entities (v12)

Status: requirements locked; core entities drafted; submission mechanism (FR-3), save-then-fetch (async content retrieval) and sync (polling) decided. API contract is `openapi.yaml` (source of truth), with `api.md` as the readable companion. Input limits, session lifetime, rate limiting, open signup and the tech stack recorded. Next: deployment and fetcher safety.

Delivery notes (not requirements): the bookmarklet must open the save page with `window.open` so the page may close itself. It contains no secret and relies on the user's normal login session. Other pathways (iOS Shortcut, PWA share target) can reuse the same save page later.

## Functional requirements

### Accounts
- **FR-1** A user logs in through an external identity provider (IdP), using email/password or SSO. The app does not store credentials. Anyone can create an account; there is no allowlist.
- **FR-2** A user can log out. Logging out ends both the app session and the identity provider session, so the next login asks for credentials again.

### Bookmarks
- **FR-3** A user can save a website as a bookmark by (a) entering a URL in the app, or (b) using a bookmarklet that opens a save page in a popup window. Browser extensions are out of scope.
  - **FR-3a** The save page shows the URL and an editable title, and offers a folder picker (default: root). It creates the bookmark only when the user confirms. Opening the page never creates a bookmark.
  - **FR-3b** The user can confirm with Enter and cancel with Esc. After a successful save the page closes itself; on cancel it closes immediately. Where the browser does not allow closing, the page says the user can close the tab. Duplicate and error outcomes stay open until dismissed.
  - **FR-3c** If the user is not logged in when the save page opens, they are taken to login and then returned to the same save page with the same parameters.
  - **FR-3d** The bookmarklet sends the page's title. If the server's fetch fails or finds no title, the client-supplied title is used.
- **FR-4** Only `http` and `https` URLs are accepted. Anything else is rejected.
- **FR-5** After a bookmark is saved, the system retrieves the page and stores its text content and the site's favicon. No other images are stored. The save request does not wait for retrieval.
  - **FR-5a** The UI shows each bookmark's fetch state (pending, failed or complete). Page content becomes searchable once retrieval completes.
  - **FR-5b** Retrieval fills a bookmark's title only if the title is empty. A title the user supplied, confirmed or edited is never overwritten.
  - **FR-5c** Retrieval updates only content, favicon, fetch status and an empty title. It never changes the note, folder, trash state or a non-empty title. If the bookmark or account no longer exists when retrieval finishes, the result is discarded.
- **FR-6** If retrieval fails, the bookmark is still saved with its URL.
- **FR-7** A user can view their bookmarks in a list, newest first, with infinite scroll.
- **FR-8** A user can edit a bookmark's title and its note. The note is a field of the bookmark and can be added, edited and cleared.
- **FR-9** A user can search bookmarks by title, URL and page content. Results are ranked by relevance.
- **FR-10** A user can include notes in a search. Notes are excluded by default.
- **FR-11** A user can scope a search to a single folder or to all bookmarks. A folder-scoped search includes that folder's subfolders.

### Folders
- **FR-12** A user can create, view and rename folders.
- **FR-13** Folders can be nested to a maximum depth of 3. A move that would exceed this is rejected.
- **FR-14** A bookmark belongs to exactly one folder, or to root.
- **FR-15** A user can move a bookmark or a folder (with its contents) to another location. Moves are not undoable.
- **FR-16** Deleting a folder permanently deletes it and all of its subfolders. Every bookmark within moves to the trash. Before deleting, the UI shows how many subfolders and bookmarks are affected.
- **FR-26** Folder names are unique among siblings, compared case-insensitively. Creating, renaming or moving a folder in a way that would collide is rejected. *(Added in v7; numbered out of sequence to keep earlier references stable.)*

### Trash
- **FR-17** Deleting a bookmark moves it to the trash (soft delete).
- **FR-18** A user can view their trashed bookmarks.
- **FR-19** A user can restore a bookmark from the trash. It goes to root.
- **FR-20** A user can empty the trash, which permanently deletes everything in it. Nothing is purged automatically.
- **FR-21** Trashed bookmarks don't appear in the list or in search.
  - **FR-21a** A trashed bookmark can still be opened by id, and it shows that it is in the trash. It cannot be edited or deleted; the only actions on it are restore (FR-19) and emptying the trash (FR-20).

### Duplicates
- **FR-22** Two URLs are the same bookmark when their normalized forms match. Normalization: `http` equals `https`; a trailing slash is ignored; host case is ignored; known tracking params (`utm_*`, `fbclid`, `gclid` and similar) are removed; remaining params are order-insensitive; the fragment is ignored. The original submitted URL is stored alongside the normalized key.
- **FR-23** Saving a URL that is already bookmarked, including one in the trash, doesn't create a second bookmark.
- **FR-24** On a duplicate, the UI shows an alert. If the existing bookmark is in the trash, the alert says so. Otherwise it says the URL is already saved.

### Account deletion
- **FR-25** A user can delete their account, which permanently erases all of their app data, including the trash. The IdP account is not deleted.

## Non-functional requirements

- **NFR-1** *(Compatibility)* Latest Firefox, Opera and Chrome on desktop and mobile. Safari is best-effort.
- **NFR-2** *(Availability over consistency)* A change on device A appears on device B within 5 seconds under normal conditions, and data converges after disruption. Concurrent conflicting writes resolve as last write wins.
- **NFR-3** *(Data erasure)* Account deletion removes all of the user's app data. No backups are kept.
- **NFR-4** *(Scale)* Designed for a handful of users, each with hundreds of bookmarks.
- **NFR-5** *(Save latency)* A save request responds within 3 seconds regardless of how slow the target site is.
- **NFR-6** *(Transport)* All API calls are made over HTTPS.
- **NFR-7** *(Data isolation)* A user can only read or change their own data. The app never stores user passwords.
- **NFR-8** *(SSRF)* The server must not fetch private, loopback, link-local or otherwise internal addresses, including via redirects. This applies to page and favicon fetches.
- **NFR-9** *(Fetch limits)* Page and favicon retrieval have a timeout, a maximum response size, and accept only expected content types (HTML for pages, common image types for favicons).
- **NFR-10** *(Search latency)* Search results return within 1 second at the scale in NFR-4.
- **NFR-11** *(Fetch completion)* A content fetch finishes, as success or failure, within 15 seconds. Fetches interrupted by a server restart are re-queued.
- **NFR-12** *(Fetch concurrency)* The server limits the number of concurrent background fetches.
- **NFR-13** *(CSRF)* Every state-changing request is protected against cross-site request forgery: a `SameSite=Lax`, `HttpOnly` session cookie, a CSRF token sent in a header and matched against a cookie, and an `Origin` check. Requests that fail are rejected.
- **NFR-14** *(Input limits)* Text fields have maximum lengths: URL 2,048 characters, title 300, note 500, folder name 100. Stored page content is capped at 500 KB of text and a favicon at 32 KB. A request body is capped at 64 KB. Values supplied by the user that exceed a limit are rejected. Values found by the page fetch (title, content, favicon) are truncated or skipped, not rejected.
- **NFR-15** *(Sessions)* Sessions are long and sliding: valid for 30 days after last use, with an absolute maximum of 90 days. An expired session sends the user through login and then back to where they were.
- **NFR-16** *(Rate limiting)* Saving bookmarks is limited per user (30 per minute). Login routes are limited per IP address. Other write and read endpoints have a generous per-user ceiling, and the sync poll is exempt from it. Requests over a limit are rejected and told when to retry.
- **NFR-17** *(Bookmark cap)* A user can hold at most 1,000 bookmarks, trashed ones included. Saving beyond the cap is rejected. Emptying the trash or deleting a folder's bookmarks permanently frees room; restoring from the trash does not change the count. A duplicate save is rejected as a duplicate before the cap is checked. *(The cap is a starting value, to be revisited.)*

## Assumptions

- Duplicate detection (FR-22) uses the URL as submitted, not the final URL after redirects. Two different URLs that redirect to the same page (a short link and its target, say) are separate bookmarks. This is accepted, because resolving it would require fetching before the duplicate check, which conflicts with FR-5.

- Sign-up is open to anyone, even though the scale target (NFR-4) is a handful of users. Abuse protections (NFR-8, NFR-9, NFR-12, NFR-14, NFR-16) are designed as if strangers can register.

## Out of scope

Sharing, browser extensions, storing page images (favicons excepted), tags, import/export, retrying failed fetches, undo for moves, auto-purge of the trash, backups, and deleting the IdP account.

## Core entities

All IDs are UUIDv7, generated by the app. Every table except `users` and `bookmark_content` carries `user_id`, and every query filters by it (NFR-7). `bookmark_content` is reached only through its bookmark. All user-owned tables cascade on delete from `users` (FR-25, NFR-3).

```
users(id, idp_id UNIQUE, version, created_at)

folders(id, user_id, name, parent_id NULL → folders ON DELETE CASCADE,
        depth, created_at, updated_at,
        UNIQUE(user_id, coalesce(parent_id, nil-uuid), lower(name)))

favicons(id, user_id, host, content_type, data,
         UNIQUE(user_id, host))

bookmarks(id, user_id, url, normalized_url, title, note,
          folder_id NULL → folders ON DELETE SET NULL,
          favicon_id NULL → favicons,
          fetch_status (ok | failed | pending),
          search_vector,
          created_at, updated_at, deleted_at NULL,
          UNIQUE(user_id, normalized_url))

bookmark_content(bookmark_id PK → bookmarks ON DELETE CASCADE, text)
```

### Entity notes

- **Trash is not a table.** A bookmark is trashed when `deleted_at` is set. Restore clears it and sets `folder_id` to null (FR-19). Empty trash deletes rows where `deleted_at` is not null. List and search filter on `deleted_at IS NULL` (FR-21).
- **Duplicates.** The unique constraint on `(user_id, normalized_url)` enforces FR-23 for live and trashed bookmarks alike.
- **Folder depth.** A root-level folder has depth 1. The app enforces the limit of 3 inside the write transaction. A `CHECK (depth <= 3)` is a backstop. On a move, require that the new parent's depth plus the moved subtree's height is at most 3, and that the target is not inside the moved folder's own subtree (no cycles). Also check sibling-name collisions on create, rename and move (FR-26).
- **Folder delete order (FR-16).** In one transaction: set `deleted_at` and null `folder_id` on every bookmark in the subtree, then delete the folder. Subfolders go via `ON DELETE CASCADE`. The `ON DELETE SET NULL` on `bookmarks.folder_id` is a backstop only, and would orphan any bookmark the app forgot to trash, so this path needs a test.
- **Content.** `bookmark_content.text` holds extracted main text, not raw HTML, capped in length. It is a separate table so list queries never load it. No row means no content; `fetch_status` says why.
- **Search.** `search_vector` on `bookmarks` is built from title, URL and content text, with a full-text index. It is maintained by the app, in the same transaction that changes title, URL or content (no trigger), using the `english` text search configuration with weights title A, URL B, content C. Notes are not in the vector; they are matched separately when the FR-10 toggle is on. Folder-scoped search (FR-11) needs the folder's subtree IDs.
- **Favicons.** Stored per user, as bytes in the database, with a size cap and an image content-type allowlist. Per-user ownership means account deletion cascades with no leftover rows (NFR-3).
- **Sync (NFR-2).** `users.version` is incremented in every write transaction. Each device remembers the last version it saw, polls the current version every 2 to 3 seconds, and on a change refetches the folder tree and its current list. Deletes need no tombstones because a refetch simply omits deleted rows. Last write wins on conflict.
- **IdP identifier.** `idp_id` is the IdP's stable subject ID, assuming a single IdP. Do not key on email.

## Tech stack

Decided in the stack discussion. Bracketed references are the requirements each choice serves.

- **Backend:** Go with Echo (HTTP) and GORM (database access, raw SQL where Postgres features are needed). Connection-level control for SSRF-safe fetching, including every redirect hop (NFR-8, NFR-9). Code layout: external systems sit behind `internal/adaptor`; the SSRF-safe client is `pkg/safehttp`.
- **Frontend:** React and TypeScript, built with Vite as a single-page app.
- **Database:** PostgreSQL. Ranked full-text search (FR-9, NFR-10), recursive queries for folder subtrees (FR-11) and the case-insensitive sibling-name index (FR-26).
- **Fetch queue:** River, a Postgres-backed job queue, with a concurrency cap (NFR-11, NFR-12). The bookmark is committed first and the job is enqueued after commit, because GORM and River don't share a transaction. A periodic sweep enqueues jobs for old `pending` bookmarks, River's unique-jobs option prevents duplicates. A job has a single attempt and a 15 second timeout; one interrupted by a crash is discarded by River's rescuer and re-created by the sweep. No lease column.
- **Identity provider:** Kinde, through the standard OIDC authorization code flow, with the Go backend as a confidential client. The app then issues its own session cookie. `users.idp_id` stores the OIDC `sub` claim (confirm it is stable during setup).
- **Sessions:** a server-side `sessions` table in PostgreSQL, so logout, expiry and account deletion take effect immediately (FR-2, FR-25, NFR-15).
- **Logout:** ends the app session and the Kinde session (FR-2).
- **Rate limiting:** two layers. A reverse proxy or edge limits per IP address (login routes, overall volume). The app limits per user (saves, general ceiling), since only the app knows who the user is (NFR-16).
- **API contract:** `openapi.yaml` (OpenAPI 3.1) is the source of truth. `api.md` is the readable companion.
- **Suggested libraries (not binding):** `go-oidc` and `x/oauth2` for login, `go-readability` for text extraction, `x/time/rate` for in-process limiting, and TanStack Query for polling and infinite scroll in the frontend.

## Decisions deferred to later stages

- Deployment: hosting, containers, TLS, the reverse proxy, and how the fetcher is isolated (for example separate egress rules) for NFR-8.
- Exact numbers for login-route rate limits and the general per-user ceiling.
- Columns of the `sessions` table.
- Indexes in detail: list pagination by keyset on `(user_id, deleted_at, created_at DESC, id DESC)`, folder views on `(user_id, folder_id)`.
- Low priority: an `issuer` column on `users` if a second IdP is ever added.
