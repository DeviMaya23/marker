# Task: row actions, bookmark page editing and trash actions (front end)

> Trial slice, front end, run in parallel with the back-end slice `docs/tasks/bookmark-edit-trash.md`. One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

A signed-in user can edit a bookmark's title and note, move a bookmark to the trash and undo that, restore a bookmark from the trash, and empty the trash, from the list, the bookmark page and the trash view.

The server side is being built at the same time and is **not available to you**. You build and test against mocks only: every test mocks the API wrapper. The user connects the two later.

Requirements covered: FR-8 (edit title and note, clear a note), FR-17 (delete moves to the trash, with an Undo), FR-19 (restore, which says it goes to the top level), FR-20 (empty the trash, with a strong confirmation), FR-21a (a trashed bookmark shows it is read-only and offers Restore).

Out of scope, and why:

- **Moving a bookmark to a folder** (the "Move to…" row action and the folder field on the bookmark page): there is no folder list or folder UI yet. Do not add a placeholder for it.
- Search and the top bar controls, the folder sidebar, the sync poll, the account area, the login screen (later slices).
- Per-item permanent delete (the product does not have one).
- Drag and drop. Keyboard shortcuts other than the ones named below.

## The design

Read, in `docs/design/ui-reference/` (read-only reference, not code to copy): `ui-design-brief.md` (screens 2, 3 and 4), `DECISIONS.md`, and in `src/`: `components/{BookmarkRow,TrashRow,EditBookmarkDialog,ConfirmDialog,Modal}.tsx`, `lib/toast.tsx`, `pages/{BookmarkDetailPage,TrashPage}.tsx`, `styles/*.css`.

Same rules as the previous slices: reproduce the look and behavior with your own code in this repo's stack. Do not copy any `.tsx` or `.ts` file; copy only the CSS rules these screens use (`modal-*`, `dropdown*`, `toast*`, `btn--danger*`, `icon-btn`, `textarea`, `field__meta` and what the new rows need) into `frontend/src/styles/`, keeping the class names. Do not use `@headlessui/react`, the reference's mock API, hooks, router or `react-icons`. The reference's menu styles select on Headless UI's state attributes (`data-focus`); restyle them for Base UI's own state attributes instead of copying those selectors. Icons come from `lucide-react`. Where this file and the reference disagree, this file wins; say so in your report. Known departures: the bookmark page edits through the same dialog as the list (the reference autosaves inline), and deleting needs no confirmation on the bookmark page either (see below).

## Role and ownership

Role: Frontend (see `AGENTS.md`).

You may change `frontend/**`. You may not change `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/bookmark-actions.plan.md`, see `AGENTS.md`), the Makefile, or `frontend/src/lib/api/schema.d.ts` (generated).

**Shared files.** The back-end task changes only `backend/**`. You are the only task that changes `package.json` and `package-lock.json` now, and only to add `@base-ui/react` (see Dependencies). You may change the shared test setup `src/test/setup.ts` and the shared builders in `src/test/builders.ts`.

## Operations used

All four are **not implemented on the server yet**; mock them in every test.

- `updateBookmark` (`PATCH /api/v1/bookmarks/{id}`), body `UpdateBookmarkRequest`: send only the fields that changed, among `title` and `note` (never `folder_id`, never `url`). Response `BookmarkSummary`.
- `deleteBookmark` (`DELETE /api/v1/bookmarks/{id}`), `204` with no body.
- `restoreBookmark` (`POST /api/v1/bookmarks/{id}/restore`), response `BookmarkSummary`.
- `emptyTrash` (`DELETE /api/v1/trash`), response `{ deleted: number }`.

Take the types from `src/lib/api/schema.d.ts`; write no second copy. What the server will answer (mock exactly this): `404 not_found` for an unknown or someone else's bookmark; `409 bookmark_in_trash` when editing or deleting a trashed bookmark; `409 bookmark_not_in_trash` when restoring a live one; `422 validation_error` with `errors: [{field, code: "too_long"}]` (also `invalid` and `unknown_field`, which this UI never triggers); `401`; `429` with `Retry-After`.

## Behavior

### API wrappers

