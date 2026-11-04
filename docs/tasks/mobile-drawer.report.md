# Verifier report: mobile drawer

Branch: `claude/mobile-drawer-verify-fggt8b` (the session's branch, reset to the builder's `claude/mobile-drawer-dn9jw8` at `50c3a87`, plus the test additions below).

**Result: no Blocking findings.** `make check` passed (exit 0): 57 test files, 747 tests (742 before my additions), `lint:css` clean. Integration tests were **not run** by me (not allowed in this role); no acceptance criterion depends on them (frontend-only change).

Test changes by me (tests only, all in the existing `frontend/src/app-shell/AppShell.test.tsx`): a table `with the drawer open, a viewport of 768px/767px …`, `crossing 768px with a folder dialog open …`, `locks the page scroll while the drawer is open …`, `keeps Close menu outside the scrolling body with a long folder list`. All pass; the file ran three times in a row with no flake.

## Acceptance criteria

Tests are in `AppShell.test.tsx` (AS), `Drawer.test.tsx` (DR), `useMediaQuery.test.tsx` (MQ). No requirement IDs apply (the task covers none).

| Criterion | Test | Real? | Status |
|---|---|---|---|
| Hook: current match on first render | MQ `returns the match on the first render at 500/767/768px` | Yes: the viewport is set before the first render; the boundary values are covered. | Met |
| Hook: follows a change | MQ `follows a change event` | Yes: narrow to wide and back. | Met |
| Hook: stops listening on unmount | MQ `stops listening on unmount` | Yes: `listenerCount()` goes from >0 to 0. | Met |
| Wide: inline sidebar, no top bar, no menu button | AS `wide: the sidebar is inline…` | Yes: asserts `complementary` holds the nav, no `banner`, no button. | Met |
| Existing AppShell tests unchanged | AS first `describe` | Test bodies unchanged; only imports and the mock factory were widened (`createFolder`, `deleteFolder` added). | Met |
| Narrow: top bar with name and "Open menu"; no sidebar content; page present | AS `narrow: a top bar…` | Yes: asserts the nav and Trash link are absent. | Met |
| Sidebar never mounted twice | AS `switches layouts…`, `opens from the menu button…` (`trashLinks()` has length 1) and my 768/767 and dialog-resize tests | Yes: `getAllByRole` with a length check, wide, narrow-closed, narrow-open and after resize. | Met |
| Viewport narrow↔wide switches layout | AS `switches layouts as the viewport changes`, `treats 767px as narrow and 768px as wide` | Yes. | Met |
| "Open menu" opens; `aria-expanded`; dialog "Menu" with name, links, Folders | AS `opens from the menu button…` | Yes. | Met |
| Focus to Close menu, back to Open menu; Esc, backdrop, close button close | AS `focuses Close menu…`, `closes on Esc`, `closes on a backdrop click`; DR `puts focus on Close menu…` | Yes. The backdrop test fires the full pointer sequence on `.drawer-backdrop`, so it fails if the backdrop does not close. | Met |
| Links close it, including the current page's; programmatic navigation closes it | AS `closes when %s is clicked (from %s)` (4 rows), `closes when a folder is clicked…`, `closes on a location change from outside` | Yes: the rows include "All bookmarks" from `/` and "Trash" from `/trash`. The folder test starts on `/folder/a` and clicks that folder. | Met |
| Becoming wide while open closes it and shows the inline sidebar | AS `closes when the viewport becomes wide…`; mine: 768px row | Yes. | Met |
| Folder menu and dialogs do not close it; Esc closes only the dialog; focus returns; deleting the viewed folder closes it | AS `stays open when a folder menu opens`, `stays open under the %s dialog…` (New folder, Rename, Move to…, Delete), `deleting the folder in view…`, `keeps a dialog open and the drawer open when a dialog finishes elsewhere…` | Yes: counts dialogs (2 then 1), checks `aria-expanded` and the opener's focus. The delete test asserts `deleteFolder('a')` and that the drawer closes. | Met |
| Reduced motion: no animation class | DR `applies no animation class under reduced motion` (and `turns the slide on by default` as the contrast) | Yes: both panel and backdrop. The CSS `@media` fallback is checked only by reading. | Met |
| Toast outside the drawer; layering by z-index | AS `shows a toast outside the drawer, and layers…` | Yes: reads `components.css`, drawer 50 < dialogs 60 < menus 70 < toasts 80. The 60/70/80 values are pinned, so a change to them fails the test. | Met |
| `make check`, `lint:css` | ran it | Exit 0. | Met |
| No `any`, `@ts-*`, `eslint-disable`, `stylelint-disable` | grep over the changed frontend files | Only match is the word "anywhere" in a CSS property. | Met |
| Protected files unchanged | `git diff origin/main --name-only` | No `package.json`, lockfile, README, Makefile, stylelint, `backend/`, `openapi.yaml`, or `docs/` other than the plan. | Met |

