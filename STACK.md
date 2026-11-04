# Stack

> Orientation and library choices. Bracketed references are the requirements a choice serves (`docs/requirements.md`).

## Backend

| Concern | Choice |
|---|---|
| Language | Go. The `go` directive is `1.26` (see `CONVENTIONS.md`). |
| HTTP | Echo v4 |
| Database | PostgreSQL 17 (matches the developer's local install), accessed with GORM on the pgx v5 driver; raw SQL where Postgres features are needed (ranked full-text search, recursive folder subtrees, expression indexes) |
| Migrations | `golang-migrate` |
| Job queue | River: the page fetch, with a concurrency cap (NFR-11, NFR-12). River's own tables are created by its migrator (`rivermigrate`), run after the app's `golang-migrate` migrations; the two are independent |
| API layer | `oapi-codegen` generates Go types and a strict server interface from `openapi.yaml`, so a handler that drifts from the contract fails to compile |
| Auth | Kinde through the standard OIDC authorization code flow, the Go backend as a confidential client. The app then issues its own session cookie. `users.idp_id` is the OIDC `sub` claim |
| Sessions | A server-side `sessions` table in PostgreSQL: sliding 30 days, 90 day absolute maximum (NFR-15) |
| Outbound fetching | `pkg/safehttp`, an SSRF-safe client (NFR-8, NFR-9) |
| Tests | testify, testcontainers for repository tests |

OIDC login libraries (adopted for the auth backend): `github.com/coreos/go-oidc/v3` at `v3.21.0` (provider discovery, ID token verification) and `golang.org/x/oauth2` at `v0.37.0` (authorization URL, PKCE, code exchange). Both are compatible with the `go 1.26.0` directive. Only `adaptor/oidc.go` imports them.

Suggested, not yet adopted: `go-readability` for text extraction, `x/time/rate` for in-process limiting.

### Fetch queue

A save commits the bookmark through GORM first, then enqueues its River job (`worker.Queue.EnqueueFetch`). If the process dies between the two, the bookmark stays `pending` with no job. A periodic sweep, run every minute, enqueues jobs for bookmarks still `pending` after 2 minutes. River's unique-jobs option keyed on the bookmark id keeps one job per bookmark, so the sweep and the normal enqueue cannot duplicate each other.

Fetch jobs run on their own queue with a concurrency cap (`FETCH_CONCURRENCY`, default 4; NFR-12), a 15 second timeout (NFR-11) and a single attempt: the fetch usecase records a failure itself, since retrying failed fetches is out of scope. A job interrupted by a crash is discarded by River's rescuer (after 1 minute) and re-created by the sweep (NFR-11). GORM and River do not share a transaction here, so there is no atomic enqueue.

### Rate limiting

Two layers (NFR-16): a reverse proxy or edge limits per IP address (login routes, overall volume), and the app limits per user (saves, general ceiling), since only the app knows who the user is.

## Frontend

| Concern | Choice |
|---|---|
| UI | React 19, TypeScript, Vite |
| TypeScript | Pinned to the 6.0 line (`~6.0`): `typescript-eslint` 8.x accepts only TypeScript below 6.1. Revisit when it supports TypeScript 7 |
| Lint | ESLint with `typescript-eslint` |
| CSS lint | `stylelint` with `stylelint-config-recommended` and no other preset or plugin: it catches syntax errors and clear mistakes, not style. Run with `make lint-css`; it is part of `make check` |
| Tests | Vitest with Testing Library (jsdom) |
| Data fetching | TanStack Query, for the sync poll, refetching and infinite scroll |
| Routing | `react-router` with browser history (`/save`, `/bookmarks/:id`), not hash routes: the backend's `return_to` after login is a plain path |
| Icons | `lucide-react`, the only icon library |
| Styling and components | Plain CSS with the design tokens from `docs/design/ui-reference/src/styles/`. Base UI (`@base-ui/react`, headless and unstyled) provides dialogs, menus and toasts, and any later overlay or form control it has (select, popover, tooltip); it is wrapped in `frontend/src/components/ui/`, and only those wrappers import it. No other UI library, no Tailwind, and no hand-written replacement for something Base UI already has |
| API types | Generated from `openapi.yaml` with `openapi-typescript` (types only, no generated client) into `src/lib/api/schema.d.ts` |

## Contract

`openapi.yaml` (OpenAPI 3.1) is the source of truth. `docs/api.md` is the readable companion.

Generated code is committed so agents never need the generators to build: Go in `backend/internal/api`, TypeScript in `frontend/src/lib/api/schema.d.ts`. `make generate` regenerates both; `make generate-check` (for CI) fails if they are stale. `openapi-typescript` runs through `npx`, pinned in the `Makefile`, and is not a dependency in `package.json`: its 7.x peer range stops at TypeScript 5, and the project is on 6.0. `oapi-codegen` is pinned as a Go tool in `backend/go.mod` (`go tool oapi-codegen`), so there is no global install. Its OpenAPI 3.1 support is recent; if it chokes on the spec, tell the user rather than downgrading the spec.

## Tooling

A root `Makefile` is the task runner. Run `make help` for the targets. `make check` (lint, test, build, openapi-lint) is what an agent runs before pushing.

- Backend lint is `gofmt` and `go vet`; OpenAPI lint is Redocly CLI through `npx`.
- Integration tests carry the build tag `integration` and need Docker. `make test` skips them; `make test-integration` runs them. Only the user runs these, so agents write them and report "written, not run".

## Dev and test auth bypass

`GET /auth/dev-login?name=alice` signs in as the user `dev|alice` without Kinde, so local development and tests of authenticated routes need no Kinde secrets. It exists only when `AUTH_DEV_LOGIN=true`, and the server refuses to start with that set unless `APP_ENV=development` (`Config.Validate`). Tests do not use the route: they create a user and session directly. The route is not in `openapi.yaml`.

## Local development

- Go server on `:8085` (`HTTP_ADDR`); Vite dev server on `:5175`.
- Vite proxies `/api`, `/auth` and `/healthz` to the Go server, so the browser sees one origin (`http://localhost:5175`).
- Kinde dev application callback: `http://localhost:5175/auth/callback`. The CSRF origin check must allow `http://localhost:5175` in development.
- Any PostgreSQL 17 works; set `DATABASE_URL` in `.env` (`make` loads it). A local install is the default. `docker-compose.yml` is an optional alternative (`make db-up`, host port 5435) for machines without one, and `.env.example` matches it.
- `make migrate` applies the app's migrations and then River's.

## Open items

- Kinde: the logout redirect parameter, which URLs must be registered, and confirming `sub` is stable.
- The tool that mocks the API from `openapi.yaml` for the frontend.
- Pin Redocly CLI to an exact version once confirmed.
