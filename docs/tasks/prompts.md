# Agent prompts

The prompt for each stage is a file in `docs/tasks/prompts/`. They are written for any task: `<TASK>` stands for the task file's name, so `TASK=save-a-url` means `docs/tasks/save-a-url.md`. Anything specific to one task, such as extra rules to check, goes in that task file under "Verifier checks", not in the prompts.

Start a stage with the script, which fills in the placeholders and starts a cloud session from your current branch:

```
bash scripts/stage.sh <stage> TASK=<slug> [NAME=value ...] [--dry-run]
```

`--dry-run` prints the filled prompt without starting anything, so you can paste it into claude.ai/code instead. The script refuses to start if you are not on the branch the stage should start from.

| # | Stage | Prompt file | Start from | Placeholders |
|---|---|---|---|---|
| 1 | Builder | `builder.txt` | `main` | `TASK` |
| 2 | Verifier, first pass | `verify-1.txt` | the builder's branch | `TASK`, `BUILDER_BRANCH` |
| 3 | Fix round (builder) | `fix.txt` | the verifier's branch | `TASK`, `VERIFIER_BRANCH`, optional `ALREADY_FIXED` |
| 4 | Verifier, second pass | `verify-2.txt` | the fix round's branch | `TASK`, `FIX_BRANCH`, `PR_NUMBER` |

Example run:

```
bash scripts/stage.sh builder TASK=save-a-url
# read the builder's summary, then:
git checkout <builder branch>
bash scripts/stage.sh verify-1 TASK=save-a-url BUILDER_BRANCH=<builder branch>
```

Stop rules: two verification rounds at most. Only Blocking findings are fixed in the round; Non-blocking ones go to `docs/tasks/backlog.md`. The second pass posts its results as a comment on the PR, not as a file.