Not a listed criterion but in "Behavior": the page behind does not scroll. The builder relied on Base UI and wrote no test; my added test shows `overflow-y: hidden` on the document while open and released after close. About 180 ms and the slide direction are CSS-only and cannot be verified here.

## Plan check

- Every acceptance criterion appears in the plan; none is missing.
- Every ticked item names a test that exists and checks the behavior (table above).
- Plan vs diff: the plan's file list includes `app-shell/useCloseOnNavigate (if needed)`; it was not created (the location key is handled inside `AppShell`), which matches "if needed". The other files match the diff (12 files).
- The plan says `make test-integration-local` was "not run" because no backend changed. `AGENTS.md` asks for "not run" only when the script cannot start a database. See Non-blocking 5.

## Rule checks

- Only `handler/` imports `internal/api`; repository `user_id` filters and `users.version`: not applicable, no backend files changed (diff against `origin/main` has none).
- `go.mod` / toolchain: untouched. No dependency added; `package.json` and `package-lock.json` untouched.
- Only `components/ui/Drawer.tsx` imports `@base-ui/react` (grep over `src` outside `components/ui/` finds none). Icons come from `lucide-react` only.
- Sidebar content rendered in one place: `AppShell` uses a ternary on `narrow`, either the inline `aside` or the drawer. The drawer renders `SidebarContent` only while `open`. No duplicated ids; the Trash link count is 1 in every state tested.
- CSS: the base `width:100%` and `border-bottom` on `.app-shell__sidebar` are removed (not overridden), and the narrow stacked layout is gone. The `@media (min-width: 768px)` block is unchanged. The drawer and backdrop are at z-index 50, below 60/70/80; the top bar is 40. The animation is only added by `.drawer--animated`, which `Drawer` leaves off under reduced motion, and `transition: none` sits in the `prefers-reduced-motion` query. No `stylelint-disable`.
- Closing: a click on a link inside the nav closes it (the handler ignores clicks that bubble from portaled dialogs and menus); a location-key change or a wide viewport closes it; dialogs and menus do not. Focus returns via `finalFocus={returnFocus}`.
- `src/test/setup.ts`: adds only the install and reset calls. `installMatchMedia` returns early if `matchMedia` already exists, so it replaces nothing. The default width is 1024 (wide).
- No reference file copied: `docs/design/ui-reference` uses Headless UI and its own hooks, while `Drawer.tsx` is on Base UI Dialog and `SidebarContent.tsx` is new. Only CSS class names carried over.

## Integration tests

None exist for this task and none are needed; it touches only `frontend/`. No criterion depends on them. Nothing was run, by me or by the builder.

## Findings

### Blocking

None.

### Non-blocking

1. **A dialog open in the drawer is dropped when the viewport crosses 768px.** `crossing 768px with a folder dialog open…` shows the dialog goes with the drawer and the inline sidebar mounts fresh. This follows the task file ("the inline sidebar takes its place") and the builder recorded it as a judgment call. Text typed into a half-filled "New folder" dialog is lost.
2. **The panel empties before it slides out.** `{open && <SidebarContent/>}` unmounts the content on the first closing render, so the 180 ms slide-out shows an empty panel. The task asks for unmounting on close; whether it looks wrong needs a browser (not checked).
3. **Dead rule.** `border-bottom: none` in the 768px block of `.app-shell__sidebar` no longer overrides anything. Harmless.
4. **Test nits.** `survives opening and closing ten times` awaits between steps (not "quickly") and ends with a no-op `act(() => {})`. The `matchMedia` stand-in parses one condition per query, so compound queries would return the wrong answer; only the three queries in use are supported.
5. **Handing-back step skipped.** `make test-integration-local` was not run, with a reason (no backend change) other than the one `AGENTS.md` allows. It has no bearing on this frontend change.
