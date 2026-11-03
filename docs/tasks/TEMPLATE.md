# Task: <short name>

> Copy this file to `docs/tasks/<slug>.md` and fill it in. Delete every `<!-- guidance -->` comment and every section that does not apply. The slug is what `scripts/stage.sh` takes as `TASK=<slug>`.
>
> A task file is the agent's whole brief. If a behavior, message, limit or dependency is not written here, the agent will invent it, and you will find out in review. The sections below are ordered the way the agent reads them.

<!-- guidance: one paragraph for the role. Example: "Trial slice. One backend agent builds it end to end on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them." -->

## Goal

<!-- guidance: two or three sentences. What can a user do after this task that they could not before? Name the screens or operations. -->

Requirements covered: <!-- FR/NFR IDs, each of which an acceptance criterion below proves. -->

Out of scope: <!-- everything a reader might assume is included but is not. Name the neighbouring screens and operations, and say why (not built yet, a stub, later task). -->

## Role and ownership

Role: <!-- Backend | Frontend, see AGENTS.md -->

You may change `<paths>`. You may not change `<paths>`, `docs/**` (except your own plan file, `docs/tasks/<slug>.plan.md`, see `AGENTS.md`), or <!-- anything else forbidden: the contract, migrations, generated files, the Makefile -->.

<!-- guidance: for parallel tasks, list the shared files this task will touch and say who owns each one (see "Shared files" below). -->

## Operations used

<!-- guidance: the operationIds from openapi.yaml, with method and path. Say which are real on the server and which are still 501 stubs. State where types come from (generated, never hand-copied). -->

## Behavior

<!-- guidance: the heart of the file. One subsection per screen or operation, in the order things happen. For each:
- the happy path, step by step;
- every failure, with the exact message or status and code, and where it is shown;
- every limit, with its number and what happens at exactly the limit and one past it;
- for anything that changes over time (polling, retries, timers), what happens on each outcome at each point, including a failure that arrives after data is already on screen;
- the exact wording of every user-visible message, in a table if there are many.
Decide the wording yourself. The agent's invented wording will be a "judgment call" you have to review. -->

### Known gaps

<!-- guidance: things the task deliberately does not solve, with the reason, so the agent does not work around them and the verifier does not flag them. -->

## Structure

<!-- guidance: where code goes, by reference to ARCHITECTURE.md. Name hooks, helpers and components that must exist. Say what is promoted to a shared folder and what stays in its feature. -->

## Dependencies

<!-- guidance: only what STACK.md already lists. If the task needs a package that is not in STACK.md, add it to STACK.md first (AGENTS.md, "Dependencies"), then repeat it here. Only one agent at a time may change package.json, the lockfile, go.mod or go.sum. -->

## Acceptance criteria

<!-- guidance: every criterion has a test, and the test must fail if the behavior is removed. Group by unit (screen, hook, operation). Include the boundary cases and every failure above. State which tests are integration tests (written, not run by the agent). -->

**Repo-wide**
- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

<!-- guidance: checks specific to this task, on top of the repo-wide ones in the verifier prompt. Rules the diff must obey, and a list of inputs to try to break it with (boundaries, malformed input, concurrency, a failure arriving late). The verifier cannot run a browser, so say how a UI behavior is to be checked by reading code and tests. -->

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency beyond the list above, a migration, or an edit to a spec file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.

---

## Before you hand this file to an agent

- [ ] Every behavior has a message or status, not just "handle the error".
- [ ] Every limit has a number and a boundary case.
- [ ] Every dependency is already in `STACK.md`.
- [ ] Out of scope and known gaps are written down.
- [ ] Each acceptance criterion could fail if the behavior were removed.
- [ ] The file is committed and pushed to `main`. A cloud session sees only what is on GitHub.
