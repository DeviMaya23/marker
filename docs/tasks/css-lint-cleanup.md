# Task: clear the stylesheet findings and put the CSS lint into `make check` (tooling)

> One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> This is the second half of `css-lint` (merged). That task added `npm run lint:css` and `make lint-css` and left them out of `make check` because the existing stylesheets had findings. This task fixes them and then turns the check on.
>
> **Run it after `folder-moves` is merged.** Both change the files in `frontend/src/styles/`, and `folder-moves` adds CSS that may add findings of its own. Start from the current `main` and fix what the linter reports then, not only the list below.

## Goal

`make check` fails on a stylesheet that does not parse or has a clear mistake, and every stylesheet in the repo passes.

Requirements covered: none (tooling). The acceptance criteria below are the specification.

Out of scope, and why:

- Changing how anything looks. This is a cleanup: the rendered result of every rule must stay the same.
- Stylistic rules, a formatter, new lint rules or a different preset; the configuration stays as it is (`stylelint-config-recommended`, no overrides).
- Turning a rule off, adding `stylelint-disable` comments, or widening `ignoreFiles` to make a finding go away.
- The flaky `FolderSection` test noted in the `css-lint` report (it has its own backlog line).
- Any `.ts` or `.tsx` file.

## Role and ownership

Role: Frontend (see `AGENTS.md`), with one exception: this task may also change the `Makefile`, in one line.

You may change the `.css` files under `frontend/src/styles/`, the `lint` line of the `Makefile`, and the paragraph about `lint:css` in `frontend/README.md`. You may not change any `.ts` or `.tsx` file, `frontend/stylelint.config.js`, `frontend/package.json`, `frontend/package-lock.json`, `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/css-lint-cleanup.plan.md`, see `AGENTS.md`), or any other file.

**Shared files.** No other task is open when this one runs. The `Makefile` and the styles are yours alone.

## Behavior

### The findings

Run `npm run lint:css` in `frontend/` first and put its complete output in your plan. When this file was written it reported these seven problems; if the output differs, fix what it reports now.

| File and line | Rule | What it means here |
|---|---|---|
| `base.css:75` | `property-no-deprecated` | `.sr-only` uses `clip: rect(0, 0, 0, 0)`, which is deprecated |
| `components.css:198`, `:202`, `:212` | `no-duplicate-selectors` | `.textarea`, `.field__meta` and `.field__error` are each defined twice, with the same declarations |
| `layout.css:271` | `no-duplicate-selectors` | `.list-sentinel` is defined twice, with the same declarations |
| `layout.css:438`, `:448` | `no-descending-specificity` | `.folder-row__link` and `.folder-row__link:hover` come after the more specific `.folder-row:has(.folder-row__link[aria-current='page']) .folder-row__link` |

### How to fix each kind, without changing the result

- **Deprecated `clip`:** replace it with `clip-path: inset(50%)` and keep every other declaration of the rule (the element must stay visually hidden and available to screen readers).
- **Duplicate selector:** when the two blocks hold the same declarations, delete the later block. If they differ (a new finding may), merge them into the first block so that the values that were winning in the cascade still win, and say in the plan why the result is the same. Do not leave a selector defined twice, and do not delete a block whose selector is used by no component without saying so in the report.
- **Descending specificity:** reorder, never rewrite. Move the more specific rule (the active-folder colour) after the plain and `:hover` rules it overrides. The more specific rule wins by specificity in either order, so the result is the same; check that no other rule between the old and new position sets the same property on the same element.
- **Anything else the linter reports now:** fix it the same way: the smallest change that keeps the rendered result, with the reason in the plan. If a fix would change how something looks, stop and ask.

### Turning the check on

- In the `Makefile`, make `lint` also run `lint-css`: `lint: lint-backend lint-frontend lint-css`. `check` already runs `lint`, so `make check` now includes the CSS lint. Nothing else in the `Makefile` changes, and `lint-css` stays a target of its own.
- In `frontend/README.md`, change the sentence that says `lint:css` is not yet part of `make check` so that it says it now is.

