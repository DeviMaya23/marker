# Decisions and judgment calls

This implements every screen and state listed in `ui-design-brief.md`, cross-checked
against `requirements.md` (v12) and `openapi.yaml`. Per the brief's own ask (§"What I'd
like back", item 4), anywhere a requirement forced an awkward UI choice, or left
something unspecified, is called out below rather than silently worked around.

## How to read this app

- `npm install && npm run dev` (see README.md) runs it against an **in-memory mock
  API**, not a real Go backend — there is no backend in this task, only
  `requirements.md`/`openapi.yaml`. The mock (`src/lib/api/`) implements the same
  request/response shapes, validation rules and error codes as `openapi.yaml`, with
  seeded data covering every state (pending/ok/failed fetches, nested folders at all
  three depths, an empty folder, notes, trashed items, etc.).
- It's a genuinely working app, not a static mockup: saving, editing, moving,
  searching, trashing, restoring, folder CRUD, duplicate detection, the bookmark cap,
  and cross-tab sync all function end to end against the mock.
- `Account & help` has a "Demo data controls" section (clearly marked as not part of
  the real product) for reaching states that are otherwise down to chance or scale —
  forcing the next write to fail with a given error code, filling to the 1,000
  bookmark cap, resetting the seed data.

## 1. Judgment calls on unclear/underspecified items

