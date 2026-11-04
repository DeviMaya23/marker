# Task: the mobile drawer (front end)

> One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> **Prerequisite:** `folder-moves` is merged. Start from the current `main`, and read `frontend/src/test/setup.ts` first: that task may have added browser stand-ins you must not duplicate.

## Goal

On a narrow screen the sidebar is no longer stacked above the page. A slim top bar with the app name and a menu button opens it as a panel that slides in from the left. On a wide screen nothing changes.

Requirements covered: none new (the design brief's "sidebar on desktop, drawer on mobile"). The acceptance criteria below are the specification.

Out of scope, and why:

- Search and the other top bar controls: a later slice, which will add its controls to the bar this task creates.
- Swipe gestures, remembering whether the drawer was open, and any change to what the sidebar contains.
- The account menu (later slice).
- Any change to the folder dialogs, menus or tree.

## The design

Read, in `docs/design/ui-reference/` (read-only reference, not code to copy): `src/components/AppShell.tsx` (the drawer parts) and `src/styles/layout.css` (`app-shell__topbar`, `app-shell__menu-btn`, `drawer-*`). Copy no `.tsx` or `.ts` file; copy only CSS rules you need into `frontend/src/styles/`, keeping the class names that are useful, and adapt the state selectors to Base UI's own state attributes (see its Dialog documentation). Do not use `@headlessui/react`, `react-icons` or the reference's hooks. Icons come from `lucide-react`. One known departure: the reference renders the sidebar twice (once for desktop, once in the drawer); this task renders it **once**, see below. Where this file and the reference disagree, this file wins; say so in your report.

## Role and ownership

Role: Frontend (see `AGENTS.md`).

You may change `frontend/**` except `package.json`, `package-lock.json`, `README.md` and the stylelint configuration. You may not change `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/mobile-drawer.plan.md`, see `AGENTS.md`), the Makefile, or `frontend/src/lib/api/schema.d.ts` (generated).

**Shared files.** No other front-end task runs now. A backend task may be running; it does not touch `frontend/`. You change `app-shell/`, the shared styles, `src/test/setup.ts`, the shared test helpers and `components/ui/`.

## Behavior

### Which layout

- **Wide** (viewport 768px and up): exactly as today. The sidebar is an inline `aside` beside the page, sticky, with its current content. No top bar.
- **Narrow** (below 768px): a top bar, the page below it, and **no inline sidebar**. The stacked sidebar of the previous slice is removed (its narrow-screen CSS goes). The sidebar's content (app name, "All bookmarks", "Trash", the Folders section with its dialogs) appears only inside the drawer.
- The choice between the two is made in JavaScript from the media query `(max-width: 767px)`, through one small shared hook (`useMediaQuery`, in `lib/`), so the sidebar's content, which owns dialogs and element ids, exists **once** and is never mounted twice. The hook reads the current value synchronously on first render (no flash of the wrong layout) and follows changes while the page is open.
- The sidebar's content becomes one component used by both layouts, in `app-shell/`.

### The top bar (narrow only)

A bar at the top of the page, sticky, with the app name ("marker", as in the sidebar) on the left and a menu button on the right: an icon button (menu icon), `aria-label` "Open menu", `aria-haspopup="dialog"`, `aria-expanded` following the drawer. The bar leaves room to add controls later; do not build placeholders for them.

### The drawer

A shared wrapper in `components/ui/` built on Base UI's Dialog (only wrappers in `components/ui/` import Base UI): a modal panel that slides in from the left over a backdrop.

- Width: the sidebar's width (`--sidebar-width`), but never more than 85% of the viewport. Full height. Its content scrolls inside it. A close button, "Close menu", at its top right.
- The drawer's accessible name is "Menu" (a visually hidden title).
- Opening moves focus to the close button; closing returns focus to the menu button. Focus stays inside the drawer while it is open. Esc, a click on the backdrop and the close button close it.
- The page behind does not scroll while the drawer is open.
- The slide lasts about 180 ms. With `prefers-reduced-motion: reduce` there is no animation.
- Layering: the drawer and its backdrop sit **below** the dialogs (z-index 60), the menus (70) and the toasts (80), so the folder dialogs, a row menu and a toast opened from inside the drawer appear above it.
- Only the sidebar's content is mounted while the drawer is open; it is unmounted when the drawer closes. (The folder list comes from the shared query cache, so reopening does not flash a loading state.)

### When the drawer closes by itself

- A click on any link inside it ("All bookmarks", "Trash", a folder), including the link of the page you are already on.
- Any change of location while it is open, including a redirect (deleting the folder you are viewing sends you to `/`).
- The viewport becoming 768px or wider while it is open: the drawer closes and the inline sidebar takes its place. Going from wide to narrow starts with the drawer closed.
- It does **not** close when a folder menu opens, or when a create, rename, move or delete dialog opens from inside it, or when such a dialog finishes: those happen over the drawer, and the user closes it themselves or navigates. While one of those dialogs is open, Esc closes that dialog and not the drawer.

### Known gaps

