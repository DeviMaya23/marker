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
| 4 | Verifier, second pass | `verify-2.txt` | the fix round's branch | has `<TASK>.report.md` | `TASK`, optional `FIX_BRANCH` |
| – | Drafter (before any task exists), local | `draft.txt` | your checkout | | optional `FOCUS` (no `TASK`) |

Example run:

```
bash scripts/stage.sh builder TASK=save-a-url
# read the builder's summary, then (still on main):
bash scripts/stage.sh verify-1 TASK=save-a-url
```

The drafter is not part of a task's chain and does not run in the cloud. It writes task files, so it takes no `TASK`, and `stage.sh` only prints its prompt: `bash scripts/stage.sh draft` (start by choosing what to draft) or `bash scripts/stage.sh draft FOCUS="search UI"`. Paste the output into a local session in your checkout, or run `claude "$(bash scripts/stage.sh draft)"`. The session edits files but makes no commits; you review the changes in your editor and commit them yourself. It is interactive: you answer its questions. See `docs/tasks/AUTHORING.md`.

Stop rules: two verification rounds at most. Only Blocking findings are fixed in the round; Non-blocking ones go to `docs/tasks/backlog.md`. The second pass puts its results in the PR body, not in a file.

Pull requests: one per slice, opened by the last verifier in the chain and only when that verifier finds nothing Blocking. A clean first pass opens it from the verifier's branch; after a fix round, the second pass opens it from its own branch (which carries the fix commits). A verifier that finds Blocking issues opens nothing. The agents open it through the REST API (`gh api`), since cloud sessions cannot use GraphQL, and fill the body from `.github/pull_request_template.md`. Reviewing, testing by hand and merging stay with you. A feature split across a back-end and a front-end slice merges back end first, so `main` works at every step; note the pairing under "Tested together with" in the PR.
