# Task: lint the stylesheets (tooling)

> One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> **Prerequisite:** `STACK.md` lists `stylelint` and `stylelint-config-recommended` as frontend dev dependencies (`AGENTS.md`, "Dependencies"). If it does not, stop and ask.

## Goal

A stylesheet that does not parse, or that has an obvious mistake, is reported by a command, instead of being found by looking at the running app. This came from a real bug: `layout.css` had a rule that was never closed, so every rule after it was swallowed and the bookmark list lost its styling, while `make check` passed.

This task adds the tool and the command. It does **not** add it to `make check` and does **not** fix what it finds; the follow-up task `css-lint-cleanup` does both, once the findings are known.

Requirements covered: none (tooling). The acceptance criteria below are the specification.

Out of scope, and why:

- Putting the command in `make lint` or `make check`: the first run will probably report problems in the existing files, and wiring it in now would fail every other agent's checks. The cleanup task does it.
- **Fixing any finding** in `frontend/src/styles/*.css`, or changing any CSS. Do not touch a rule to make the linter quiet.
- Stylistic and formatting rules, a formatter such as Prettier, and the reference CSS under `docs/`.
- Linting inline `style` attributes or CSS in `.tsx` files.
- Continuous integration: do not touch `.github/`.

## Role and ownership

Role: Frontend (see `AGENTS.md`), with one exception: this task may also change the `Makefile`, to add one target.

You may change `frontend/package.json`, `frontend/package-lock.json`, `frontend/stylelint.config.js` (new), a test under `frontend/src/styles/`, `frontend/README.md`, and the `Makefile`. You may not change any `.css`, `.ts` or `.tsx` file other than your new test, `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/css-lint.plan.md`, see `AGENTS.md`), or any other file.

**Shared files.** `package.json`, the lockfile and the `Makefile` are shared. The one other open task (`folder-sidebar`) does not change them; this task is the only one that does now.

## Behavior

### The command

- `npm run lint:css` in `frontend/` runs stylelint over `src/**/*.css`, and nothing else (not `dist`, not `node_modules`, not `docs/`). It exits non-zero when anything is reported at error level, and zero when nothing is.
- `make lint-css` runs it (`cd frontend && npm run lint:css`), has a `## ` help line like the other targets, and is listed in `.PHONY`. It is **not** a prerequisite of `lint`, `lint-frontend` or `check`.

### The configuration

- One file, `frontend/stylelint.config.js`, in the ES module form the project already uses (`"type": "module"`).
- It extends `stylelint-config-recommended` and nothing else. No `stylelint-config-standard`, no plugins, no formatting rules, no `selector-class-pattern` (the class names are BEM and come from the reference design, and they must stay valid).
- Every rule of the preset stays at its default severity. Do not turn any rule off, add `ignoreFiles` beyond the generated and build folders, or put `stylelint-disable` comments in any CSS file. If a rule reports something in the existing files, that is a finding for the report (below), not something to configure away.
- Use the current stable releases and state the versions in your report. If a package name does not resolve on npm, stop and ask.

### The findings report

Run `npm run lint:css` once on the unchanged styles and put the complete result in your report, grouped by rule and file, with the number of findings per rule and one line per finding (file, line, rule, message). Do not paraphrase; copy it. If it reports nothing, say so. This list is the input of `css-lint-cleanup`.

### Known gaps

- Until the cleanup task runs, `make check` does not run the CSS lint; the command exists but nothing calls it automatically.
- The recommended preset catches syntax errors and clear mistakes (an unclosed block, duplicate properties, an unknown unit, an empty block). It does not catch a class name that no component uses, or a rule that is valid but wrong.

## Structure

- `frontend/stylelint.config.js` with the configuration above; a `lint:css` script in `frontend/package.json`; the `Makefile` target.
- One test file, `frontend/src/styles/stylelint.config.test.ts`, that uses stylelint's Node API (`stylelint.lint`) with the project's own configuration file. Run it in the Node environment (it does not need jsdom). It must not read or lint the real stylesheets (their state changes; the cleanup task depends on that freedom).
- A short paragraph in `frontend/README.md` under the existing commands: what `npm run lint:css` does and that it is not yet part of `make check`.

## Dependencies

You may add two dev dependencies to `frontend/package.json` (`STACK.md` lists them): `stylelint` and `stylelint-config-recommended`. Nothing else. `package.json` and `package-lock.json` change only for these two (and what they bring in the lockfile).

## Acceptance criteria

All of these must have a test unless marked as a command check. Tests run by `npm test`; the command checks are done by hand once and their output is in the report.

**Configuration (test, using the project's config and inline CSS strings)**
- A well-formed stylesheet with a few BEM selectors (`.bookmark-row__title:hover`, `.a--b`) and `var(--token)` values produces no warnings and `errored` is false.
- A stylesheet with a rule that is never closed (the `layout.css` bug: an open `{` followed by further rules and no closing `}`) is reported as an error, and the test checks that the result is `errored` and that the warning is the syntax error (not just "some warning").
- A rule with a duplicate property, a rule with an unknown unit (`10pxx`), and an empty rule are each reported (one case each).
- BEM class names with `__` and `--` are **not** reported (this guards against someone adding a naming rule later).

**Commands (by hand, output in the report)**
- `npm run lint:css` on the unchanged styles: the full result, as described under "The findings report", and its exit status.
- `npm run lint:css` after temporarily deleting one closing brace in a copy of a stylesheet inside `src/` (undo it afterwards and say you did): exits non-zero and names the file. A stylesheet that is clean exits zero.
- `make lint-css` runs the same command. `make help` lists it. `make check` is unchanged and still passes: show that `check` does not call `lint-css`.

**Repo-wide**
- `make check` passes.
- No file under `src/` other than the new test changed. No `.css` file changed. `package.json` and `package-lock.json` changed only for the two packages. `Makefile` changed only by the one target and its `.PHONY` entry.
- No `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `any` or `stylelint-disable`.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt:

- `git diff` of `package.json` and the lockfile shows only `stylelint` and `stylelint-config-recommended` (and their transitive entries). Both are dev dependencies.
- `stylelint.config.js` extends only `stylelint-config-recommended`, has no rule overrides set to `null` or `false`, and no ignore list beyond build output and generated files.
- No `.css` file is modified; no `stylelint-disable` comment exists anywhere.
- `lint`, `lint-frontend`, `check` and every other existing `Makefile` line are byte-for-byte unchanged apart from the new target and the `.PHONY` list.
- The test uses inline strings, not the real stylesheets, and the unclosed-block test would fail if the preset were removed from the config: check that the assertion is on the syntax-error warning, not on a count.
- The report's findings list is the actual output of the command (compare the number of findings per rule with the lines listed), not a summary.
- Try to break it with: a stylesheet with `}` too many; a comment that contains `{`; a `@media` block that is not closed; an `@import` after a rule; CSS nesting (`&:hover { }`) in a new file (it must not be reported as a syntax error); an empty `.css` file; a file that uses `var(--x, 10px)` with a fallback.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a dependency beyond the two above, a change to a CSS or source file, a change to `make check`, or another config preset.
- A package name does not resolve, or its current version needs a Node or Vite version this project does not use.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `npm ci` in `frontend/` first on a fresh checkout, run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, the two package versions, the complete findings list from the first run, the output of the command checks above, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
