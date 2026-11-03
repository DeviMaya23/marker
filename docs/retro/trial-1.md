# Retro: first multi-agent trial (bookmark manager)

Written 2026-11-04, after the first backend slice and the second attempt of the first frontend slice. A note for myself, not a spec.

## What was tried

The flow, for each slice:

1. **Define.** Write a task file with Claude: goal, behavior, acceptance criteria, stop conditions. Contract-first: `openapi.yaml` is read-only for agents.
2. **Build.** A builder session works on its own branch, writing a plan first.
3. **Verify.** A separate verifier session reads the task file, then the plan, and writes a report with findings marked Blocking or Non-blocking.
4. **Fix and re-verify (only if there are Blocking findings).** At most two verification rounds.
5. **Review.** I read the PR, run it by hand, and merge. I am the only one who merges.

Slices run: `save-a-url` (backend: save a bookmark, fetch the page in the background; builder, verifier, fix round, second pass) and `save-form` (frontend: save popup and read-only bookmark page; attempt 1 was abandoned and redone from `main`, attempt 2 passed the first verifier with no Blocking finding).

## What worked

- **A separate verifier.** It reads the task file first and the plan second, so it can disagree with the builder. This is the part of the flow that OpenSpec's "verify" step does not have, because there the same agent checks its own work.
- **Blocking versus Non-blocking, with a two-round cap.** The nitpick spiral I was afraid of did not happen. In attempt 2 the verifier reported five Non-blocking notes and nothing was fixed.
- **Contract-first and directory ownership.** Backend and frontend agents never touched each other's files.
- **Plan first.** The builder commits a checklist (one item per acceptance criterion) before coding. It gives the verifier something to compare the diff against.
- **Generic prompts and a script.** The prompts are task-independent files in `docs/tasks/prompts/`, filled in by `scripts/stage.sh`. Task-specific rules live under "Verifier checks" in the task file.
- **`STACK.md` as the single list of allowed dependencies.** After the router, icons and TanStack Query were recorded there, the agents stopped flagging them.

## What hurt

- **Gaps in the task file cost a whole attempt.** Attempt 1 of the frontend slice failed on two things the task file should have said: the dependencies contradicted each other (the task required TanStack Query's `refetchInterval` but allowed only the router), and it did not say what a 401 mid-poll should do. Both are now explicit, and the template has a checklist for this kind of gap.
- **Conventions were enforced only by me, in PR review.** The first backend slice came out with test files named `_edge` and `_regress`, repository tests that imported the usecase layer, and a worker test that imported the repository. I caught all of it by reading diffs. The rules are now in `TESTING.md` and `ARCHITECTURE.md`, and the builder prompt says to follow them.
- **Tests that pass for the wrong reason.** A body-size test was loosened to make it pass at one point, and the verifier flagged it. The real cause was that Echo parses `"64K"` as 64,000 bytes. A weakened test is a signal to look for the cause.
- **Files I wrote to the working tree got lost.** The reflog showed no git operation that could explain it, so I believe the cause was my own tooling: edits and writes sent in the same batch, and a write that delivered an older copy of a file. I now check each write by reading the file back, and compare GitHub's `main` with what was intended after a push.
- **Unsaved changes are the ones that vanish.** Commit and push edits to agent-facing docs before switching branches.
- **A rule that conflicted with itself.** The role rules said a frontend agent may change only `frontend/**`, while the prompts told it to write its plan under `docs/`. `AGENTS.md` now has a "Task records" rule.
- **Manual steps between stages.** Finding the previous branch name, checking it out and pasting it into the script. Branch names are random (`claude/save-form-verify-hazuyg`).

## Decisions made

- Frontend: plain CSS with the design tokens from the UI reference, `react-router` with browser history, `lucide-react` as the only icon library, TanStack Query for data fetching.
- The UI design (`docs/design/ui-reference/`) is a baseline for look and behavior, not code to reuse.
- No `who-am-I` endpoint yet, so the popup learns it is signed out only when Save is pressed (FR-3c, a known gap).
- Agents never merge, and never push to `main`.

## Is it faster than my usual flow?

Not known yet. The scarce resource is my attention, not agent time. Track these per slice, starting with the next one:

| Slice | Task file writing | Agent wall time | My review and manual test | Rework rounds | Blocking findings |
|---|---|---|---|---|---|
| save-a-url (backend) | | | | 1 fix round | |
| save-form (frontend, attempt 2) | | | | 0 | 0 |

The expected payoff is cumulative: each convention I catch in a PR becomes a rule, so later slices need less review.

## Open items

- Manual browser check and `make test-integration` for the `save-form` and worker changes (mine).
- FR-3c: a who-am-I endpoint, then the popup checks at open.
- The rate limiter (its own later slice) and the `internal_error` code, which is not in the contract.
- Branch handling in `scripts/stage.sh`: find the previous stage's branch automatically and check it out. Also try asking each stage to push to a named branch, to see if the cloud session allows it.
- Chain builder to first verifier automatically, using a `Status: done | blocked` line in the plan file as the signal.
- Update `CONVENTIONS.md` rule 2 to name the fetch lookup (a load by bookmark id, no `user_id`) as an exception.

## Next trial

Backend and frontend slices in parallel. The directories do not overlap, and the contract is the shared boundary. Two backend slices in parallel would hit shared files (`domainProblems` in `problem.go`, `NewServer` and the wiring in `server.go` and `main.go`, `domain/errors.go`, `usecase/fakes_test.go`), so that needs a pre-wiring step or an Integrator first.