In `lib/api/bookmarks.ts` add `updateBookmark(id, changes)`, `deleteBookmark(id)`, `restoreBookmark(id)` and `emptyTrash()`, typed from the schema, using the existing `apiRequest` (it already adds the CSRF header on `PATCH`, `POST` and `DELETE` and handles `204`). `changes` is `{ title?: string; note?: string | null }`: an absent key is not sent, and `note: null` is sent as an explicit `null` (that is how the server clears a note). They are thin wrappers, but the body must be exactly right, so each gets a small test.

### Shared pieces (new, in `components/ui/`, thin wrappers over Base UI)

Build each piece on Base UI's matching component (Dialog, Menu, Toast) and follow its documentation. Only the files in `components/ui/` import `@base-ui/react`; the rest of the app uses the wrappers. The behavior below is the contract of the wrappers: what Base UI already does stays Base UI's, and what this file adds (the busy rule, the timings, the item order) is yours. If Base UI has no Toast in the installed version, write the toast in this repo and say so in your report.

- **Dialog**: a modal, with a title, a body, a footer and an `onClose`. Esc closes it and a click on the backdrop closes it, unless the dialog is marked busy (then neither does anything). Focus moves into the dialog when it opens (to the element marked as the first field, else the first focusable one) and returns to what opened it when it closes. The title is the dialog's accessible name.
- **Menu**: a button that opens a short list of actions (`role="menu"`, items `role="menuitem"`). Up and Down move between items, Home and End jump to the first and last, Esc closes it and returns focus to the button, a click outside closes it, and choosing an item closes it. The button has `aria-haspopup="menu"` and `aria-expanded`. An item is either a button or a link.
- **Toast**: a provider and a `useToast()` hook with `show(message, { tone, action })`. Toasts sit in one polite live region (`role="status"`), stack, and disappear by themselves after 3.5 seconds, or 6 seconds when they carry an action. An action button runs its callback and dismisses its toast. Tones: neutral, success, error. Timers are cleared when the provider unmounts. Wire the provider into `main.tsx`.
- jsdom lacks some browser APIs the library may call (for example `ResizeObserver`, `matchMedia` or pointer events). Add the smallest stand-ins needed to `src/test/setup.ts`, never a real library mock, and list them in your report.

### Messages shown for failures (one pure function, table-driven test)

One pure function maps a failure from the four calls to what the screen shows, given which action failed. Every message below is final wording.

| Failure | Edit (inside the dialog) | Delete (error toast) | Restore (error toast) | Empty trash (inside its dialog) |
|---|---|---|---|---|
| `422 too_long` on `title` | "Title is too long (300 characters at most)." under the title | n/a | n/a | n/a |
| `422 too_long` on `note` | "Note is too long (500 characters at most)." under the note | n/a | n/a | n/a |
| `409 bookmark_in_trash` | "This bookmark is in the trash and can't be edited." | "It was already in the trash." (neutral tone) | n/a | n/a |
| `409 bookmark_not_in_trash` | n/a | n/a | "It was already restored." (neutral tone) | n/a |
| `404` | "This bookmark no longer exists." | "That bookmark no longer exists." | "That bookmark no longer exists." | n/a |
| `401` | the signed-out message | an error toast "You're logged out." with an action "Log in" that goes to the login link | same as delete | the signed-out message |
| `429` | "Too many requests. Try again in about N seconds." when `retryAfter` is a number of seconds, otherwise "Too many requests. Try again in a moment." | same text as a toast | same | same |
| anything else, including a network failure | "Couldn't save your changes." | "Couldn't move it to the trash." | "Couldn't restore it." | "Couldn't empty the trash." |

In every case except `422`, the screen also refreshes what it shows (see "Refreshing"). The login link is the one the signed-out message already builds: extract that builder from `SignedOutMessage` into a shared function; its behavior and tests do not change.

### Refreshing

There is no sync poll yet. After every successful change, and after a `404` or `409` on any of the four calls, invalidate the list queries for both the live list and the trash (everything under the `bookmark-list` key) and the bookmark page's `['bookmark', id]` query, so what is on screen follows the server. Do not update the cache by hand and do not change rows optimistically: the row changes after the server has answered.

### The list row (live bookmarks)

Add to the existing row a "more actions" button on the right: an ellipsis icon, `aria-label` "Actions for <the row's title>", always visible (not only on hover, because of touch screens). It opens the Menu with, in this order:

