# Plan: css-lint-cleanup

Branch: `claude/css-lint-cleanup-0sc8hx`

No new test: the lint is the test (task file). Each item names the file and the command check.

## Starting output of `npm run lint:css` (in `frontend/`)

```
src/styles/base.css
  75:3  ×  Deprecated property "clip"  property-no-deprecated

src/styles/components.css
  198:1  ×  Duplicate selector ".textarea", first used at line 82       no-duplicate-selectors
  202:1  ×  Duplicate selector ".field__meta", first used at line 97    no-duplicate-selectors
  212:1  ×  Duplicate selector ".field__error", first used at line 104  no-duplicate-selectors

src/styles/layout.css
  271:1  ×  Duplicate selector ".list-sentinel", first used at line 40
  438:1  ×  Expected selector ".folder-row__link" to come before selector ".folder-row:has(.folder-row__link[aria-current='page']) .folder-row__link", at line 419   no-descending-specificity
  448:1  ×  Expected selector ".folder-row__link:hover" to come before selector ".folder-row:has(.folder-row__link[aria-current='page']) .folder-row__link", at line 419  no-descending-specificity

× 7 problems (7 errors, 0 warnings)
```

Same seven as the task file lists; nothing extra.

## Findings
- [x] `base.css` `.sr-only`: `clip: rect(0, 0, 0, 0)` becomes `clip-path: inset(50%)`, other declarations kept. Check: `npm run lint:css`.
- [x] `components.css`: delete the later `.textarea`, `.field__meta`, `.field__error` blocks (identical to the first). Check: `npm run lint:css` and a search that each selector is defined once.
- [x] `layout.css`: delete the later `.list-sentinel` block (identical). Same checks.
- [x] `layout.css`: move the `.folder-row:has(...) .folder-row__link` rule after `.folder-row__link:hover`. Check: `npm run lint:css`.

## Wiring
- [x] `Makefile`: `lint: lint-backend lint-frontend lint-css`. Check: `make lint` runs stylelint.
- [x] `frontend/README.md`: sentence says `lint:css` is now part of `make check`.
- [x] `npm run lint:css` and `make lint-css` exit 0 at the end.
- [x] `make check` passes and shows `lint-css` after the other lint steps.
- [x] Broken copy of a stylesheet in `frontend/src/styles/` makes `make check` fail and name the file; copy deleted.

## No change in behaviour
- [x] No test file changed; `make check` passes unchanged tests.
- [x] Each selector that had a duplicate is defined once (`grep` over `frontend/src/styles/`).
- [x] `git diff --name-only origin/main...HEAD`: only allowed paths.
- [x] No `stylelint-disable`, no config change.

## Why the result is the same
- `.sr-only`: `clip` is deprecated; `clip-path: inset(50%)` clips the 1px box to nothing, same as `clip: rect(0,0,0,0)`. Element still `position: absolute`, 1px, `overflow: hidden`, `white-space: nowrap`. (Note: the rendering is argued, not seen; no browser.)
- `.textarea`, `.field__meta`, `.field__error`, `.list-sentinel`: the later blocks held the same declarations as the first; the first stays in place. No rule between the two positions sets those properties on these classes (`resize`/`font-family` and the `field__*` selectors only appear in the two blocks), so nothing that used to win now loses. `.field__meta--over` (between the duplicates) is a different selector and stays after `.field__meta`.
- Folder rows: the active-folder colour rule has higher specificity than `.folder-row__link` and `.folder-row__link:hover`, so it wins in either order. `:hover` only sets `text-decoration`, which the colour rule does not set. The rules between old and new position set no `color`/`text-decoration` on `.folder-row__link` (`.folder-row__icon`/`__count` are other elements, `__chevron` is another element, `__name` is a span). `.folder-row__link` is the NavLink in `FolderTree.tsx`.

## Judgment calls
- `folder-moves` is not merged: only its task file is on `main`, and `frontend/src/styles/` has no folder-move CSS. The task says to run after it, but "stop and ask" does not list this, so I started from the current `main` and fixed what the linter reports now (the same seven). If `folder-moves` merges later, re-run `npm run lint:css` on the merged result.
- `.list-sentinel` is used by no component (`BookmarkList` only uses it as a `data-testid`). I kept the one definition and deleted the later duplicate, as the task says; I did not delete the class.
- The `lint-css` help text in the `Makefile` still says "(not part of check yet)". The task limits the `Makefile` change to the `lint` line, so I left it; it is now stale and the user may want it fixed.
- The `README.md` sentence now reads "It is part of `make check` (through `make lint`)."
- One `make check` run failed on `EmptyTrash.test.tsx` "focuses the field on open" (focus assertion). That test passes on its own and on the next full `make check` (584 passed). It looks flaky and is unrelated to CSS; I did not touch it.
- `make test-integration-local`: run, passed.
