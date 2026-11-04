<!-- Delete any section that does not apply. Keep it short: the details live in the task file, the plan and the report, so link them instead of repeating them. -->

## Task

`docs/tasks/<slug>.md` — <!-- one line: what a user can do after this merges -->

Branch chain: builder `claude/…` → verifier `claude/…` → <!-- fix round / second pass, if any -->

## What changed

<!-- 2 to 4 bullets: the behavior, not the file list. -->

-

## Evidence

- Verifier report: `docs/tasks/<slug>.report.md` — <!-- no Blocking findings | N Blocking fixed in round 2 | … -->
- Plan with judgment calls: `docs/tasks/<slug>.plan.md`
- Requirements covered: <!-- IDs; the report maps each to its test -->
- `make check`: <!-- passed on which branch/commit -->
- Integration tests (`make test-integration`): <!-- run by me, passed | not run, and why -->

## Checked by hand

<!-- What I did in a browser or with curl. Delete the lines that do not apply. -->

- [ ] Ran the app and used the feature normally
- [ ] Tried the failure paths named in the task file
- [ ] Tested together with: <!-- other branches this must work with, or "nothing else" -->

## For the reviewer

- **Judgment calls the task file did not settle** (from the plan): <!-- list the ones worth a second look, or "none" -->
- **Non-blocking findings** (from the report): <!-- fixed here | moved to docs/tasks/backlog.md | left, because … -->
- **Known gaps** (from the task file): <!-- or "none" -->
- **Departures from the task file or the design**, and why: <!-- or "none" -->

## Merge notes

<!-- Order relative to other PRs, anything to run after merging (migration, `npm ci`, new env var), or "none". -->
