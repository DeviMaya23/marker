# Agents

How the work divides between agent roles. Every agent also follows `CLAUDE.md`, `CONVENTIONS.md` and the reference files that match its task.

## The contract comes first

`openapi.yaml` and `docs/requirements.md` are the shared contract. No agent edits them; ask the user. Backend and frontend agents work independently against `openapi.yaml`: the frontend builds against a mock of the API while the backend is still being written.

## Roles

| Role | May change | Must not change |
|---|---|---|
| Foundation | Scaffold, migrations for the core entities, shared types, one thin end-to-end slice | Feature work beyond the slice |
| Backend | `backend/**`, except `backend/migration/` | `frontend/**`, the contract, existing migrations |
| Frontend | `frontend/**` | `backend/**`, the contract |
| Integrator | Any file, to merge work and fix the seams between pieces | Add features, or change requirements |
| Verifier | Tests and a verification report | Source code |

**Task records.** Each task keeps its records under `docs/tasks/`: the builder's plan (`<task>.plan.md`), the verifier's report (`<task>.report.md`) and the shared `backlog.md`. The agent a prompt names writes that record, and these are the only files under `docs/` an agent may change. No agent edits the task file itself, `requirements.md` or any other doc.

Each agent runs in its own isolated checkout on its own branch, and stays inside the directories it owns. Directory ownership keeps branches from touching the same files, so merges stay clean.

## Implementing an operation

Backend agents implement operations by defining methods on `*handler.Server` in a feature file, replacing the 501 stub (see `ARCHITECTURE.md`). Local development signs in with `GET /auth/dev-login?name=alice` (`AUTH_DEV_LOGIN=true`); tests build sessions directly and never use that route.

## Schema changes

Migrations are shared state. Only one agent at a time may add migrations, and a backend agent that needs a schema change stops and asks instead of adding one. This avoids two agents claiming the same migration number.

## Dependencies

A dependency not listed in `STACK.md` needs the user's approval first (`CLAUDE.md`), and the user records it in `STACK.md` before the task that needs it starts. A task file's "Dependencies" section only repeats what `STACK.md` already allows. Only one agent at a time may change `package.json`, `package-lock.json`, `go.mod` or `go.sum`; an agent that needs a new package stops and asks. This keeps two branches from conflicting on the same lockfile.

## Verifier

Checks the finished work against the requirements, runs the tests and linters, and reports per requirement ID (FR-n, NFR-n) with evidence. It does not fix source; findings go back to the user.

## Handing back

Before pushing, an agent runs `make check`. A fresh checkout has no `node_modules`: run `npm ci` in `frontend/` first. Integration tests (build tag `integration`) are written but not run by agents; the report says so. Each agent commits and pushes its own branch (never `main`), then finishes with a short report: branch name, what changed, which requirement IDs it covers, and anything it was unsure about. The user is the only one who merges.
