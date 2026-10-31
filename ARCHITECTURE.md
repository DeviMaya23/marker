# Architecture

> Agent-agnostic. Applies to all implementation agents.

## Frontend

### Directory Structure

```
frontend/src/
  features/          ← feature-scoped code, one folder per UI area
    <feature>/
      components/    ← components owned by this feature
      hooks/         ← hooks owned by this feature
      lib/           ← pure/feature-local helpers (no other feature imports them)
  app-shell/         ← the top-level layout and cross-cutting orchestration
                       (view routing, the sync poll that refreshes views)
    lib/             ← shell-local helpers
  lib/               ← shared domain layer: types + API wrappers used across
                       multiple features (api client, bookmarks, folders, sync)
  components/ui/     ← shared design-system primitives
  hooks/             ← generic hooks with no feature-specific dependencies
  pages/             ← thin route entry points
  assets/            ← static assets
```

Planned features: `bookmark-list` (list, search, add by URL), `bookmark-detail`,
`folder-sidebar`, `trash`, `save` (the bookmarklet popup page), `auth`, `account`.

### Where new code goes

**`features/<feature>/`** — default for anything specific to one UI area. New
components, hooks, and helpers for that feature live here, not in top-level
`components/`/`hooks/`/`lib/`.

**`app-shell/`** — only the shell layout and logic that genuinely coordinates
across features (view routing, sync-driven refresh). Do not put feature work here.

**`lib/`** — shared domain modules consumed by 4+ features. Keep these
feature-agnostic; do not relocate a shared module into a single feature. A
helper used by only one feature belongs in that feature's `lib/`, not here.

**`components/ui/`, `hooks/`, `pages/`** — stay top-level: design-system
primitives, dependency-free generic hooks, and thin route entry points
respectively.

### API types

Request and response types come from `openapi.yaml`, generated rather than
hand-written. Do not write a type that mirrors an API shape by hand; if the
generated type is wrong, the contract is wrong, so ask.

### Naming

Feature directories whose UI concern maps to a shared domain module use a
distinct name (`folder-sidebar`, **not** `folders`), so the feature directory
and the `lib/` domain module stay separately greppable.

### Promotion (YAGNI)

A feature-local component/hook/helper is promoted to the shared layer
(`components/`, `hooks/`, `lib/`) only once a second feature actually needs it.
Do not pre-promote speculatively.

---

## Backend

### Directory Structure

```
backend/
  cmd/
    server/          ← entry point: configuration and wiring only
  internal/
    domain/          ← entities and value objects; no dependencies on other layers
    usecase/         ← business logic; defines interfaces for everything it depends on
    repository/      ← database access; implements interfaces defined in usecase/
    handler/         ← HTTP delivery layer
      middleware/    ← HTTP-specific middleware (sessions, CSRF, rate limiting)
    worker/          ← background job workers (River queue)
    adaptor/         ← implementations of external services (Kinde/OIDC client,
                       page fetcher); satisfy interfaces defined by their consumer
    platform/        ← cross-cutting infrastructure; startup concerns only
      config/        ← environment/config parsing
    testutil/        ← integration test helpers
  pkg/               ← generic utilities with no app-specific knowledge
    safehttp/        ← SSRF-safe HTTP client
  migration/         ← numbered SQL migration pairs (golang-migrate)
```

Add `platform/observability/` when logging or metrics setup is introduced; it
is not part of the skeleton.

### Interfaces

Interfaces are defined by their consumer, in the consumer's package.

The usecase layer defines every interface it depends on — repositories, external
services, anything it calls. Implementing packages satisfy the interface without
importing from `usecase/`.

**File placement inside `usecase/`:**
- Inline in the usecase file if: ≤ 2 methods AND used only by that file
- Separate file named `<resource>_<dependency>.go` if: > 2 methods OR shared across usecases

**Visibility:** all interfaces are exported (public), regardless of placement. The placement rule already signals scope; visibility does not need to carry a second meaning.

### Workers

Workers are a delivery layer, like handlers. A worker parses its job arguments,
calls a usecase, and maps the outcome to the queue (complete, retry, discard).
Business rules, such as which fields a finished fetch may update, live in the
usecase, not the worker.

A job is enqueued after the database transaction that created its row has
committed, never inside a GORM transaction. A bookmark whose job was never
enqueued stays `pending` and is picked up by the sweep described in `STACK.md`.

### Package placement

**`internal/`** — default for all app code. Any package that imports from
`internal/domain`, `internal/platform/config`, uses app credentials, or is
otherwise coupled to this codebase stays here.

**`internal/adaptor/`** — the only place that talks to third-party systems:
the Kinde client and the page fetcher. Adaptors implement interfaces defined by
their consumer; they hold no business rules.

**`pkg/`** — zero app-specific knowledge; could be dropped into any Go project
unchanged. Requires a deliberate decision to promote. Do not place packages here
speculatively. `pkg/safehttp` is the one deliberate promotion so far: it knows
nothing about bookmarks.

**`handler/middleware/`** — HTTP middleware only. If other transports are added
(e.g. gRPC), their middleware lives under that transport's directory, not at the
top level of `internal/`.

### Exceptions

`repository/` may contain ORM infrastructure files (e.g. a custom GORM logger)
alongside repository implementations. These do not need to move to `platform/`.

### Database Migrations

Migrations live in `backend/migration/` as numbered SQL pairs, applied with
`golang-migrate`.

- **Numbering**: the next migration number is the highest existing one + 1,
  zero-padded to 6 digits (check with `ls backend/migration | tail -1`).
  Example: `000002_<description>.up.sql` / `000002_<description>.down.sql`.
- **Every migration needs both files.** The `.down.sql` must actually reverse
  the `.up.sql` (drop what was added, restore what was dropped) — not a
  no-op stub.
- **Migrations and GORM structs change together.** This codebase does not use
  `AutoMigrate`; the struct tags in `internal/domain/*.go` are the
  hand-maintained mirror of the schema. A migration that adds, renames, or
  drops a column must update the corresponding domain struct in the same
  change — and a new or changed domain field needs a migration. Column names
  in the migration must match the struct's `column:` tag exactly.
