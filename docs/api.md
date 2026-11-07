# Bookmark Manager — API Contract (v1)

Companion to `requirements.md` (v12). FR and NFR numbers below refer to that file. This contract is the interface that backend, frontend and verifier work against.

**`openapi.yaml` is the source of truth.** This document is the readable companion; if the two disagree, `openapi.yaml` wins.

## Conventions

**Transport and format**
- Base path `/api/v1`. JSON request and response bodies. HTTPS only (NFR-6).
- IDs are UUIDs (v7). Timestamps are ISO 8601 in UTC, for example `2026-10-21T03:28:00Z`.
- Auth routes live under `/auth`, not `/api/v1`, because they are browser navigations rather than JSON calls.

**Authentication and ownership**
- Login goes through the external IdP (FR-1). After login the browser holds a session cookie. Every `/api/v1` endpoint requires it; otherwise the response is `401 unauthenticated`.
- Sessions are sliding (NFR-15): valid for 30 days after last use, with an absolute maximum of 90 days. On `401`, the frontend sends the user to `/auth/login` with `return_to` set to the current page.
- Every resource belongs to one user. A request for an id that does not exist, or that belongs to another user, returns `404 not_found`, never 403 (NFR-7).

**CSRF protection (NFR-13)**
- The session cookie is `HttpOnly; Secure; SameSite=Lax`.
- A second cookie, `csrf_token`, is readable by the frontend and set at login.
- Every `POST`, `PATCH` and `DELETE` must send the same value in an `X-CSRF-Token` header, and the server checks the `Origin` header against the app's own origin. Failure returns `403 csrf_failed`.
- This covers the save page's POST too, since it is same-origin.

**PATCH semantics**
- A field that is omitted is left unchanged. A field sent as `null` clears it (for `note`) or means root (for `folder_id`, `parent_id`).
- Unknown or read-only fields in a body are rejected with `422 validation_error`, never silently ignored.

**Pagination (cursor-based lists)**
- Query params `cursor` (opaque string from the previous response) and `limit` (default 50, maximum 100).
- Response: `{ "items": [ ... ], "next_cursor": "..." }`. `next_cursor` is `null` on the last page.

**Errors (RFC 9457 problem details)**
- Content type `application/problem+json`. Fields: `type`, `title`, `status`, `detail`, plus a stable machine-readable `code`. Clients branch on `code`, never on the message text.
- Validation failures add an `errors` array of `{ "field": "...", "code": "..." }`.

```json
{
  "type": "/errors/duplicate-bookmark",
  "title": "Bookmark already exists",
  "status": 409,
  "detail": "This URL is already in your trash.",
  "code": "duplicate_bookmark",
  "existing_bookmark_id": "0191...",
  "in_trash": true
}
```

| `code` | Status | Raised when |
|---|---|---|
| `unauthenticated` | 401 | No valid session |
| `csrf_failed` | 403 | Missing or wrong CSRF token or origin on a write |
| `not_found` | 404 | Unknown id, another user's id, unknown folder id in a body or filter |
| `invalid_url` | 422 | URL is malformed or its scheme is not `http` or `https` (FR-4) |
| `duplicate_bookmark` | 409 | Normalized URL already saved, live or trashed (FR-23, FR-24) |
| `bookmark_limit_reached` | 409 | User already holds 1,000 bookmarks, trashed ones included (NFR-17) |
| `folder_depth_exceeded` | 422 | Create or move would pass depth 3 (FR-13) |
| `folder_cycle` | 422 | Folder moved into itself or one of its descendants |
| `folder_name_conflict` | 409 | Sibling folder with the same name, case-insensitive (FR-26) |
| `bookmark_in_trash` | 409 | `PATCH` or `DELETE` on a trashed bookmark |
| `bookmark_not_in_trash` | 409 | Restore on a bookmark that is not trashed |
| `validation_error` | 422 | Any other bad input (see `errors`), including a value over its length limit (`too_long`) |
| `payload_too_large` | 413 | Request body over 64 KB |
| `rate_limited` | 429 | Over a rate limit; the `Retry-After` header says when to retry |

## Object shapes

**Bookmark (summary), returned by lists and by writes**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `url` | string | As submitted, not normalized |
| `title` | string | May be empty until the fetch fills it (FR-5b) |
| `note` | string or null | |
| `folder_id` | uuid or null | Null means root. Not meaningful for trashed bookmarks, because restore always goes to root |
| `favicon_url` | string or null | `/api/v1/favicons/{id}`; never inline bytes |
| `fetch_status` | `pending`, `ok` or `failed` | FR-5a |
| `created_at` | timestamp | |
| `deleted_at` | timestamp or null | Set when trashed |