1. "Open original link": a link to the bookmark's URL, `target="_blank"` and `rel="noopener noreferrer"`.
2. "Edit title & note": opens the edit dialog.
3. "Delete": moves the bookmark to the trash.

There is no "Move to…" item. The row's title and meta area stays one link to `/bookmarks/{id}`.

**Delete** has no confirmation. Call `deleteBookmark`. On success, refresh and show a toast "Moved to trash." with an action "Undo" (6 seconds). Undo calls `restoreBookmark` for that bookmark; on success refresh and show a success toast "Restored to the top level."; on failure refresh and show an error toast "Couldn't undo. It may have been changed elsewhere." While a delete for a row is in flight, its menu button is disabled so it cannot be sent twice. Failures are the table above.

### The edit dialog (shared by the list row and the bookmark page)

Title "Edit bookmark". Two fields prefilled from the bookmark: "Title" (a single line) and "Note" (a text area, 4 rows, placeholder "Optional note…"). Under each, a counter "n/300" and "n/500". Count **characters as the server does, as code points**: a pasted emoji counts as 1. Do not use the `maxLength` attribute (it counts UTF-16 units). When a field is over its limit, show its counter and the "too long" message from the table and disable Save.

- Footer: Cancel and Save. Enter in the title field submits. Esc and Cancel close the dialog and discard the edits. The title field has focus when the dialog opens.
- Save is disabled until something changed. It sends only what changed: the title, trimmed, if the trimmed value differs from the stored title (an empty title is allowed: the screens then show the site's host name); the note as `null` when it is empty or only spaces and the stored note is not null, otherwise the note as typed when it differs from the stored one (a stored `null` and an empty field count as the same).
- While saving, the fields and both buttons are disabled and Esc and the backdrop do nothing, so it cannot be sent twice. A second Enter while saving does nothing.
- Success: close, refresh, success toast "Saved.". Failure: the dialog stays open, shows the message from the table (field errors under the field, the rest in a banner inside the dialog with `role="alert"`), and keeps what was typed.
- Reopening the dialog on another bookmark, or again on the same one after a save, starts from that bookmark's current values.

### The bookmark page (`/bookmarks/:id`)

Changes to the existing read-only page, which keeps everything else it does (polling, facts, page text, the host-name title fallback):

- **A live bookmark:** under the header, an actions row with "Edit" (opens the edit dialog, prefilled from the loaded bookmark) and "Delete". Delete has no confirmation and no Undo: call `deleteBookmark`, refresh (the page then shows the trashed view below) and show a toast "Moved to trash.". Failures are the table above.
- **A trashed bookmark:** the existing "In trash" banner now says "In trash. This bookmark is read-only. Restore it to edit it." and has a "Restore" button. Restore calls `restoreBookmark`, refreshes (the page then shows the live view), and shows a success toast "Restored to the top level.". There are no Edit or Delete buttons while it is trashed.
- While a delete or restore from this page is in flight, its button is disabled.
- The note section keeps showing the note when it is not null, so a cleared note disappears.
- `404` and `401` from any of these calls replace the page the same way a `404` or `401` from loading it does (the existing behavior), after the refresh.

### The trash view (`/trash`)

Changes to the existing read-only view:

- Each row gets, on the right, an icon link "Open original link" (new tab, `rel="noopener noreferrer"`) and a "Restore" button. Restore calls `restoreBookmark`, refreshes (the row leaves the trash) and shows a success toast "Restored to the top level.". Failures are the table above. A row's Restore is disabled while its request is in flight.
- At the top right, next to the heading, an "Empty trash" button (danger outline, trash icon). It is disabled while the trash is loading, empty or failed.
- "Empty trash" opens a confirmation dialog titled "Empty trash?". Its text is "This permanently deletes N bookmark(s) in the trash. This can't be undone." when the whole trash is loaded (there is no next page), with "1 bookmark" for one; when more pages exist, it is "This permanently deletes every bookmark in the trash. This can't be undone." (the count is unknown). The user must type `empty trash` to enable the confirm button, compared ignoring case and surrounding spaces. The field has focus when the dialog opens. Buttons: Cancel and "Empty trash" (danger). Esc and Cancel close it unless it is working.
- Confirming calls `emptyTrash`. While it works, both buttons and the field are disabled. Success: close, refresh, success toast "Permanently deleted N bookmark(s)." using the number the server returned ("1 bookmark" for one; for `0`, "The trash was already empty."). Failure: the dialog stays open with the message from the table.
- The trash rows are still not links to anything editable; the bookmark page still shows the "In trash" state with its Restore button.

### Known gaps

- No optimistic updates and no sync poll: a change made on another device appears only after a refresh or when the window regains focus.
- **Undo restores to the top level**, because that is what the server's restore does. It is exact for now since bookmarks cannot be in a folder from this UI; once folders exist, Undo of a delete from a folder will lose the folder.
- The signed-out detection gap (FR-3c) from the earlier slices is unchanged.
- The server is mocked; nothing here is checked against real data.

## Structure

Follow `ARCHITECTURE.md`: `features/bookmark-list` for the row actions, the trash actions and the edit dialog's list use; the bookmark page's buttons in `features/bookmark-detail`. **Features do not import each other, so the edit dialog and the failure-message function, which both features use, live in shared folders** (`components/ui/` for the dialog parts, `lib/bookmarks/` for the mutations and the messages). One hook per concern with a colocated test, written with it.

- `components/ui/`: `Dialog`, `Menu`, `Toast` (with `useToast`), as above. `lib/bookmarks/`: a hook for each of edit, delete, restore and empty trash (the call, the in-flight state, the mapped failure, the refresh) used by both features, and the message function.
- The edit dialog is one shared component that takes the bookmark's `title` and `note` and a save callback; both the list row and the bookmark page use it. It needs only those two fields, so it works with a `BookmarkSummary` and with a `BookmarkDetail`.
- Pages stay thin. Update the test helpers that wrap components so they include the toast provider.

## Dependencies

You may add `@base-ui/react` (the dialog, menu and toast components; `STACK.md` lists it). Use the current stable release and state the version in your report. If the package name does not resolve on npm, stop and ask. Nothing else: `package.json` and `package-lock.json` change only for this one package. `@tanstack/react-query`, `react-router` and `lucide-react` are installed; use them as they are.

## Acceptance criteria

All of these must have a test, run by `npm test`. Use Vitest and Testing Library, mock the API wrappers with value-return spies, use fake timers where time matters, and build a `QueryClient` with `retry: false` in tests.

**API wrappers**
- `updateBookmark` sends `PATCH` to `/bookmarks/{id}` with only the keys given; `note: null` is sent as `null` and an omitted `note` is absent from the body. `deleteBookmark` is a `DELETE`, `restoreBookmark` a `POST` to `/restore`, `emptyTrash` a `DELETE` to `/trash` and returns `{ deleted }`.

**Failure messages (pure, table-driven)**
- Every cell of the table above, including `retryAfter` of a number, zero, and null; `422` with `too_long` on the title, on the note and on both; a network failure (not an `ApiError`).

**Dialog, Menu, Toast**
- Dialog: Esc and a backdrop click close it; neither does anything while busy; focus goes to the marked field on open and back to the opener on close.
- Menu: the button toggles it; Esc closes and returns focus to the button; Down, Up, Home and End move between items; a click outside closes; choosing an item closes it; `aria-expanded` follows.
- Toast: disappears after 3.5 s (6 s with an action); the action runs its callback and dismisses it; two toasts stack; unmounting clears the timers.

**Edit dialog**
- Opens prefilled with the title and note. Save is disabled until something changes, and when the title is over 300 or the note over 500 code points (exactly 300 and 500 pass; 301 and 501 fail; an emoji counts once).
- Only changed fields are sent: title only, note only, both. A title with surrounding spaces is sent trimmed; a title changed only by surrounding spaces sends nothing. An emptied note on a bookmark that had one sends `note: null`; a spaces-only note counts as emptied; an empty note on a bookmark with no note sends nothing.
- Enter in the title submits; Esc and Cancel discard; a second Enter while saving sends nothing more; fields and buttons are disabled while saving.
- Success closes the dialog, refreshes the queries and shows "Saved.". Each failure in the table's Edit column keeps the dialog open, shows the right message in the right place and keeps what was typed. A `401` shows the signed-out message.
- Reopening starts from the current values.

**List row**
- The actions button has the accessible name "Actions for <title>". The menu holds "Open original link" (new tab, `noopener noreferrer`), "Edit title & note" and "Delete", in that order, and no "Move to…".
- Delete calls `deleteBookmark` once, refreshes, and shows "Moved to trash." with "Undo"; the menu button is disabled while it is in flight. Undo calls `restoreBookmark`, refreshes and shows "Restored to the top level."; an Undo failure shows "Couldn't undo. It may have been changed elsewhere.". Each failure in the Delete column shows its toast and refreshes. The `401` toast has a "Log in" action that goes to the login link.
- Nothing changes on screen until the refreshed list arrives (the row does not disappear before the server answers).

**Bookmark page**
- A live bookmark shows Edit and Delete, no Restore. Edit opens the dialog prefilled; saving refreshes and the page shows the new title and note (a cleared note disappears). Delete refreshes and shows "Moved to trash."; there is no Undo on this page.
- A trashed bookmark shows the banner text and a Restore button and no Edit or Delete. Restore refreshes, shows "Restored to the top level.", and the page then shows the live view.
- Buttons are disabled while their request is in flight. A `404` or `401` from these calls replaces the page as loading it would.
- The existing polling, title fallback and page-text behavior still pass their tests unchanged.

**Trash view**
- Each row has "Open original link" and a "Restore" button. Restore calls the API once, refreshes, shows the toast, and is disabled while in flight; each Restore failure shows its toast.
- "Empty trash" is disabled while loading, when empty and when the list failed. It opens the dialog with the right text for one bookmark, several, and "more pages exist" (no count). The confirm button stays disabled until `empty trash` is typed (also `Empty Trash ` with spaces and capitals); Esc and Cancel close it; while working everything is disabled and Esc does nothing.
- Success refreshes, closes and shows "Permanently deleted N bookmarks." with the server's number ("1 bookmark" for one; "The trash was already empty." for 0). A failure keeps the dialog open with its message; a `401` shows the signed-out message.

**Repo-wide**
- `make check` passes.
- No `any`, `@ts-ignore`, `@ts-expect-error` or `eslint-disable`.
- `package.json` and `package-lock.json` changed only to add `@base-ui/react`. Nothing under `backend/`, `docs/` (except the plan file), the Makefile or `openapi.yaml` changed, and nothing copied from the reference except CSS.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt. The verifier cannot run a browser, so these are by reading the code and the tests:

- `package.json` and the lockfile changed only by `@base-ui/react`; the only icon import is from `lucide-react`; there is no `@headlessui`, `radix`, Tailwind or other UI package. Only files in `components/ui/` import `@base-ui/react`.
- Request bodies and types come from `schema.d.ts`; no hand-written copy of `UpdateBookmarkRequest` or `BookmarkSummary`. `folder_id` and `url` are never sent. The `note: null` / absent distinction survives all the way to the request body.
- No `.ts` or `.tsx` file is a copy of a reference file (compare against `docs/design/ui-reference/src`); only CSS carries over.
- No feature imports another feature. The edit dialog, mutation hooks and the message function are shared, not duplicated in two features.
- No `setInterval`; toast timers are cleared on unmount. There are no optimistic cache writes (`setQueryData`, `onMutate`): the screen changes after the refresh.
- Every call site handles every row of the failure table, and `401` and `404` are never swallowed.
- Dialog: `Esc` and the backdrop are ignored while busy; focus returns to the opener. Menu: keyboard behavior as specified. Links to a saved URL carry `noopener noreferrer`.
- Page content and titles are rendered as text, never as HTML.
- Try to break it with: a title of exactly 300 and 301 code points, and emoji; a note of 500 and 501; a note of only spaces; a title of only spaces; double-clicking Save, Delete, Restore and Empty trash; Enter twice quickly; Esc while saving; opening the dialog on a bookmark that is then trashed from another tab (the `409` path); deleting a bookmark that is already gone (`404`); a trash with a next page and the Empty trash text; a `429` with and without `Retry-After`; unmounting the toast provider with a toast showing; Undo after the row was already restored.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, the design brief or this file conflict with each other.
- You think you need a change to the backend or the contract, a dependency other than `@base-ui/react`, or another UI library.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `npm ci` in `frontend/` first on a fresh checkout, run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), any place you departed from the reference design and why, the known gaps, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
