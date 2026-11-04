# Verification report: css-lint

Branch: `claude/css-lint-task-fdk8x1-uhl6b2` (reset to `origin/claude/css-lint-task-fdk8x1`, builder commits up to `43f01c2`, verifier commit on top).
Verdict: **no Blocking findings.**

## 1. `make check`
Passes (exit 0, 48 test files / 578 tests). The first run had one failure, `FolderSection.test.tsx:204` ("Expected `/`, received `/folder/c`"), in a folder-sidebar file this branch does not touch. It passed 3 of 3 reruns alone and on a second full `make check`. See non-blocking N1.

## 2. Acceptance criteria

| Criterion | Evidence | Real test? | Status |
|---|---|---|---|
| Well-formed BEM + `var(--token)` gives no warnings, `errored` false | `stylelint.config.test.ts` "accepts a well-formed stylesheet…" | Yes. Asserts `errored` and empty warnings. Removing the preset would throw "no rules", so it can't pass without the config. | Met |
| Unclosed block is an error and the warning is the syntax error | "reports an unclosed block as a syntax error" | Yes. Asserts `errored`, rule `CssSyntaxError`, severity `error`. No count assertion. Parser-level, so it doesn't prove the preset is loaded, but the other rows do. | Met |
| Duplicate property, unknown unit `10pxx`, empty rule each reported | `it.each` "reports %s" (rules `declaration-block-no-duplicate-properties`, `declaration-property-value-no-unknown`, `block-no-empty`) | Yes. Asserts the specific rule. | Met |
| BEM `__` / `--` not reported | "does not report BEM class names…" | Yes. Asserts empty warnings, so a `selector-class-pattern` rule would fail it. | Met |
| `npm run lint:css` on unchanged styles: full result and exit status | Section 5. Exit 2, 7 problems. | Command check | Met |
| Broken copy in `src/` exits non-zero and names file; clean file exits 0 | Verifier ran both (section 5). `zz-copy.css` (a copy of `base.css` with its last `}` removed): `80:1 Unclosed block CssSyntaxError`, exit 2. Clean file: exit 0. Files deleted afterwards. | Command check | Met |
| `make lint-css` runs it; `make help` lists it; `check` doesn't call it | `Makefile:46`, `make help` line, `check: lint test build openapi-lint`. `make lint-css` exit 2 (same findings). | Command check | Met |
| `make check` passes | Section 1 | n/a | Met (one unrelated flake) |
| Only the new test under `src/`; no `.css` changed; package files only for the two packages; Makefile only the target + `.PHONY` | `git diff origin/main...HEAD --stat`: 7 files (Makefile, plan, README, lockfile, package.json, the test, `stylelint.config.js`). 19 new lockfile entries, all transitive of stylelint / the preset. | n/a | Met |
| No `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `any`, `stylelint-disable` | `git grep` on `frontend/src` finds none. | n/a | Met |

## 3. Plan check
(`docs/tasks/css-lint.plan.md`, read after the criteria; I had glimpsed its tail in tool output earlier.)
- Every criterion is in the plan. Every ticked item has a real test, or a command result that I reproduced.
- Plan line 11 says `unit-no-unknown`, but the test asserts `declaration-property-value-no-unknown`, as the plan's own judgment calls say. The checklist line is stale. Non-blocking.
- The plan says `make test-integration-local` was run, but records no result. Not verifiable by me.
- Plan vs diff: otherwise they agree. Judgment calls (`ignoreFiles: dist/**, node_modules/**`; node docblock; `^` ranges) match the diff. `ignoreFiles` is within the "generated and build folders" allowance.

## 4. Rule checks
- Only `handler/` imports `internal/api`: no backend change in the diff, so it does not apply.
- Repository queries filter by `user_id`, and `users.version` is incremented in write transactions: no backend change, so neither applies.
- `go.mod` / toolchain: not in the diff. Dependencies: only `stylelint ^18.0.0` and `stylelint-config-recommended ^19.0.0`, both in `devDependencies`, both listed in `STACK.md`.
- `stylelint.config.js` extends only `stylelint-config-recommended`, has no rule overrides and no `null` or `false`, and `ignoreFiles` is `dist/**` and `node_modules/**`.
- Makefile: `lint`, `lint-frontend` and `check` lines are unchanged. The only diff is the `lint-css` target and its `.PHONY` entry.
- No `.css` file modified. The test uses inline strings only and runs in Node (docblock).
- `ignoreFiles`, `.github/`, and `docs/` untouched (apart from the plan).

## 5. Command output (actual, run by the verifier)
`npm run lint:css`, exit **2**:
```
src/styles/base.css
  75:3  ×  Deprecated property "clip"  property-no-deprecated

src/styles/components.css
  198:1  ×  Duplicate selector ".textarea", first used at line 82       no-duplicate-selectors
  202:1  ×  Duplicate selector ".field__meta", first used at line 97    no-duplicate-selectors
  212:1  ×  Duplicate selector ".field__error", first used at line 104  no-duplicate-selectors

src/styles/layout.css
  271:1  ×  Duplicate selector ".list-sentinel", first used at line 40  no-duplicate-selectors
  438:1  ×  Expected selector ".folder-row__link" to come before selector ".folder-row:has(.folder-row__link[aria-current='page']) .folder-row__link", at line 419        no-descending-specificity
  448:1  ×  Expected selector ".folder-row__link:hover" to come before selector ".folder-row:has(.folder-row__link[aria-current='page']) .folder-row__link", at line 419  no-descending-specificity

× 7 problems (7 errors, 0 warnings)
  1 error potentially fixable with the "--fix" option.
```
Per rule: `no-duplicate-selectors` 4, `no-descending-specificity` 2, `property-no-deprecated` 1. That is 7, matching the lines listed.

## 6. Attempts to break it (temporary `src/styles/zz-*.css`, deleted afterwards; `git status` clean)
| Input | Result |
|---|---|
| extra `}` | `Unexpected }` CssSyntaxError, exit 2 |
| comment containing `{` | clean, exit 0 |
| unclosed `@media` | `Unclosed block` CssSyntaxError, exit 2 |
| `@import` after a rule | `no-invalid-position-at-import-rule`, exit 2 |
| CSS nesting `&:hover {}` | clean, exit 0 (not a syntax error) |
| empty `.css` file | `no-empty-source`, exit 2 |
| `var(--x, 10px)` | clean, exit 0 |

Verifier additions: rows in `stylelint.config.test.ts` for the extra `}`, the unclosed `@media`, the comment brace, nesting, the `var()` fallback and the late `@import` (12 tests pass, eslint and tsc clean).

## 7. Integration tests
No integration test covers this task, and no criterion depends only on one. This task has no backend change. I did not run `make test-integration-local` or any integration test.

## 8. Findings
### Blocking
None.

### Non-blocking
- N1: `FolderSection.test.tsx` ("deleting the current folder…" path, line 204) failed once in a full `make check` and then passed. It's a timing flake in another task's test, not in this diff. Worth a backlog entry.
- N2: An empty `.css` file is reported by `no-empty-source`. That's the preset's default, noted for the cleanup task.
- N3: Plan line 11 names `unit-no-unknown`, but the actual rule is `declaration-property-value-no-unknown`.
- N4: The 7 existing findings above are the input for `css-lint-cleanup`. The task says not to fix them here. `layout.css` has no unclosed rule on this branch.
