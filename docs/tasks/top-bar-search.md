# Task: search bar (front end)

> One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> **Prerequisite:** `search-api` and `mobile-drawer` are merged (both are on `main`: `listBookmarks` answers searches, and `app-shell/` is settled). Start from the current `main`. `frontend/src/lib/api/schema.d.ts` must already have `q` and `include_notes` on `listBookmarks`; if it does not, stop and ask, because only the user regenerates it. Read `frontend/src/test/setup.ts` and `frontend/src/test/viewport.ts` first: browser stand-ins already exist there and you must not duplicate them.

## Goal

On the all-bookmarks page and on a folder page, a signed-in user can type in a search field above the list and see their bookmarks that match, best first, a page at a time. They can include notes in the search (off by default) and choose whether to search everything or the folder they are in, with its subfolders. This is the UI half of search; the server half is `search-api`.

Requirements covered: FR-9 (search by title, URL and page content, results in the server's relevance order), FR-10 (notes are searched only when the switch is on), FR-11 (a search on a folder page is limited to that folder and its subfolders; the other scope is all bookmarks), FR-21 (the trash is never searched: no search bar on the trash page, and a `q` in the trash URL is ignored).

Out of scope, and why:

- Moving the paste-a-URL field into the top bar: the design brief puts it there, but the field stays where it is now (above the list, in `AddUrlForm`). A line for it is in the backlog.
- The sync poll, the account area, the login screen and the "1,000 bookmark limit" message: other slices.
- Highlighted snippets, "did you mean", typo tolerance and partial-word matching: the server matches whole words, by decision, and the list shows no match text (design brief).
- A result count, a keyboard shortcut to focus the field, recent searches, saved searches.
- Searching the trash, or from the trash page or a bookmark's detail page: the contract forbids `trashed=true` with `q`, and the bar is shown only where it can work.
- Changes to `app-shell/`, to the drawer, to the folder sidebar, and to what a row shows or does.

## The design

Read, in `docs/design/ui-reference/` (read-only reference, not code to copy): the search field, scope control and notes switch in `src/components/LibraryTopBar.tsx` (ignore its add-URL form), and the CSS rules `.search-field*` (`src/styles/layout.css`), `.segmented*`, `.switch-field` and `.switch*` (`src/styles/components.css`). Copy no `.tsx` or `.ts` file; copy only CSS rules you need into `frontend/src/styles/`, adapted to Base UI's own state attributes (see its Switch and Radio Group documentation). Do not use `react-icons` or the reference's hooks. Icons come from `lucide-react` (`Search`, `X`). Where this file and the reference disagree, this file wins; say so in your report. Known departures: the reference keeps the search state in component state, this file keeps it in the URL; the reference always runs the search on each keystroke, this file waits 300 ms; the reference's scope control sets state, this file's navigates; the reference puts the search in a top bar with the add-URL field, this file puts the search block in the page body, above the add-URL field and below the title, and leaves the app shell's narrow-screen top bar alone.

## Role and ownership

Role: Frontend (see `AGENTS.md`).

You may change `frontend/**` except `package.json`, `package-lock.json`, `README.md` and the stylelint configuration. You may not change `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/top-bar-search.plan.md`, see `AGENTS.md`), the Makefile, `frontend/src/lib/api/schema.d.ts` (generated), or anything in `frontend/src/app-shell/`.

**Shared files.** No other front-end task runs now. A backend task (`sync-version`) may run at the same time; it does not touch `frontend/`. You change `pages/BookmarksPage.tsx`, `pages/FolderPage.tsx`, `features/bookmark-list/` (the list component, its hook, and new files), `lib/api/bookmarks.ts` and its test, `lib/bookmarks/queryKeys.ts`, `components/ui/` (four new files: `Switch.tsx` and `SegmentedControl.tsx`, each with its test), the shared styles (`styles/components.css`, `styles/layout.css`), and the tests that go with the changes above (the page tests, `FolderPage.test.tsx`, `App.test.tsx`, a test for `queryKeys.ts`). You must not touch anything in `app-shell/`, tests included. You do not need to change `src/test/setup.ts`; if you think you must, stop and ask.

