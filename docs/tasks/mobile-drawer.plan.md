# Plan: mobile drawer

Branch: `claude/mobile-drawer-dn9jw8`. Tick items as they are finished.

Files: `lib/useMediaQuery.ts(+test)`, `components/ui/Drawer.tsx(+test)`, `app-shell/SidebarContent.tsx`, `app-shell/AppShell.tsx(+test)`, `app-shell/useCloseOnNavigate` (if needed), `test/setup.ts`, `test/viewport.ts`, `styles/layout.css`, `styles/components.css`.

## useMediaQuery (`frontend/src/lib/useMediaQuery.test.tsx`)
- [ ] Returns the current match on first render
- [ ] Follows a change event
- [ ] Stops listening on unmount

## Layout (`frontend/src/app-shell/AppShell.test.tsx`)
- [ ] Wide: sidebar inline, no top bar, no menu button; existing tests unchanged
- [ ] Narrow: top bar with app name and "Open menu"; no sidebar content; page content present
- [ ] Trash link found exactly once at any viewport and drawer state
- [ ] Narrow to wide and back switches layouts without reload

## Drawer (`frontend/src/app-shell/AppShell.test.tsx`; the wrapper's own behavior in `frontend/src/components/ui/Drawer.test.tsx`)
- [ ] "Open menu" opens; aria-expanded true; dialog "Menu" holds app name, links, Folders
- [ ] Focus to "Close menu" on open, back to "Open menu" on close; Esc, backdrop, close button close
- [ ] All bookmarks, Trash, a folder link (incl. current page) close it; programmatic navigation closes it
- [ ] Becoming wide while open closes it and shows inline sidebar
- [ ] Folder menu / create, rename, move, delete dialogs do not close it; Esc closes only the dialog; focus returns to opener; deleting the viewed folder navigates to `/` and closes
- [ ] Reduced motion: no animation attribute/class applied (`Drawer.test.tsx`)
- [ ] Toast outside the drawer; z-index values in the stylesheet checked (`AppShell.test.tsx` reads the CSS)

## Repo-wide
- [ ] `make check` passes incl. `npm run lint:css`
- [ ] No `any`, ts-ignore, eslint-disable, stylelint-disable
- [ ] Protected files unchanged
