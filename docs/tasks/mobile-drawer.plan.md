# Plan: mobile drawer

Branch: `claude/mobile-drawer-dn9jw8`. Tick items as they are finished.

Files: `lib/useMediaQuery.ts(+test)`, `components/ui/Drawer.tsx(+test)`, `app-shell/SidebarContent.tsx`, `app-shell/AppShell.tsx(+test)`, `app-shell/useCloseOnNavigate` (if needed), `test/setup.ts`, `test/viewport.ts`, `styles/layout.css`, `styles/components.css`.

## useMediaQuery (`frontend/src/lib/useMediaQuery.test.tsx`)
- [x] Returns the current match on first render
- [x] Follows a change event
- [x] Stops listening on unmount

## Layout (`frontend/src/app-shell/AppShell.test.tsx`)
- [x] Wide: sidebar inline, no top bar, no menu button; existing tests unchanged
- [x] Narrow: top bar with app name and "Open menu"; no sidebar content; page content present
- [x] Trash link found exactly once at any viewport and drawer state
- [x] Narrow to wide and back switches layouts without reload

## Drawer (`frontend/src/app-shell/AppShell.test.tsx`; the wrapper's own behavior in `frontend/src/components/ui/Drawer.test.tsx`)
- [x] "Open menu" opens; aria-expanded true; dialog "Menu" holds app name, links, Folders
- [x] Focus to "Close menu" on open, back to "Open menu" on close; Esc, backdrop, close button close
- [x] All bookmarks, Trash, a folder link (incl. current page) close it; programmatic navigation closes it
- [x] Becoming wide while open closes it and shows inline sidebar
- [x] Folder menu / create, rename, move, delete dialogs do not close it; Esc closes only the dialog; focus returns to opener; deleting the viewed folder navigates to `/` and closes
- [x] Reduced motion: no animation attribute/class applied (`Drawer.test.tsx`)
- [x] Toast outside the drawer; z-index values in the stylesheet checked (`AppShell.test.tsx` reads the CSS)

## Repo-wide
- [x] `make check` passes incl. `npm run lint:css`
- [x] No `any`, ts-ignore, eslint-disable, stylelint-disable
- [x] Protected files unchanged

## Judgment calls
- **Drawer closes by location key.** The drawer remembers the router location key it opened at and counts as closed when the key differs. A redirect or programmatic navigation therefore closes it, including one to the same path (it makes a new key). A link click also closes it, for the current page's link, where the key may not change.
- **Wide viewport.** The drawer state is cleared whenever the viewport is wide. The sidebar remounts in the inline `aside`, so a dialog open inside the drawer at that moment is dropped, and so is the folders' expanded state.
- **Reduced motion.** The slide is on only when the panel has the `drawer--animated` class. `Drawer` omits that class when `prefers-reduced-motion: reduce` matches, which the test checks. The stylesheet also sets `transition: none` under the media query.
- **Focus return.** `Drawer` takes an optional `returnFocus` ref (the menu button), so focus returns there even where a click does not focus a button.
- **Page scroll lock.** I rely on Base UI's modal Dialog scroll lock. jsdom cannot show it, so no test covers it.
- **Z-index.** The drawer and its backdrop are at 50 and the top bar at 40, below the dialogs (60), menus (70) and toasts (80).
- **Test stand-in.** `src/test/viewport.ts` holds the `matchMedia` stand-in, with `setViewport`, `setReducedMotion` and `listenerCount`. `setup.ts` installs it and resets it after each test. It is skipped under `@vitest-environment node`, because `stylelint.config.test.ts` runs there. Nothing was added to `setup.ts` earlier by `folder-moves`.
- **Layering test.** Vitest does not load CSS, so the test reads `components.css` from disk with `node:fs` (via a `/// <reference types="node" />` line) and compares the z-index values.
- **Roles in tests.** A modal drawer hides the page behind it, and the dialog on top of it hides the drawer, so those tests query with `hidden: true`. Toasts have role `dialog`, so the tests find the folder dialog by its text.
- **Top bar.** It has only the app name and the menu button, as a `header` (role banner). The brand text appears again inside the drawer, because the sidebar content includes it.
- **Not run.** The `make test-integration-local` step from AGENTS.md was not run: this task changes no backend code.