- **Visual style/brand.** `ui-design-brief.md` explicitly leaves this open ("no
  brand, palette or visual direction has been chosen. Please propose one"). I used a
  neutral ink/slate scale with a single indigo accent, system fonts (no webfont
  dependency), and small semantic colors for the three fetch states plus a danger
  color for destructive actions. See `src/styles/tokens.css`.
- **Component library.** Also explicitly open ("keep the design implementable with
  ordinary patterns"). I used Headless UI (`@headlessui/react`) for the accessible
  primitives that are genuinely hard to get right by hand — dialog/modal, dropdown
  menu, radio group, switch — and hand-rolled everything else (sidebar, folder tree,
  rows, search, infinite scroll) in plain CSS. Nothing here commits you to a specific
  design system later.
- **Row action "Edit title & note" (screen 2).** The brief lists this as a row
  action but the only editable-fields screen it fully specifies is the detail page
  (screen 3). I added a small edit dialog reachable from the row menu as a shortcut,
  in addition to full editing on the detail page — both call the same
  `PATCH /bookmarks/{id}`.
- **Delete-bookmark confirmation.** The brief says outright "Probably no
  confirmation; your call." I went with **no confirmation dialog**, but a toast with
  an **Undo** action, since the operation is reversible (soft delete, FR-17) and a
  modal for every single delete would be heavy for a list you might prune often. The
  detail page's delete action does still show a one-line confirmation, since there's
  no inline "undo" affordance once you've navigated away from the list.
- **Scope control when not inside a folder.** FR-11 and the brief describe the scope
  toggle as "all bookmarks" vs. "this folder and its subfolders," which only makes
  sense once a folder is open. On "All bookmarks" the second option is shown
  disabled (with a tooltip) rather than hidden, so the control's shape doesn't jump
  around as you navigate.
- **Bookmarklet origin.** The real bookmarklet has to hard-code a deployed origin,
  which doesn't exist here. The generated `javascript:` link reads `location.origin`
  at drag-time, so it always points at wherever this build is actually hosted,
  rather than a placeholder you'd have to remember to edit.
- **Folder picker in the save popup (screen 5).** Not specified as a particular
  control type, just "a folder picker." I used a native `<select>` there specifically
  (rather than the custom `MoveDialog` picker used elsewhere) because the popup is
  small, keyboard flow (Enter-to-save) has to stay simple, and a native select is the
  most robust thing across the four browsers in scope (NFR-1) in a ~460px popup.
- **"Trashed from another device while open" (error table, screen 2).** I implemented
  this literally: the detail page polls `GET /sync/version` like everything else, and
  if the open bookmark's `deleted_at` comes back set, it flips to the same read-only
  "In trash" banner used when you navigate to a trashed bookmark directly, rather
  than a separate toast or interstitial. Opening the app in two tabs is a genuine way
  to see this (and the rest of NFR-2) rather than a simulated one — see the next
  point.
- **"Another device," for real.** Rather than faking cross-device sync, the mock
  store is in `localStorage` plus a same-origin `BroadcastChannel`, so two tabs of
  this app really do show each other's changes within a couple of seconds, the same
  way two devices against the real API would. This seemed more honest than a canned
  animation, and it's how I visually verified NFR-2's "no scroll jump, no
  interrupted edit" requirement.
- **Rate limiting, SSRF, and other server-only NFRs** (NFR-6, 7, 8, 9, 11, 12, 13)
  have no UI surface by design — they're backend/transport concerns. The one UI-
  visible piece, the `429 rate_limited` response shape and its "try again in Ns"
  message, is wired up and reachable via the demo controls.

## 2. Component / screen / state glossary

**Screens → routes → files**

| Brief screen | Route (hash) | Component |
|---|---|---|
| 1. Logged-out / login | `#/login` | `pages/LoginPage.tsx` |
| 2. App shell + list ("All bookmarks") | `#/all` | `pages/LibraryPage.tsx` |
| 2. App shell + list (a folder) | `#/folder/:id` | `pages/LibraryPage.tsx` |
| 3. Bookmark detail | `#/bookmarks/:id` | `pages/BookmarkDetailPage.tsx` |
| 4. Trash | `#/trash` | `pages/TrashPage.tsx` |
| 5. Save popup | `#/save?url=…&title=…` | `pages/SavePopupPage.tsx` |
| 6. Account & help | `#/account` | `pages/AccountPage.tsx` |

**Shared chrome**

- `AppShell` — sidebar (desktop ≥768px) / drawer (mobile), top bar slot, content
  area. One component serves both breakpoints; CSS media queries switch which is
  visible (`src/styles/layout.css`).
- `SidebarContent` — brand, "All bookmarks", folder tree, "Trash", account menu.
  Used identically inside the fixed desktop sidebar and the mobile drawer.
- `FolderTree` / `FolderTreeRow` — recursive, collapsible, per-row "⋯" menu
  (create subfolder / rename / move / delete), disabled "new subfolder" at depth 3.
- `LibraryTopBar` — search field, scope segmented control, "include notes" switch,
  and the paste-a-URL-to-save field (the brief's second save pathway), all in one
  bar.

**List / row**

- `BookmarkList` — data fetching, infinite scroll (`IntersectionObserver` sentinel,
  pages of 50 per `openapi.yaml`'s `Limit`), and all of the list-level states below.
- `BookmarkRow` / `FetchStatusBadge` — favicon, title (host/URL fallback while
  empty), fetch-state chip, note preview, row actions (open link, edit, move,
  delete).
- `TrashRow` — same visual family, restore instead of edit/move/delete, no link to
  a detail *edit* mode.
- `Favicon` — renders the stored favicon, with a lettered fallback tile when it's
  missing or fails to load.

**States** (named to match what's in code, for the build to refer to)

- `EmptyLibrary`, `EmptyFolder`, `NoSearchResults`, `ErrorState`, `ListSkeleton` /
  `RowSkeleton`, `LimitReachedBanner` — all in `components/States.tsx`.
- Save-popup phases (`pages/SavePopupPage.tsx`): `checking-auth`, `needs-login`,
  `form`, `saving`, `saved`, `duplicate`, `error`.

**Dialogs**

- `Modal` — shared Headless UI `Dialog` chrome (title/description/body/footer).
- `ConfirmDialog` (`useConfirm()`) — generic confirm, with an optional "type this
  phrase" guard used for Empty trash and Delete account.
- `FolderFormDialog` — create/rename, inline name-length and conflict errors.
- `MoveDialog` — shared by bookmarks and folders; folder moves disable invalid
  targets (own subtree, or anything that would exceed depth 3) with a tooltip
  explaining why, per the brief's "a move picker should not offer invalid targets."
- `EditBookmarkDialog` — quick title/note edit from a list row.

## 3. Places a requirement produced an awkward UI (flagged, not hidden)

- **No "limit reached" persistent state to design around.** `openapi.yaml` doesn't
  expose a bookmark count, only a `409 bookmark_limit_reached` on `createBookmark`.
  So "you're at the cap" is necessarily a *reactive* message after a failed save,
  not a banner you'd see in advance — there's no cheap way for the client to know
  it's about to happen. I added a small mock-only count check so a banner can still
  appear proactively once you're actually at 1,000 (see the `__debugBookmarkCount`
  comment in `lib/api/client.ts`), but a real client would either track this from
  accumulated list pages or simply handle the 409 well, which is what the brief's
  own error table suggests.
- **Folder-scoped search UI has an inherent redundancy.** Because the scope control
  always renders both options, but "this folder" only means something once you're
  inside one, the control necessarily shows a disabled option on "All bookmarks."
  There's no way to make that control universally meaningful without either hiding
  it outside folders (which makes the bar reflow as you navigate, which the brief
  doesn't want) or disabling it as done here.
- **The save popup's folder picker can't reuse the app's richer `MoveDialog`.**
  FR-13/26 depth-and-conflict logic doesn't apply when *picking a destination for a
  new bookmark* (bookmarks have no depth limit), so the popup's picker is
  intentionally simpler (a flat indented `<select>`) than the move picker used
  elsewhere, which does need to reason about depth. Worth knowing so it isn't
  "fixed" into matching MoveDialog later without re-reading why it differs.
- **`window.close()` can't be guaranteed from code.** FR-3b anticipates this
  ("Where the browser does not allow closing, the page says the user can close the
  tab") — browsers only allow a script to close a window it opened itself. The popup
  calls `window.close()` optimistically and shows the fallback message if the
  window is still around ~350ms later. When this app is opened as a normal tab
  (e.g., for review) rather than via the bookmarklet's `window.open`, this fallback
  path is what you'll always see, which is expected, not a bug.

## 4. Build tooling note

This had to be built and verified inside a sandboxed environment with no package-
registry access, so it doesn't use Vite/TanStack Query/react-router/Tailwind the way
`requirements.md`'s stack section suggests for the *backend-integrated* build —
those packages simply couldn't be fetched here. Instead:

- **esbuild** (zero-config, real bundler) instead of Vite for dev/build.
- A **~70-line hash router** (`src/lib/router.tsx`) instead of react-router — the
  app only has seven routes and the save popup already has to be its own window.
- **Hand-rolled `useQuery`/`useMutation`/`useSyncVersion` hooks**
  (`src/lib/hooks.ts`) instead of TanStack Query — same shape, so swapping the real
  library in later is mechanical.
- **Plain CSS with custom-property tokens** instead of Tailwind.

All of this is ordinary, dependency-light React — nothing here is a hack specific to
this environment. On a normal machine with internet access, `npm install` pulls the
exact pinned versions used here (`package.json`) and `npm run dev` / `npm run build`
work the same way. If the real build should use Vite/TanStack Query/react-router
instead, those are drop-in replacements for `scripts/build.mjs`, `lib/hooks.ts`, and
`lib/router.tsx` respectively — nothing else references them directly.

One real gap worth flagging: this sandbox also had no access to `@types/react`, so
TypeScript types here are best-effort rather than `tsc --noEmit`-verified. I verified
correctness by building with esbuild (which transpiles but doesn't type-check) and
then exercising every screen and most interactive flows (add/edit/move/delete/undo/
duplicate/search/infinite-scroll/folder CRUD/cross-tab sync) in a real Chromium
instance via Playwright, watching for console/runtime errors rather than type errors.
`npm run typecheck` is wired up for when `@types/react`/`@types/react-dom` are
installable.