**Bookmark (detail)** is the summary plus `content` (string or null; extracted text, never HTML; null while `pending` or when `failed`) and `updated_at`.

**Folder**: `id`, `name`, `parent_id` (uuid or null), `depth` (root-level is 1), `bookmark_count` (live bookmarks directly in this folder, trashed ones excluded), `created_at`, `updated_at`.

## Bookmarks

### `POST /bookmarks`
Saves a URL. Covers FR-3, FR-3a, FR-3d, FR-4, FR-5, FR-22 to FR-24, NFR-5.

Body: `url` (required), `title` (optional), `folder_id` (optional; null or omitted means root).

- Validates the scheme, normalizes the URL, rejects duplicates, inserts the row with `fetch_status: pending`, and queues the background fetch. It does not fetch the page during the request.
- `201` returns the bookmark summary.
- Errors: `422 invalid_url`, `409 duplicate_bookmark` (includes `existing_bookmark_id` and `in_trash`), `409 bookmark_limit_reached` (checked after the duplicate check), `404 not_found` (unknown folder), `422 validation_error`.

### `GET /bookmarks`
Lists or searches. Covers FR-7, FR-9, FR-10, FR-11, FR-18, FR-21.

| Query param | Default | Meaning |
|---|---|---|
| `q` | none | Search term over title, URL and page content. Results are ranked by relevance |
| `include_notes` | `false` | Also match against notes (only meaningful with `q`) |
| `folder_id` | none | Limit to this folder and all its subfolders. Absent means all bookmarks |
| `trashed` | `false` | `true` lists the trash instead of live bookmarks |
| `cursor`, `limit` | | Pagination |

- Without `q`, order is newest first by `created_at`. In the trash view, order is most recently trashed first.
- With `trashed=false` (the default), trashed bookmarks never appear (FR-21).
- `trashed=true` cannot be combined with `q` or `folder_id` (`422 validation_error`).
- `200` returns `{ items: [Bookmark summary], next_cursor }`.

### `GET /bookmarks/{id}`
Returns the bookmark detail, including `content`. Works for trashed bookmarks too; `deleted_at` tells the client. `404 not_found` otherwise.

### `PATCH /bookmarks/{id}`
Edits user-defined fields only. Covers FR-8, FR-14, FR-15.

Body (all optional): `title`, `note` (null clears it), `folder_id` (null means root).

- `url`, `content`, favicon, `fetch_status` and trash state cannot be changed here (`422 validation_error`).
- `404 not_found` for an unknown bookmark or folder. `409 bookmark_in_trash` for a trashed bookmark.
- `200` returns the bookmark summary.

### `DELETE /bookmarks/{id}`
Soft delete: moves the bookmark to the trash (FR-17). `204` on success. `409 bookmark_in_trash` if already trashed. There is no per-item permanent delete.

### `POST /bookmarks/{id}/restore`
Restores a trashed bookmark to root (FR-19): clears `deleted_at` and sets `folder_id` to null. `200` returns the bookmark summary. `409 bookmark_not_in_trash` if it is not trashed.

### `DELETE /trash`
Permanently deletes every trashed bookmark and its content (FR-20). `200` returns `{ "deleted": <count> }`. Nothing is purged automatically.

## Folders

### `GET /folders`
Returns every folder the user has as a flat list: `{ "items": [Folder] }`. No pagination, filters or search at the scale in NFR-4. The client builds the tree from `parent_id`, and sums `bookmark_count` over a subtree for the FR-16 delete confirmation. Covers FR-12.

### `POST /folders`
Creates a folder. Body: `name` (required), `parent_id` (optional; null means root). `201` returns the folder.
Errors: `404 not_found` (unknown parent), `422 folder_depth_exceeded` (FR-13), `409 folder_name_conflict` (FR-26), `422 validation_error`.

### `PATCH /folders/{id}`
Renames or moves a folder with its contents (FR-12, FR-15). Body (both optional): `name`, `parent_id` (null means root).
- Rejects moving a folder into itself or any descendant (`422 folder_cycle`).
- Rejects a move when the new parent's depth plus the moved subtree's height exceeds 3 (`422 folder_depth_exceeded`).
- Rejects a rename or move that collides with a sibling name in the resulting location (`409 folder_name_conflict`).
- Descendant depths are updated in the same transaction. `200` returns the folder.