### Known gaps

- The linter finds syntax errors and clear mistakes; it does not check that a class is used by any component, or that a rule looks right.
- There is no browser in the agent's session, so "the same result" is argued from the cascade, not seen. The verifier checks the arguments.

## Structure

Only the places above change. No new file other than your plan. The cleanup is small commits, one per kind of finding, and a last one for `Makefile` and `README.md`.

## Dependencies

None. `package.json` and `package-lock.json` must not change.

## Acceptance criteria

There is no new test; the lint is the test. Each item below is a command check: run it, and put its output in the report.

**Findings**
- `npm run lint:css` on the starting point: the full output, in the plan.
- `npm run lint:css` at the end: no problems, exit 0.
- `make lint-css` at the end: exit 0.

**Wiring**
- `make check` at the end passes, and its output shows stylelint ran (the `lint-css` step appears between the other lint steps and the tests).
- `make lint` runs `lint-css` too.
- A deliberately broken stylesheet fails the build: temporarily delete one closing brace in a copy of a stylesheet inside `frontend/src/styles/`, run `make check`, show that it exits non-zero and names the file, then delete the copy (say you did).

**No change in behaviour**
- Every existing test still passes unchanged (`make check`); no test file changed.
- For each rule that was deleted, merged, moved or rewritten, the plan gives one line on why the rendered result is the same (the declarations were identical; or the cascade winner is unchanged; or the specificity makes the order irrelevant).
- Every class that had a duplicate definition is still defined exactly once: show it with a search over `frontend/src/styles/`.

**Repo-wide**
- `make check` passes.
- Only the allowed paths changed: `git diff --name-only origin/main...HEAD` lists only `.css` files under `frontend/src/styles/`, `Makefile`, `frontend/README.md` and your plan.
- No `stylelint-disable`, no change to `frontend/stylelint.config.js`, and the configuration still has no rule overrides.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt. The verifier cannot run a browser, so these are by reading the diff:

- `git diff` shows only `.css` files under `frontend/src/styles/`, one line in the `Makefile`, the `README.md` sentence and the plan. No `.ts` or `.tsx`, no config, no package file.
- Read every hunk of the CSS diff and decide for yourself whether the rendered result is the same; do not rely on the plan's arguments. In particular: deleted duplicates must have had declarations identical to the block that stays (compare them in `git show origin/main:<file>`); the `.sr-only` rule must still hide the element (`position: absolute`, 1px size, `overflow: hidden`, `clip-path: inset(50%)`, `white-space: nowrap`); in the folder rows, the active-folder colour rule must come after `.folder-row__link` and `.folder-row__link:hover`, and no rule between the old and new position sets `color` or `text-decoration` on the same elements.
- No selector is defined twice any more in the three files, and none was lost: compare the list of selectors before and after (`git grep` or a short script); the only differences are the removed duplicates.
- The `Makefile` diff is the `lint` line alone; `lint-css`, `lint-frontend`, `check` and every other line are unchanged.
- Run `npm run lint:css` and `make lint-css` yourself (exit 0), and `make check`. Break a copy of a stylesheet in `src/styles/`, run `make check`, confirm it fails, remove the copy.
- No `stylelint-disable` comment anywhere and no change to `ignoreFiles`.
- Try to break it with: a duplicate selector that differs only in one property in a file the diff touched; a selector that appears both on its own and in a comma list; a `:hover` rule moved above a rule that overrides its colour at equal specificity; a stylesheet added by another branch after this one started (re-run the lint on the merged result if there is one).

## Stop and ask when

- The contract (`openapi.yaml`), a requirement or this file conflict with each other.
- A fix would change how something looks, or you think you need to turn a rule off, edit the configuration, change a `.ts`/`.tsx` file or add a dependency.
- The linter reports something this file does not cover and you cannot fix it without changing the result.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `npm ci` in `frontend/` first on a fresh checkout, run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, the starting and final output of `npm run lint:css`, the broken-copy check, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
