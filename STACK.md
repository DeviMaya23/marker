# Stack

> Orientation and library choices. Bracketed references are the requirements a choice serves (`docs/requirements.md`).

## Backend

| Concern | Choice |
|---|---|
| Language | Go. The `go` directive is `1.26` (see `CONVENTIONS.md`). |
| HTTP | Echo v4 |
| Database | PostgreSQL, accessed with GORM; raw SQL where Postgres features are needed (ranked full-text search, recursive folder subtrees, expression indexes) |
| Migrations | `golang-migrate` |
| Job queue | River: the page fetch, with a concurrency cap (NFR-11, NFR-12) |
| Auth | Kinde through the standard OIDC authorization code flow, the Go backend as a confidential client. The app then issues its own session cookie. `users.idp_id` is the OIDC `sub` claim |
| Sessions | A server-side `sessions` table in PostgreSQL: sliding 30 days, 90 day absolute maximum (NFR-15) |
| Outbound fetching | `pkg/safehttp`, an SSRF-safe client (NFR-8, NFR-9) |
| Tests | testify, testcontainers for repository tests |

Suggested, not yet adopted: `go-oidc` and `x/oauth2` for login, `go-readability` for text extraction, `x/time/rate` for in-process limiting.

### Fetch queue

A save commits the bookmark through GORM first, then enqueues its River job. If the process dies between the two, the bookmark stays `pending` with no job; a periodic sweep enqueues jobs for old `pending` bookmarks. River's uniqueness option keyed on the bookmark id stops the sweep from creating duplicates, and River's rescuer re-runs jobs interrupted mid-fetch (NFR-11). GORM and River do not share a transaction here, so there is no atomic enqueue.

### Rate limiting

Two layers (NFR-16): a reverse proxy or edge limits per IP address (login routes, overall volume), and the app limits per user (saves, general ceiling), since only the app knows who the user is.

## Frontend

| Concern | Choice |
|---|---|
| UI | React 19, TypeScript, Vite |
| TypeScript | Pinned to the 6.0 line (`~6.0`): `typescript-eslint` 8.x accepts only TypeScript below 6.1. Revisit when it supports TypeScript 7 |
| Lint | ESLint with `typescript-eslint` |
| Tests | Vitest with Testing Library (proposed; not installed yet) |
| Data fetching | TanStack Query suggested, for the sync poll, refetching and infinite scroll |
| Styling and components | Undecided, pending the UI design |
| API types | Generated from `openapi.yaml`; generator chosen at foundation |

## Contract

`openapi.yaml` (OpenAPI 3.1) is the source of truth. `docs/api.md` is the readable companion.

## Local development

- Go server on `:8085` (`HTTP_ADDR`); Vite dev server on `:5175`.
- Vite proxies `/api`, `/auth` and `/healthz` to the Go server, so the browser sees one origin (`http://localhost:5175`).
- Kinde dev application callback: `http://localhost:5175/auth/callback`. The CSRF origin check must allow `http://localhost:5175` in development.
- PostgreSQL runs in Docker Compose (not yet added).

## Open items

- How River's own schema is applied next to `golang-migrate` migrations. Check River's documentation.
- Kinde: the logout redirect parameter, which URLs must be registered, and confirming `sub` is stable.
- The tool that mocks the API from `openapi.yaml` for the frontend.
- The generator for frontend API types.
