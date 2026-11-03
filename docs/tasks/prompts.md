# Agent prompts

The prompt for each stage is a file in `docs/tasks/prompts/`. They are written for any task: `<TASK>` stands for the task file's name, so `TASK=save-a-url` means `docs/tasks/save-a-url.md`. Anything specific to one task, such as extra rules to check, goes in that task file under "Verifier checks", not in the prompts.

Start a stage with the script, which fills in the placeholders and starts a cloud session. Run it from `main`, always: a session starts from `main` as it is on GitHub, and the prompt tells the agent to move its own branch onto the one it continues from. You never check a builder or verifier branch out.

```
bash scripts/stage.sh <stage> TASK=<slug> [NAME=value ...] [--dry-run]
```

`--dry-run` prints the filled prompt without starting anything, so you can paste it into claude.ai/code instead. The script refuses to start if you are not on `main`, or if `main` has commits that are not pushed (the cloud session cannot see them).

The branch to continue from is found for you when you leave its placeholder out: the script lists up to five unmerged `claude/*` branches that have the stage's marker file (see the table), newest first, and asks you to confirm; Enter takes the first. It only reads remote refs. Passing `BUILDER_BRANCH=...` (or the other branch placeholders) skips the search. With no terminal and more than one candidate it stops and asks for the value.

| # | Stage | Prompt file | Continues from | Found by (when the placeholder is left out) | Placeholders |
|---|---|---|---|---|---|
| 1 | Builder | `builder.txt` | `main` | | `TASK` |
| 2 | Verifier, first pass | `verify-1.txt` | the builder's branch | has `<TASK>.plan.md`, no `<TASK>.report.md` | `TASK`, optional `BUILDER_BRANCH` |
| 3 | Fix round (builder) | `fix.txt` | the verifier's branch | has `<TASK>.report.md` | `TASK`, optional `VERIFIER_BRANCH`, optional `ALREADY_FIXED` |
| 4 | Verifier, second pass | `verify-2.txt` | the fix round's branch | has `<TASK>.report.md`; the PR number comes from `gh` | `TASK`, optional `FIX_BRANCH`, optional `PR_NUMBER` |

Example run:

```
bash scripts/stage.sh builder TASK=save-a-url
# read the builder's summary, then (still on main):
bash scripts/stage.sh verify-1 TASK=save-a-url
```

Stop rules: two verification rounds at most. Only Blocking findings are fixed in the round; Non-blocking ones go to `docs/tasks/backlog.md`. The second pass posts its results as a comment on the PR, not as a file.
