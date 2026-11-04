# Verifier report: css-lint-cleanup

Branch: `claude/css-lint-cleanup-verify-n95vwr` (the builder's work, `claude/css-lint-cleanup-0sc8hx` at 691de88, plus this report).
Result: **no Blocking findings**; one Non-blocking.

## Acceptance criteria

No test was added or changed; the task makes the commands the tests. "Could pass without it?" is answered per command.

| Criterion | Evidence | Status |
|---|---|---|
| Starting `npm run lint:css` output in the plan | Plan lists the same seven findings as the task file. I did not re-run the start point; the diff matches each of the seven. | Met |
| Final `npm run lint:css`: no problems, exit 0 | Ran it: exit 0, no output. Cannot pass without the fixes (the seven were real errors). | Met |
| `make lint-css` exit 0 | Ran it: exit 0. | Met |
| `make check` passes and shows stylelint between lint and tests | Exit 0. Log order: `eslint .`, then `stylelint "src/**/*.css"`, then `go test`, `npm test` (48 files, 584 tests passed), builds, redocly. | Met |
| `make lint` runs `lint-css` | `Makefile` line: `lint: lint-backend lint-frontend lint-css`; confirmed in the broken-copy run below. | Met |
| Broken stylesheet fails the build | Copied `tokens.css` to `src/styles/zz-broken-copy.css`, removed the last `}`. `make lint` exit 2, output `src/styles/zz-broken-copy.css 11:1 × Unclosed block CssSyntaxError`. Deleted the copy (`git status` clean). I ran `make lint`, not `make check`: `check` runs `lint` first, so the same step fails it. | Met |
| Existing tests pass unchanged; no test file changed | 584 passed; `git diff --name-only origin/main...HEAD` has no test file. | Met |
| Plan gives one line per deleted/moved/rewritten rule | Plan "Why the result is the same" covers `.sr-only`, the four duplicates, the folder-row move. | Met |
| Each duplicated class defined exactly once | Selector list per file compared before/after: only `.textarea`, `.field__meta`, `.field__error` (components) and `.list-sentinel` (layout) lost one occurrence each; no selector was lost. `grep` finds each once. | Met |
| Only allowed paths changed | Diff lists `Makefile`, `frontend/README.md`, `base.css`, `components.css`, `layout.css`, the plan. | Met (see N1 for the second `Makefile` line) |
| No `stylelint-disable`; config unchanged, no overrides | `git grep` finds none outside docs; `stylelint.config.js` and `package*.json` not in the diff. | Met |

## Plan check

- Every criterion appears in the plan; none missing.
- Every ticked item has a command that exists and, where I re-ran it, gives the stated result. The plan does not paste the broken-copy output or the `grep` result; I did that here.
- Plan vs diff: the plan and diff agree, including the second `Makefile` line it discloses. The plan says one `make check` run hit a flaky `EmptyTrash` test; my run passed.

## Rule checks

- Only `handler/` imports `internal/api`: not affected (no Go change).
- `user_id` filtering and `users.version`: not affected (no backend change).
- `go.mod`, `go.sum`, `package.json`, `package-lock.json`: not in the diff.
- Task-file checks, by reading the diff:
  - Deleted duplicates were identical to the surviving blocks (`origin/main` lines 82/97/104/40 vs 198/202/212/271). No other rule in `src/**/*.css` sets those properties on those classes (the only other `textarea` hit is the element selector in `base.css`, lower specificity). `.field__meta--over` still follows `.field__meta`.
  - `.sr-only` still has `position: absolute`, 1px size, `margin: -1px`, `overflow: hidden`, `clip-path: inset(50%)`, `white-space: nowrap`.
  - The active-folder colour rule now follows `.folder-row__link` and `.folder-row__link:hover`. `:hover` sets only `text-decoration`; the colour rule sets only `color`; no rule between old and new position touches `color` or `text-decoration` on `.folder-row__link`. The rule is more specific, so order does not matter.
  - Selector set: the only differences are the four removed duplicates.
  - `Makefile`: the `lint` line plus one help-text line (N1).

## Findings

### Blocking

None.

### Non-blocking

- **N1. Second `Makefile` line changed.** `lint-css`'s help text lost "(not part of check yet)" (commit b3a258c). The task file says the `Makefile` diff is the `lint` line alone, but leaving the old text would make `make help` wrong. The plan says the user asked for it; I cannot confirm that from the repo. The user should confirm.
- **N2. `.folder-error` is defined twice in `layout.css`** (once in the `.folder-empty, .folder-error` list, once alone). It predates this task and stylelint does not flag it. The properties do not overlap, so there is no cascade effect. Left as is: the task file says not to leave a selector defined twice, but that refers to the flagged ones.

## Break attempts

- Duplicate selector differing in one property in a touched file: none exists; all four deleted pairs were byte-identical.
- Selector both alone and in a comma list: `.folder-error` (N2), disjoint properties.
- `:hover` above an equal-specificity colour override: not present; the moved rule is higher specificity.
- Stylesheet added by another branch: `folder-moves` is not merged, so nothing to re-run. Re-run `npm run lint:css` on the merged result when it lands.
- Malformed input: unclosed block fails the build as above.

## Integration tests

Not run (I cannot). They exist in `backend/internal/repository/*_integration_test.go` and `backend/internal/worker/queue_integration_test.go`. No criterion depends on them; this task touches no backend code. The plan says the builder ran `make test-integration-local` and it passed.

## Known gap

No browser: rendering sameness is argued from the cascade, as the task file expects.