### `DELETE /folders/{id}`
Permanently deletes the folder and every subfolder. All live bookmarks in the subtree move to the trash, in one transaction (FR-16). Folders are never trashed and cannot be restored.
`200` returns `{ "deleted_folders": <count>, "trashed_bookmarks": <count> }`. The UI shows these numbers beforehand from `GET /folders`, not from this response.

## Sync

### `GET /sync/version`
Returns `{ "version": <integer> }`, the user's version counter (NFR-2). Every write transaction increments it, including completion of a background fetch. Clients poll every 2 to 3 seconds; when the number changes, they refetch the folder list and the list they are showing. Deletions need no special handling, because a refetch simply omits deleted rows.

## Favicons

### `GET /favicons/{id}`
Returns the stored image bytes with their `Content-Type`. Authenticated and per-user. The content behind an id never changes, so responses carry `Cache-Control: private` with a long max-age and an `ETag`.

## Account

### `DELETE /account`
Permanently erases all of the user's app data, including the trash (FR-25, NFR-3), then ends the session. `204`. The IdP account is untouched.

## Auth (browser routes, under `/auth`)

- `GET /auth/login?return_to=<path>`: starts the IdP login (FR-1, FR-3c). `return_to` must be a same-origin relative path; anything else is ignored, which prevents open redirects. Also sets the `login_binding` cookie (`HttpOnly; Secure; SameSite=Lax; Path=/auth/callback`, 10 minutes), which ties the attempt to this browser. A second call replaces it, so the later attempt wins.
- `GET /auth/callback?code=&state=&error=`: the IdP redirects here. `code`, `state` and `error` are all optional so a cancelled login (`?error=access_denied&state=...`, no `code`) still reaches the handler. Needs the `login_binding` cookie matching `state`. On success it creates the session, sets the `session` and `csrf_token` cookies, then redirects to `return_to` (default `/`). It never returns JSON: any failure (bad, expired or reused `state`, missing or wrong binding cookie, bad or missing `code`, IdP rejection, server fault) redirects to `/login?error=<code>` with no session cookie, where `<code>` is `access_denied` if the user cancelled at the IdP and `login_failed` otherwise. If the `state` was valid, `&return_to=<path>` is added so a retry returns to the same page. Every outcome clears `login_binding`.
- `POST /auth/logout`: ends the app session (FR-2). CSRF-protected. Returns `200` with `{ "logout_url": "..." }`, the identity provider's logout URL (with a redirect back to the app). The response clears the `session` and `csrf_token` cookies (`Max-Age=0`). The frontend must navigate the browser to it so the Kinde session ends too; otherwise the next login would sign the user straight back in.

## Not an API endpoint

The save page (`/save?url=...&title=...`, FR-3a to 3d) is a frontend route. Its confirm action is `POST /bookmarks`.

## Limits (NFR-14)

| Field | Maximum |
|---|---|
| `url` | 2,048 characters |
| `title` | 300 characters |
| `note` | 500 characters |
| folder `name` | 100 characters |
| stored `content` | 500 KB of text |
| favicon | 32 KB |
| request body | 64 KB |
| bookmarks per user | 1,000, trashed ones included (NFR-17) |

- A user-supplied value over its limit returns `422 validation_error` with the field's error code `too_long`. A body over 64 KB returns `413 payload_too_large`.
- Values found by the page fetch are not rejected: titles are truncated to 300 characters, content to 500 KB, and an oversized favicon is skipped.

## Rate limits (NFR-16)

- `POST /bookmarks`: 30 per minute per user.
- `GET /auth/login` and `GET /auth/callback`: 10 per minute per IP address, in one shared allowance. Behind a proxy the address comes from the header named by the server's `CLIENT_IP_HEADER` setting; otherwise from the connection.
- Everything else (including `POST /auth/logout` and favicons): a per-user ceiling of 300 per minute. `GET /sync/version` is exempt, since it is polled every 2 to 3 seconds.
- The proxy in front of the app limits overall volume per IP address; that is a deployment concern, not part of this contract.
- Over a limit: `429 rate_limited` with a `Retry-After` header.

## Proxy secret

In production the server runs behind a proxy that adds the header `X-Proxy-Secret` to every request. When the server's `PROXY_SHARED_SECRET` setting is set, a request without the exact value answers `404 not_found` (the same answer as an unknown route), before sessions, CSRF, the body limit and rate limiting. Only `GET /health` is exempt. This is a gateway check outside the per-operation statuses above, and it is not described in `openapi.yaml`.
