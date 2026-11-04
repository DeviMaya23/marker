# Plan: css-lint

Branch: `claude/css-lint-task-fdk8x1`

Test file for all test items: `frontend/src/styles/stylelint.config.test.ts` (Node environment, inline CSS, project config `frontend/stylelint.config.js`).

## Configuration (tests)
- [ ] Well-formed BEM + `var(--token)` stylesheet: no warnings, `errored` false. File: `stylelint.config.test.ts`, test "accepts a well-formed stylesheet".
- [ ] Unclosed rule (the `layout.css` bug): `errored` true and the warning is the `CssSyntaxError` (rule `CssSyntaxError`). File: `stylelint.config.test.ts`, test "reports an unclosed block as a syntax error".
- [ ] Duplicate property reported (`declaration-block-no-duplicate-properties`). File: `stylelint.config.test.ts`.
- [ ] Unknown unit `10pxx` reported (`unit-no-unknown`). File: `stylelint.config.test.ts`.
- [ ] Empty rule reported (`block-no-empty`). File: `stylelint.config.test.ts`.
- [ ] BEM `__` and `--` class names not reported. File: `stylelint.config.test.ts`, test "does not report BEM class names".

## Files
- [ ] `frontend/stylelint.config.js`: extends only `stylelint-config-recommended`, ignores only `dist`/`node_modules`.
- [ ] `frontend/package.json` + lockfile: `lint:css` script, two dev dependencies only.
- [ ] `Makefile`: `lint-css` target with help line and `.PHONY` entry; not a prerequisite of `lint`, `lint-frontend`, `check`.
- [ ] `frontend/README.md`: short paragraph under the commands.

## Commands (by hand, output in report)
- [ ] `npm run lint:css` on unchanged styles: full findings and exit status (report).
- [ ] Broken copy (one `}` removed) inside `src/`: non-zero and names file; clean file exits zero; undo afterwards (report).
- [ ] `make lint-css` runs it; `make help` lists it; `check` does not call `lint-css` (report).

## Repo-wide
- [ ] `make check` passes.
- [ ] Diff touches only allowed files; no `.css` changed; no disable comments, `any`, `@ts-*`.

## Judgment calls