## Operations used

- `listBookmarks` (`GET /api/v1/bookmarks`): real on the server, with `q`, `include_notes` and `folder_id`. Response `BookmarkPage`, unchanged: a search result is a page of summaries in relevance order, with the same `next_cursor`. Take the types from `schema.d.ts` (generated); do not write a type that mirrors an API shape.
- `listFolders`, already used by the sidebar and the folder page, for the folder's name.

## Behavior

### Where the search lives: the URL

The search is two query parameters on the page you are on, and nothing else:

| Parameter | Meaning | Rules |
|---|---|---|
| `q` | The search term | Trimmed. Empty, or only spaces: no search (the parameter is removed). Cut to its first 200 characters, counting characters (code points) and not UTF-16 units, then trimmed again. |
| `notes` | Include notes | `notes=1` is on. Any other value, or absent, is off. Written as `notes=1` when on and removed when off. |

A search on `/` is a search of all bookmarks; a search on `/folder/:id` is a search of that folder and its subfolders. Both pages work without parameters exactly as today. Other parameters are left alone when these two are written. The trash page, the detail page and the save page ignore both parameters.

A shared pure helper in `features/bookmark-list/lib/` reads `{ q, includeNotes }` from a `URLSearchParams` (with the rules above) and writes them back, so the bar and the list never disagree about the rules.

### The bar