- No swipe to open or close.
- The sidebar content is unmounted when the drawer closes, so the folders' expanded and collapsed state starts again each time it opens (it is not stored anywhere today either).
- The bar has no controls other than the menu button until the search slice.
- Nothing here is checked in a real browser or on a real phone.

## Structure

Follow `ARCHITECTURE.md`. `app-shell/` composes; `components/ui/` holds the drawer wrapper; the media query hook is shared in `lib/`.

- `lib/useMediaQuery.ts` (with its test), `components/ui/Drawer.tsx` (with its test), `app-shell/` gets the extracted sidebar content component and the changed `AppShell`.
- jsdom has no `matchMedia`. Add the smallest stand-in to `src/test/setup.ts`, plus a test helper (for example `src/test/viewport.ts`) that sets the viewport width and fires the change event to listeners. The default in tests is a wide viewport, so every existing test keeps its current layout.
- Pages stay thin. Update the test helpers if they need the viewport helper.

## Dependencies

None. Base UI's Dialog is installed. `package.json` and `package-lock.json` must not change.

## Acceptance criteria

All of these must have a test, run by `npm test`. Use Vitest and Testing Library, mock the API wrappers with value-return spies, use fake timers where time matters, and build a `QueryClient` with `retry: false` in tests.

**`useMediaQuery`**
- Returns the current match on the first render; follows a change event; stops listening on unmount.

**Layout**
- Wide: the sidebar content is in the page as before, there is no top bar and no menu button. Every existing `AppShell` test passes unchanged.
- Narrow: there is a top bar with the app name and "Open menu"; the sidebar content is **not** in the document; the page content is.
- The sidebar content is never mounted twice: at any viewport and in any drawer state, `getByRole('link', { name: 'Trash' })` finds exactly one.
- Changing the viewport from narrow to wide, and back, switches layouts without a reload.

**Drawer**
- "Open menu" opens it: `aria-expanded` becomes true, a dialog named "Menu" appears holding the app name, "All bookmarks", "Trash" and the Folders section.
- Focus goes to "Close menu" on open and returns to "Open menu" on close; Esc, a backdrop click and the close button each close it.
- Clicking "All bookmarks", "Trash" and a folder closes it, including the link of the current page. A location change from outside (a programmatic navigation) closes it.
- Becoming wide while it is open closes it and shows the inline sidebar.
- A folder menu opening, and a create, rename, move or delete dialog opening from inside it, do not close it; with such a dialog open, Esc closes the dialog and the drawer stays; the dialog's focus returns to what opened it inside the drawer. Deleting the folder you are viewing (mock the call) navigates to `/` and closes the drawer.
- With reduced motion requested, no animation class or style is applied (check the attribute or class that turns the slide on).
- A toast shown while the drawer is open is in the document and not inside the drawer (so it can sit above it); check the layering by the z-index values in the stylesheet.

**Repo-wide**
- `make check` passes, including the CSS lint: `npm run lint:css` reports no problems.
- No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` or `stylelint-disable`.
- `package.json`, `package-lock.json`, `README.md`, the Makefile and any stylelint file are unchanged. Nothing under `backend/`, `docs/` (except the plan file) or `openapi.yaml` changed, and nothing copied from the reference except CSS.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt. The verifier cannot run a browser, so these are by reading the code and the tests:

- Only files in `components/ui/` import `@base-ui/react`; icons come only from `lucide-react`; no other UI package; no `package.json` or lockfile change.
- The sidebar content is rendered in exactly one place at a time (read `AppShell`: the inline `aside` and the drawer are alternatives chosen by the hook, never both). No duplicated ids.
- The CSS: the narrow-screen stacked-sidebar rules are gone, not just overridden; the desktop rules are unchanged; the drawer's z-index is below 60; the animation is turned off under `prefers-reduced-motion`; no `stylelint-disable`; `npm run lint:css` and `make check` pass (run them).
- The drawer closes on a link click and on a location change, but not when a dialog or menu opens; the focus returns to the menu button.
- The stand-in in `src/test/setup.ts` is the smallest that works, does not replace an existing stand-in, and the default viewport in tests is wide.
- No `.ts` or `.tsx` file is a copy of a reference file (compare against `docs/design/ui-reference/src`); only CSS carries over.
- Try to break it with: opening and closing the drawer ten times quickly; resizing across 768px with the drawer open and with a folder dialog open inside it; Esc with a dialog open on top of the drawer; clicking the link of the current page; deleting the folder you are viewing from inside the drawer; a viewport of exactly 767px and of 768px; a very long folder list inside the drawer (it scrolls, the close button stays reachable); reduced motion on.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, the design brief or this file conflict with each other.
- You think you need a dependency, another UI library, or a change outside the allowed paths, or Base UI's Dialog cannot do something this file asks for.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `npm ci` in `frontend/` first on a fresh checkout, run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, which acceptance criteria each test covers, any place you departed from the reference design and why, the known gaps, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle. Run each test file that uses timers or navigation several times before ticking it, so a flaky test is found by you rather than by the verifier.
