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
- [ ] `base.css` `.sr-only`: `clip: rect(0, 0, 0, 0)` becomes `clip-path: inset(50%)`, other declarations kept. Check: `npm run lint:css`.
- [ ] `components.css`: delete the later `.textarea`, `.field__meta`, `.field__error` blocks (identical to the first). Check: `npm run lint:css` and a search that each selector is defined once.
- [ ] `layout.css`: delete the later `.list-sentinel` block (identical). Same checks.
- [ ] `layout.css`: move the `.folder-row:has(...) .folder-row__link` rule after `.folder-row__link:hover`. Check: `npm run lint:css`.

## Wiring
- [ ] `Makefile`: `lint: lint-backend lint-frontend lint-css`. Check: `make lint` runs stylelint.
- [ ] `frontend/README.md`: sentence says `lint:css` is now part of `make check`.
- [ ] `npm run lint:css` and `make lint-css` exit 0 at the end.
- [ ] `make check` passes and shows `lint-css` after the other lint steps.
- [ ] Broken copy of a stylesheet in `frontend/src/styles/` makes `make check` fail and name the file; copy deleted.

## No change in behaviour
- [ ] No test file changed; `make check` passes unchanged tests.
- [ ] Each selector that had a duplicate is defined once (`grep` over `frontend/src/styles/`).
- [ ] `git diff --name-only origin/main...HEAD`: only allowed paths.
- [ ] No `stylelint-disable`, no config change.

## Why the result is the same
- `.sr-only`: `clip` is deprecated; `clip-path: inset(50%)` clips the 1px box to nothing, same as `clip: rect(0,0,0,0)`. Element still `position: absolute`, 1px, `overflow: hidden`, `white-space: nowrap`. (Note: the rendering is argued, not seen; no browser.)
- `.textarea`, `.field__meta`, `.field__error`, `.list-sentinel`: the later blocks held the same declarations as the first; the first stays in place. No rule between the two positions sets those properties on these classes (`resize`/`font-family` and the `field__*` selectors only appear in the two blocks), so nothing that used to win now loses. `.field__meta--over` (between the duplicates) is a different selector and stays after `.field__meta`.
- Folder rows: the active-folder colour rule has higher specificity than `.folder-row__link` and `.folder-row__link:hover`, so it wins in either order. `:hover` only sets `text-decoration`, which the colour rule does not set. The rules between old and new position set no `color`/`text-decoration` on `.folder-row__link` (`.folder-row__icon`/`__count` are other elements, `__chevron` is another element, `__name` is a span). `.folder-row__link` is the NavLink in `FolderTree.tsx`.

## Judgment calls