A block above the add-URL field and below the page title, on **the all-bookmarks page and the folder page only** (not on the trash, detail or save pages; not on a folder page whose folder is missing, which is the page's existing rule: `useFolders` has loaded and does not list the folder). While the folders are loading, or if loading them failed, the bar is shown with the generic folder label. It is a `div` with `role="search"`, not a `<form>` (the shared `.page form` rule would add a margin to a form). It does not replace the narrow-screen top bar of the app shell, which stays.

| Control | Details |
|---|---|
| Search field | `type="search"`, accessible name "Search bookmarks", placeholder "Search title, URL and page content…", `maxLength` 200, `autoComplete="off"`, a search icon. The browser's own clear button is hidden in CSS. |
| Clear button | Inside the field, only while the field is not empty. `aria-label` "Clear search". It empties the field, applies that at once (no wait) and puts focus back in the field. |
| Scope control | A radio group named "Search scope" with two options. "All bookmarks". And the folder option: the label is `“<folder name>” & subfolders` when the name is known, otherwise "This folder & subfolders". The name is from `useFolders`, shortened with CSS ellipsis if long. On `/` the folder option is **disabled** and "All bookmarks" is selected, with the text "Open a folder to search inside it" as its `title` attribute (no tooltip component). On a folder page the folder option is selected. |
| Include-notes switch | A switch labelled "Include notes", off by default, **disabled while there is no applied term** (the URL has no `q`). Its state lives in the URL even while it is disabled, and is kept when the term is cleared. |

On a narrow screen the controls wrap: the field takes the whole row, then the scope control and the switch below it. This is CSS only. On a wide screen they sit in one row after the field when there is room.

### Typing

The field shows the user's text immediately. The text is **applied** to the URL 300 ms after the last keystroke:

- The applied term is the text trimmed and cut as above. Empty or only spaces removes `q`.
- Each keystroke restarts the 300 ms. One write happens per pause, with the latest text.
- The write replaces the current history entry (no new entry per search), and starts from the URL as it is at that moment (so a switch toggled meanwhile is kept).
- If the applied term is already what the URL has, nothing is written.
- Enter in the field applies the text at once and cancels the wait, except while the user is composing text with an input method (`isComposing`), when Enter does nothing. The Clear button does the same with an empty term.
- Unmounting the bar (leaving the page) cancels a pending write; nothing is written after it.

The field keeps exactly what the user typed after the hook's own write: a write never rewrites the field, so the trailing space in "foo " survives and "foo bar" can be typed. The hook remembers the last term it applied. The field follows the URL only when the URL's term differs from that remembered term, that is, when it changes by any other means (the browser's back or forward button, a pasted link, a link to `/?q=…`): then the field shows the new term, the remembered term becomes it, and any pending wait is dropped. When the location's **path** changes (for example a sidebar link to another folder or to "All bookmarks"), text that was typed but not yet applied is dropped, and the field shows what the new URL says (usually nothing: sidebar links carry no search, so following one ends the search). The first render shows the URL's term.

### Scope

- Choosing the folder option on a folder page, where it is already selected, does nothing.
- Choosing "All bookmarks" on a folder page goes to `/` and **keeps** the search: it applies the text now (what is in the field, trimmed and cut, even if the 300 ms has not passed) and the notes setting, and pushes a new history entry (so the back button returns to the folder page). With an empty field it still goes to `/`, without `q`. Any other query parameters on the URL are carried over unchanged.
- Choosing "All bookmarks" on `/`, where it is already selected, does nothing.
- A folder's scope cannot be chosen from `/` (disabled); the user opens a folder first.

### The notes switch

Toggling it writes `notes=1` or removes it, at once, replacing the history entry. It only changes the request when a term is applied. While there is no term it is disabled and cannot be toggled.

### The list under a search

`BookmarkList` reads the search from the URL (read-only, through the shared helper) unless `trashed` is set, in which case it ignores it. The `search` option of `useBookmarkList` is optional (`EmptyTrash` and the trash call it without one), and the hook ignores it when `trashed` is set, so a request never has both. With a non-empty applied term:

- It requests `listBookmarks` with `q` (the applied term), with `includeNotes: true` only when notes is on (the key is absent otherwise), with `folderId` on a folder page, and never with `trashed`. The wrapper sends `q` URL-encoded, `include_notes=true` only with a `q` and only when asked, and `folder_id` as it does today. A request with no term is exactly what it is today.
- Rows appear in the order the server returns them (relevance), never re-sorted. Infinite scroll works as before and every later page carries the same `q`, `include_notes` and `folder_id` with the cursor.
- A different term, notes setting or scope is a different list: its own query key (extend `bookmarkListKey` so the term and the notes flag are part of it; the key for a list with no term must not change). Changing it starts again from the first page; the list shows its loading skeleton meanwhile (the previous results are not kept on screen).
- Anything that refreshes the lists after a change (`BOOKMARK_LIST_KEY`) refreshes a search too. Row actions work as in the plain list. A bookmark saved with the add-URL field during a search refreshes the search, and the new bookmark appears only if it matches.
- The section's accessible name is "Search results" instead of "Bookmarks".

States of a search (a search with no term is the plain list with its existing states):

| State | What shows |
|---|---|
| Loading the first page | The existing skeleton. |
| No matches | A `StatePanel` (search icon, size 28) titled `No bookmarks match “<term>”.` The term is shown as text, never as HTML. Description with notes off: "Search matches whole words. Try another word, or include notes." With notes on: "Search matches whole words. Try another word." This replaces the folder page's "This folder is empty." panel and the "No bookmarks yet" panel while a search is active. |
| First page failed | The existing "Something went wrong" panel with "Try again", and the description "Couldn't search your bookmarks." |
| Signed out (any 401) | The existing signed-out message. |
| A later page failed | The existing "Couldn't load more." row with "Try again". |
| The list answers 404 on a folder page | The existing `notFound` panel. The bar is hidden only by the folders-list rule above, so it stays until the folders list is refreshed and no longer has the folder. |

A `422` is not expected from the UI (the term is cut to 200 characters before it is sent); if one comes it is the generic error above.

### Known gaps

- Choosing "All bookmarks" on a folder page leaves the folder, and the scope control then has the folder option disabled; the back button is the way back.
- A sidebar link ends the search, because the links carry no parameters.
- The loading skeleton flashes on every change of term; the previous results are not kept while the new ones load.
- Screen readers are not told when the results change.
- The field's `maxLength` counts UTF-16 units, so a term of emoji stops before 200 characters; the URL path allows 200 characters.
- Nothing is checked in a real browser; the 300 ms wait is tested with fake timers only.

## Structure

Follow `ARCHITECTURE.md` (`bookmark-list` owns list, search and add by URL) and the hook rules in `CONVENTIONS.md` (one hook per concern, a colocated test, semantic mutators, DOM handlers grouped into one spreadable object).

- `components/ui/Switch.tsx` and `components/ui/SegmentedControl.tsx`, each with its test. Both are new shared wrappers, approved for this task by the user (STACK.md: Base UI controls are wrapped in `components/ui/`, and only the wrappers import Base UI). `Switch` is on Base UI's Switch and takes `checked`, `onCheckedChange`, `disabled` and a visible text label. `SegmentedControl` is on Base UI's Radio Group and Radio and takes an accessible group label, options (`value`, `label`, `disabled`, optional `title`), `value` and `onValueChange`. Neither knows anything about search.
- `features/bookmark-list/lib/listSearch.ts` (with its test): the pure read and write helper above.
- `features/bookmark-list/hooks/useListSearch.ts` (with its test): the field's text, the debounce, the URL writes, the follow-the-URL rules, and the scope change. Returns semantic mutators and one spreadable `inputProps`. A small read-only hook for the list, `useAppliedSearch`, returns the applied `{ q, includeNotes }` from the URL (the same file or its own).
- `features/bookmark-list/components/SearchBar.tsx` (with its test): the block above. It takes the optional folder (`id`, and `name` when known).
- Changes: `BookmarkList.tsx` (reads `useAppliedSearch` unless `trashed`; the no-results and error states), `useBookmarkList.ts` (a `search` option), `lib/api/bookmarks.ts` (`q` and `includeNotes` on `ListBookmarksParams`; send only what is given), `lib/bookmarks/queryKeys.ts`, `pages/BookmarksPage.tsx` and `pages/FolderPage.tsx` (render `SearchBar` above `AddUrlForm`; the folder page passes the folder's name and not on its missing-folder branch). Pages stay thin.
- Live URL: a write starts from the URL as it is when the write happens, so read the current location (for example through a ref), not the `searchParams` captured at the last render. A scope change does three things in this order: apply the pending text, navigate, then set the remembered term.
- Query key and wrapper arguments: the term and the notes flag are **absent** from the key and from the arguments passed to `listBookmarks` when there is no term (not present with `undefined`), so the existing exact-match assertions (for example in `FolderPage.test.tsx`) keep passing. The notes flag is in the key only with a term.
- `BookmarkList` decides what an empty result shows: with a term it shows the no-results panel whatever `empty` it was given; without a term it shows `empty` as today. `FolderPage` keeps passing `empty`.
- Escape in the field does nothing special.
- Do not add a debounce utility to `lib/` or `hooks/` for a single use; keep the timer in `useListSearch`. A second feature that needs it would promote it then.

## Dependencies

None. `@base-ui/react` is installed and has Switch, Radio and Radio Group (`@base-ui/react/switch`, `radio`, `radio-group`). `package.json` and `package-lock.json` must not change. No debounce or URL-state library.

## Acceptance criteria

All of these must have a test, run by `npm test`. Use Vitest and Testing Library, mock the API wrappers with value-return spies, use fake timers where time matters (`user-event` hangs under fake timers, see `TESTING.md`: use `fireEvent` in those tests), and build a `QueryClient` with `retry: false` in tests. Tests that read the URL render inside a `MemoryRouter` with a small probe component that shows the location's path and search and the navigation type.

**`listSearch` (pure)**
- `q` is trimmed; absent, empty and only-spaces give an empty term; 200 characters pass whole; 201 are cut to 200; a string of 201 emoji is cut to 200 emoji; a cut that ends on a space is trimmed.
- `notes=1` is on; `notes=0`, `notes=true`, `notes=` and absent are off.
- Writing sets or removes `q` and `notes` and leaves other parameters untouched; an empty term removes `q`; notes off removes `notes`.

**`lib/api/bookmarks` `listBookmarks` (in the existing `bookmarks.test.ts`)**
- With `q`, the request has `q` URL-encoded (a term with a space, `&`, `"` and a non-ASCII letter round-trips through `URLSearchParams`).
- `include_notes=true` is present only with a `q` and `includeNotes: true`; it is absent with `includeNotes` and no `q`, and absent when false.
- With no `q`, the request URL is exactly what it was before this task, for the plain list, the trash and a folder.

**`useListSearch` (hook test with a harness inside a `MemoryRouter`, fake timers)**
- After the hook's own write the field still holds exactly what was typed: typing "foo " leaves "foo " in the field once "foo" is written to the URL, and typing "bar" after it gives "foo bar" and writes `q=foo bar`.
- Typing changes the field at once and the URL not at all before 300 ms; at 299 ms nothing, at 300 ms `q` is the trimmed text, and the navigation type of that write is replace.
- Two keystrokes 200 ms apart give one write, 300 ms after the second, with both letters.
- Only spaces removes `q`; text equal to the URL's term writes nothing (the location key does not change).
- Enter applies at once and a later timer does not write again; Clear empties the field, removes `q` at once and the field keeps focus.
- A URL change by other means (navigating to `/?q=bar`, then back) shows the new term in the field and drops a pending wait (no write at 300 ms).
- A change of path with typed but unapplied text drops that text; the field shows the new URL's term.
- Unmounting with a pending wait writes nothing afterwards.
- The notes toggle writes `notes=1` and removes it, replacing the entry, and keeps `q`; a write made after a toggle keeps `notes=1`.
- Choosing "All bookmarks" from a folder path goes to `/` with the pending text applied and `notes` kept, as a push; with an empty field it goes to `/` with no `q`; another query parameter on the URL (for example `x=1`) is carried over.
- Choosing "All bookmarks" on `/`, and the folder option on a folder page, each change nothing (no navigation).
- Enter while composing (a keydown with `isComposing`) applies nothing; Enter otherwise does.
- The first render shows the URL's term; a pasted `?q=` of 201 characters shows the term cut to 200.

**`SearchBar` (component test)**
- On `/`: the field, "Search scope" with "All bookmarks" checked and the folder option disabled, and the "Include notes" switch present, off and disabled.
- With `q` in the URL the switch is enabled and toggling it changes `notes` in the URL; it keeps its state in the URL when `q` is removed and shows disabled-but-on.
- On a folder page: the folder option is checked, with the folder's name in its label, or "This folder & subfolders" when no name is given; choosing "All bookmarks" navigates as above.
- The field has `maxLength` 200 and the accessible name "Search bookmarks"; the Clear button appears only when the field has text.
- On `/` the disabled folder option has the `title` "Open a folder to search inside it".

**`components/ui` wrappers (component tests)**
- `Switch`: shows its label, toggling calls `onCheckedChange` with the new value, `aria-checked` follows `checked`, a disabled switch does not call it.
- `SegmentedControl`: the group has its accessible name; the option matching `value` is checked; choosing another calls `onValueChange` with its value; a disabled option is disabled and choosing it calls nothing.

**`BookmarkList` and `useBookmarkList` with a search**
- With `/?q=foo` the first request has `q: "foo"` and no `includeNotes` key; with `notes=1` it has `includeNotes: true`; on a folder page it also has `folderId`; with no `q` it is exactly the request it was before (existing tests unchanged).
- With `trashed`, a `q` in the URL is ignored and the request has no `q`; `useBookmarkList` given both `trashed` and a `search` sends no `q`.
- `bookmarkListKey(false)` and `bookmarkListKey(false, folderId)` equal what they were before (compare with the literal arrays), and a key with a term differs from the same key without one and from one with another term or the other notes setting.
- A response that arrives late for an earlier term (hold its promise, change the term, then resolve it) is not shown under the new term.
- A second page carries the cursor and the same `q`, `includeNotes` and `folderId`.
- A change of term (or of `notes`) makes a new first-page request with no cursor and a different query key; the earlier term's cached pages are not shown for the new one.
- Rows are shown in the order the server returned (give an order that differs from newest first and from alphabetical).
- Invalidating `BOOKMARK_LIST_KEY` (as a save does) refetches an open search with the same `q`; a row action (for example delete) on a search result works and refreshes the search.
- No matches: the panel with the exact title for the term (including a term with `<b>` shown as text), the exact description with notes off and with notes on; on a folder page it replaces "This folder is empty."
- A failed first page shows "Couldn't search your bookmarks."; a 401 shows the signed-out message; a failed later page shows "Couldn't load more."
- The section's accessible name is "Search results" while searching and "Bookmarks" otherwise.

**Pages**
- On a folder page the bar shows while the folders are loading and when loading them failed (generic label in both) and when the list answers 404 but the folders list still has the folder (with the `notFound` panel under it); it is gone once the folders list has loaded without the folder.
- The bar is present on `/` and on `/folder/:id`; absent on `/trash`, on `/bookmarks/:id` and on a folder page whose folder is missing.
- The add-URL field is still present on both pages, with or without a search active.
- `/trash?q=foo` lists the trash and sends no `q`.

**Repo-wide**
- `make check` passes, including the CSS lint: `npm run lint:css` reports no problems.
- No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` or `stylelint-disable`.
- `package.json`, `package-lock.json`, `README.md`, the Makefile, any stylelint file, `schema.d.ts` and `app-shell/` are unchanged. Nothing under `backend/`, `docs/` (except the plan file) or `openapi.yaml` changed, and nothing copied from the reference except CSS.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt. The verifier cannot run a browser, so these are by reading the code and the tests:

- Only files in `components/ui/` import `@base-ui/react`; icons come only from `lucide-react`; no `package.json` or lockfile change; no debounce library; no `.ts` or `.tsx` file is a copy of a reference file (compare against `docs/design/ui-reference/src`).
- The search state is read from and written to the URL only; there is no second copy of the applied term in component or query state. The bar and the list use the same helper, so the 200-character rule exists once.
- The timer is cleared on every keystroke, on Enter, on Clear, on a URL or path change that drops text, and on unmount. Read `useListSearch` for each.
- `trashed` and `q` are never sent together, by reading `useBookmarkList` and the wrapper. A list with no term sends exactly what it sent before.
- The term is rendered as text only: no `dangerouslySetInnerHTML`, no string built into HTML. The no-results title for `<script>` or `"quoted" -word or` is the literal text.
- The bar is a `div role="search"`, not a `<form>`; the `.page form` rule does not apply to it; the CSS carried over takes its colors, spacing and radii from the tokens (`var(--…)`, no new hard-coded color) and has no `stylelint-disable`. The bar adds a `role="search"` landmark and a `searchbox` to both pages; the existing page and `App` tests query by label, role and name, and any that now finds two matches is fixed in the test, not by changing the bar.
- The existing `BookmarkList`, `useBookmarkList`, page and `AppShell` tests pass unchanged except where a test had to render inside a router.
- To confirm the tests discriminate (break the behavior, see them fail, revert): change 300 to 0; remove the clearing of the timer on unmount; remove the drop of pending text on a path change; stop sending `include_notes`; sort the rows on the client; remove the `trashed` guard in `BookmarkList`; remove the 200-character cut. Each must turn at least one test red.
- Try to break it with: `?q=%20`, `?q=`, `?notes=true`, `?q=` of 200 and of 201 characters and of emoji, `?q=%22quoted%20phrase%22%20-word%20or`, `?q=<script>`, `?q=a%26b`, `?q=100%25`; typing and clicking "All bookmarks" before 300 ms; pressing Back after a search and after a scope change; a sidebar link while a term is pending; typing, then toggling the switch within 300 ms; a folder page for an unknown folder with `?q=x`; rapid toggling of the switch; a term changed while the second page is loading (the late page must not appear under the new term).

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, the design brief or this file conflict with each other.
- You think you need a dependency, another UI library, a change in `app-shell/` or any other path outside your list, or Base UI's Switch or Radio Group cannot do something this file asks for.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `npm ci` in `frontend/` first on a fresh checkout, run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, which acceptance criteria each test covers, any place you departed from the reference design and why, the known gaps, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle. Run each test file that uses timers or navigation several times before ticking it, so a flaky test is found by you rather than by the verifier.
