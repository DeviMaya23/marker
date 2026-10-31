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

Each agent runs in its own isolated checkout on its own branch, and stays inside the directories it owns. Directory ownership keeps branches from touching the same files, so merges stay clean.

## Schema changes

Migrations are shared state. Only one agent at a time may add migrations, and a backend agent that needs a schema change stops and asks instead of adding one. This avoids two agents claiming the same migration number.

## Verifier

Checks the finished work against the requirements, runs the tests and linters, and reports per requirement ID (FR-n, NFR-n) with evidence. It does not fix source; findings go back to the user.

## Handing back

Each agent commits and pushes its own branch (never `main`), then finishes with a short report: branch name, what changed, which requirement IDs it covers, and anything it was unsure about. The user is the only one who merges.
