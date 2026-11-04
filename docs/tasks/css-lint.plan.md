# Plan: css-lint

Branch: `claude/css-lint-task-fdk8x1`

Test file for all test items: `frontend/src/styles/stylelint.config.test.ts` (Node environment, inline CSS, project config `frontend/stylelint.config.js`).

## Configuration (tests)
- [x] Well-formed BEM + `var(--token)` stylesheet: no warnings, `errored` false. File: `stylelint.config.test.ts`, test "accepts a well-formed stylesheet".
- [x] Unclosed rule (the `layout.css` bug): `errored` true and the warning is the `CssSyntaxError` (rule `CssSyntaxError`). File: `stylelint.config.test.ts`, test "reports an unclosed block as a syntax error".
- [x] Duplicate property reported (`declaration-block-no-duplicate-properties`). File: `stylelint.config.test.ts`.
- [x] Unknown unit `10pxx` reported (`unit-no-unknown`). File: `stylelint.config.test.ts`.
- [x] Empty rule reported (`block-no-empty`). File: `stylelint.config.test.ts`.
- [x] BEM `__` and `--` class names not reported. File: `stylelint.config.test.ts`, test "does not report BEM class names".

## Files
- [x] `frontend/stylelint.config.js`: extends only `stylelint-config-recommended`, ignores only `dist`/`node_modules`.
- [x] `frontend/package.json` + lockfile: `lint:css` script, two dev dependencies only.
- [x] `Makefile`: `lint-css` target with help line and `.PHONY` entry; not a prerequisite of `lint`, `lint-frontend`, `check`.
- [x] `frontend/README.md`: short paragraph under the commands.

## Commands (by hand, output in report)
- [x] `npm run lint:css` on unchanged styles: full findings and exit status (report).
- [x] Broken copy (one `}` removed) inside `src/`: non-zero and names file; clean file exits zero; undo afterwards (report).
- [x] `make lint-css` runs it; `make help` lists it; `check` does not call `lint-css` (report).

## Repo-wide
- [x] `make check` passes.
- [x] Diff touches only allowed files; no `.css` changed; no disable comments, `any`, `@ts-*`.

## Judgment calls
- Versions: `stylelint` 18.0.0 and `stylelint-config-recommended` 19.0.0 (current stable; package.json uses `^` ranges as the rest of the file does).
- `ignoreFiles` is `dist/**` and `node_modules/**` only. The script's glob is already `src/**/*.css`; the ignore list is a guard.
- The unknown-unit case (`10pxx`) is reported by `declaration-property-value-no-unknown` in this preset version, not `unit-no-unknown`; the test asserts that rule.
- The test is in Node via a `// @vitest-environment node` docblock, so `vite.config.ts` is unchanged. It resolves the config path with `new URL(..., import.meta.url)` because `tsconfig.app.json` only has `vite/client` types (no `node:` imports).
- The unclosed-block test asserts the `CssSyntaxError` warning, severity `error`, not a count.
- "Unclosed block" check done with temporary files `zz-clean.css`/`zz-broken.css` in `src/styles/` rather than a copy of a real stylesheet; both deleted afterwards. No real CSS was touched.
- `lint-css` help text mentions it is not part of check yet; `make check` was left unchanged.
- Ran `make test-integration-local` as AGENTS.md asks, though the task is frontend-only.
