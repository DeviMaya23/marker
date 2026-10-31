# marker

A small web app for saving links and finding them again: bookmarks with folders, notes, a trash, and ranked search over the saved page text. Go backend, React and TypeScript frontend, PostgreSQL. It is also a practice project for a multi-agent build workflow.

The product is specified in `docs/requirements.md` and the HTTP contract in `openapi.yaml`. Implementation must match both. If a task conflicts with either, stop and ask.

## Reference Files

Read these before the work type they cover — not all at once, only the relevant one:

| When you're about to… | Read |
|---|---|
| Understand what the product must do, or check a behaviour | `docs/requirements.md` |
| Add or change an endpoint, a request or a response | `openapi.yaml` (`docs/api.md` is the readable companion) |
| Orient to the project stack or pick a library | `STACK.md` |
| Place a new file, create a feature, or touch an existing structure | `ARCHITECTURE.md` |
| Write any frontend or backend code | `CONVENTIONS.md` |
| Write or plan any tests | `TESTING.md` |
| Find out which part of the repo your role may change | `AGENTS.md` |

## Decision Boundaries

Ask the user before:

- editing `openapi.yaml` or `docs/requirements.md`
- adding a dependency not listed in `STACK.md`, or changing a pinned version (including the `go` directive in `go.mod`)
- adding a new shared abstraction: a shared component, a new `pkg/` package, a new top-level directory
- adding or changing a database migration outside your assigned task
- weakening or skipping a requirement, a test or a lint rule

Git: work on the branch you were assigned, commit in small steps, and push that branch so the user can review it. Never push to `main`, force-push, or rewrite history that has been pushed.
