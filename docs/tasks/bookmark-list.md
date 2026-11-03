# Task: bookmark list and trash view (front end)

> Trial slice, front end, run in parallel with the back-end slice `docs/tasks/list-bookmarks.md`. One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

A signed-in user sees their saved bookmarks as a list, newest first, which loads more rows as they scroll, and can open a read-only view of their trash. The list replaces the temporary home page at `/`; the paste-a-URL field stays on top of it.

The server side (`listBookmarks`) is being built at the same time and is **not available to you**. You build and test against mocks only: every test mocks the API wrapper, and you cannot see this screen against real data. The user connects the two later.

Requirements covered: FR-7 (list, newest first, infinite scroll), FR-18 (view the trash, read-only), FR-3 (the paste-a-URL field keeps working and now refreshes the list), FR-5a (the fetch state shown per row).

Out of scope, and why:

- Search, the scope control, "include notes" (later slice; the server does not support `q` yet).
- The folder sidebar and folder filtering (folders are not built).
- Row actions: open original link, edit, move, delete. Restore and Empty trash in the trash view. These operations are still stubs on the server.
- The sync poll that refreshes the list every few seconds (NFR-2; the endpoint is not built). See "Known gaps".
- The "limit reached" banner (it needs a bookmark count; the add field already shows the cap message when a save fails).
- The account menu, log out, the bookmarklet help page.

## The design

Read, in `docs/design/ui-reference/` (read-only reference, not code to copy):

- `ui-design-brief.md`: screens 2 and 4 are yours, minus what is out of scope above.
- `DECISIONS.md`: judgment calls and the glossary of names (`BookmarkList`, `BookmarkRow`, `TrashRow`, `EmptyLibrary`, `ErrorState`, `ListSkeleton`).
- `src/components/{BookmarkList,BookmarkRow,TrashRow,States,Favicon}.tsx`, `src/pages/{LibraryPage,TrashPage}.tsx`, `src/components/LibraryTopBar.tsx` (the add field), `src/lib/format.ts` (`formatDate`).
- `src/styles/*.css`: the look.

Same rules as the previous slice: reproduce the look and behavior with your own code in this repo's stack. Do not copy any `.tsx` or `.ts` file; copy only the CSS rules these screens use (`bookmark-row` and its parts, `bookmark-list`, `skeleton`, `list-sentinel`, and whatever the nav needs) into `frontend/src/styles/`, keeping the class names. Do not use the reference's mock API, hooks, router, toast or `react-icons`. Icons come from `lucide-react`. Where this file and the reference disagree, this file wins; say so in your report.

## Role and ownership

Role: Frontend (see `AGENTS.md`).

You may change `frontend/**`. You may not change `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/bookmark-list.plan.md`, see `AGENTS.md`), the Makefile, or `frontend/src/lib/api/schema.d.ts` (generated).

**Shared files.** The back-end task changes only `backend/**`. You change no dependency: `package.json` and `package-lock.json` stay as they are.

## Operations used

- `listBookmarks` (`GET /api/v1/bookmarks`), response `BookmarkPage`. It is **not implemented on the server yet**; you use only `trashed` and `cursor` and never send `limit`, `q`, `include_notes` or `folder_id`.
- `createBookmark` (already built, used by the add field).

Take every type from `src/lib/api/schema.d.ts`; do not write a second copy of `BookmarkPage` or `BookmarkSummary`.

What the server will answer (the contract; mock exactly this): `200 { items: BookmarkSummary[], next_cursor: string | null }`. `next_cursor` is `null` on the last page. `items` is `[]` when there is nothing. The live list is newest first and the trash most recently trashed first; trashed items carry `deleted_at`. `401` when signed out. `429` when rate limited.

## Behavior

### Routes and navigation

- `/` is the **bookmark list** (this replaces the temporary home page; remove it). `/trash` is the **trash view**. Existing routes (`/save`, `/bookmarks/:id`, the not-found page) keep working. The back link on the bookmark page and the link on the not-found page still go to `/`.
- A small top navigation, in `app-shell/` as `ARCHITECTURE.md` places it, on the list and the trash view: the app name, a link "All bookmarks" (`/`) and a link "Trash" (`/trash`). The current page's link is marked with `aria-current="page"`. Plain markup: no sidebar, no menu, no dialog.
- Each page has a heading: "All bookmarks" and "Trash".

### The list (`/`)

Top of the page: the paste-a-URL field (the existing `AddUrlForm`), then the list.

- **Query.** Use TanStack Query's `useInfiniteQuery`. The first page is requested with no cursor; the next page with the previous page's `next_cursor`. When `next_cursor` is `null` there is no next page. Never send `limit`. The query key separates the live list from the trash, so the two never share cache. Pass `retry: false` on these queries: the screen has its own "Try again".
- **Rows.** One row per bookmark, in the order the server sent. Each row has:
  - the favicon (tile or image, as on the bookmark page);
  - the title as plain text, or the URL's host name while the title is empty (`www.example.com` for `https://www.example.com/a`, the whole URL if it cannot be parsed);
  - the fetch-state chip: "Fetching…" for `pending`, "Fetch failed" for `failed`, nothing for `ok`;
  - a meta line: the host name, a dot, and the created date as given by `formatDate` below.
  - The whole title and meta area is one link to `/bookmarks/{id}`. No other controls.
- **`formatDate(iso, now)`** is a pure function in `features/bookmark-list/lib/`. With `now` passed in so it can be tested: under a minute "just now"; under an hour "Nm ago"; under a day "Nh ago"; under 7 days "Nd ago" (floor each); otherwise the short date with `toLocaleDateString(undefined, { month: "short", day: "numeric" })`, and the year added when it differs from `now`'s year.
- **Infinite scroll.** An invisible sentinel element after the last row. When it comes within 400 px of the viewport (`IntersectionObserver`, `rootMargin: "400px"`) and a next page exists and no page request is in flight, request the next page. The sentinel is not rendered when there is no next page. The observer is disconnected when the list unmounts or the sentinel goes away. If `IntersectionObserver` does not exist, the hook does nothing and does not throw.
- **States.**
  - Loading (first page): six skeleton rows, `aria-busy="true"` on the list region.
  - Loading more: two skeleton rows below the last row.
  - Empty library (first page has no items): title "No bookmarks yet", text "Paste a URL above to save your first link."
  - Error on the first page: a state panel, title "Something went wrong", text "Couldn't load your bookmarks.", and a "Try again" button that refetches.
  - Error while loading a later page: keep every row on screen and show, below them, "Couldn't load more." with a "Try again" button that retries that page.
  - `401` (on any page): the signed-out message from the previous slice replaces the list. A `401` on a later page replaces the rows too.
  - `429`: treat it as any other error (the state panel above). No special wording in this slice.
- **The add field.** On a successful save: clear the input, refetch the list (invalidate the list queries), and stay on the list; do **not** navigate (this changes `AddUrlForm`, which used to go to the bookmark page). The failure messages, the duplicate link ("Open it") and the signed-out message stay as they are. The page needs no extra heading for the field beyond its label.

### The trash view (`/trash`)

Read-only. Same layout and states as the list, with these differences:

- The query asks for `trashed: true`; its rows are the trash, in the order the server sent.
- A row shows the favicon, the title (or host), and a meta line: the host name, a dot, and "trashed " followed by `formatDate(deleted_at)`. If `deleted_at` is unexpectedly `null`, leave the "trashed …" part out and do not crash. No fetch-state chip. The row links to `/bookmarks/{id}` (the bookmark page already shows the "In trash" banner).
- No add field. No Restore, no Empty trash, no row actions.
- Empty: title "Trash is empty", text "Deleted bookmarks show up here."
- Error text: "Couldn't load the trash." The other states are the same as the list.

### Known gaps

- **No automatic refresh.** The sync poll is a later slice. The list refetches after a save and when the window regains focus (TanStack's default); a `pending` row's chip updates then, not by itself. Do not add a timer.
- **The server is mocked.** Nothing here is checked against real data. If the contract and a real response ever differ, that shows up when the user connects the two, not in your report.
- The signed-out message for the list has the same known gap as the earlier slice (no who-am-I endpoint, FR-3c): the list learns it is signed out only when a call returns `401`.

## Structure

Follow `ARCHITECTURE.md`: `features/bookmark-list/{components,hooks,lib}`, `pages/` as thin route entries, `app-shell/` for the nav, shared pieces in `components/ui/` and `lib/`. One hook per concern with a colocated test, written with it.

- `lib/api/bookmarks.ts`: add `listBookmarks({ trashed, cursor })`, typed from the schema, building the query string (`trashed=true` only when true; `cursor` only when given, URL-encoded). It is a thin wrapper, but it builds a query string, so it gets a small test.
- **Promote to shared** (this is the second feature that needs them; move, do not copy, and keep `git mv` history): `Favicon` and `FetchStatusChip` from `features/bookmark-detail/components/` to `components/ui/`, and `hostOf` from `features/bookmark-detail/lib/` to `lib/`, with their tests. Update `bookmark-detail`'s imports. Its behavior and its tests (apart from import paths) do not change.
- `features/bookmark-list/hooks/`: `useBookmarkList({ trashed })` (the infinite query and its mapping to what the screen needs: flattened rows, loading, error kind, whether there is a next page, fetch-next, retry) and a hook that watches a sentinel and calls a callback when it becomes visible. A hook that attaches effects to a DOM ref is tested through a small harness component, not bare `renderHook` (`CONVENTIONS.md`).
- `features/bookmark-list/components/`: the list, the row, the trash row, the skeletons, plus the existing `AddUrlForm`. Use the shared `StatePanel` for the empty and error states, extending it only if it cannot express what you need.
- `pages/`: replace `HomePage` with a bookmarks page and add a trash page. Update `App.tsx` and its routes.
- Test fixtures: a small builder for `BookmarkSummary` and for `BookmarkPage` under `src/test/`, shared by the tests. Do not install a mocking library (no MSW).

## Dependencies

None. `@tanstack/react-query`, `react-router` and `lucide-react` are already installed; use them as they are. No change to `package.json` or `package-lock.json`.

## Acceptance criteria

All of these must have a test, run by `npm test`. Use Vitest and Testing Library, mock `listBookmarks` and `createBookmark` at the wrapper boundary with value-return spies, and use fake timers where time matters. Tests build their own `QueryClient` with `retry: false`. Stub `IntersectionObserver` inside the tests that need it; do not add a global stub.

**`listBookmarks` wrapper**
- No arguments: no query string. `trashed: true`: `trashed=true`. `trashed: false`: no `trashed` parameter. A cursor with `+`, `/`, `=` or `&` in it arrives URL-encoded.

**`formatDate` (pure, table-driven, with a fixed `now`)**
- 30 seconds, 59 seconds, 60 seconds, 59 minutes, 60 minutes, 23 hours, 24 hours, 6 days, 7 days, a date in the same year (no year shown), a date in an earlier year (year shown).

**List**
- Rows show in the order given. A row shows the title; an empty title shows the host name; an empty title with a URL that cannot be parsed shows the whole URL. A title containing `<b>x</b>` appears literally.
- The chip: `pending` shows "Fetching…", `failed` shows "Fetch failed", `ok` shows no chip.
- Each row links to `/bookmarks/{id}`. The favicon falls back to the tile when `favicon_url` is null.
- First load shows the skeleton; an empty first page shows "No bookmarks yet".
- The first request carries no cursor; when the sentinel becomes visible the next request carries the first page's `next_cursor`; a third page does the same; when `next_cursor` is `null` the sentinel is not rendered and no more requests are made.
- A second "visible" event while a page request is in flight makes no second request.
- A first-page error shows "Couldn't load your bookmarks." and "Try again" requests the first page again. A later-page error keeps the rows, shows "Couldn't load more.", and its "Try again" requests that page again (with the same cursor).
- A `401` on the first page and a `401` on a later page each replace the list with the signed-out message.
- The observer is disconnected on unmount. With no `IntersectionObserver` defined, rendering the list does not throw.

**Add field (the changed behavior)**
- A successful save clears the input, refetches the list, and does not navigate. A duplicate still links to the existing bookmark; a `401` still shows the signed-out message; each failure keeps what was typed.

**Trash view**
- It asks for `trashed: true`. A row shows "trashed " and the date from `deleted_at`, shows no chip, and links to `/bookmarks/{id}`. A `null` `deleted_at` shows the row without the "trashed" text.
- It has no add field, no Restore button, no Empty trash button.
- Empty shows "Trash is empty"; an error shows "Couldn't load the trash."; a `401` shows the signed-out message; it pages the same way as the list.
- The list and the trash do not share cache: opening the trash after the list does not show the list's rows while loading.

**Navigation**
- `/` shows the list and `/trash` shows the trash. The link of the current page has `aria-current="page"`. The unknown-path page still works.

**Promoted components**
- `bookmark-detail`'s tests still pass with only their import paths changed.

**Repo-wide**
- `make check` passes.
- No `any`, `@ts-ignore`, `@ts-expect-error` or `eslint-disable`.
- `package.json` and `package-lock.json` unchanged. Nothing under `backend/`, `docs/` (except the plan file), the Makefile or `openapi.yaml` changed, and nothing copied from the reference except CSS.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt. The verifier cannot run a browser, so these are by reading the code and the tests:

- `package.json` and the lockfile are unchanged; the only icon import is from `lucide-react`.
- `listBookmarks`'s request and response types come from `schema.d.ts`; no hand-written copy of `BookmarkPage` or `BookmarkSummary`. `limit`, `q`, `include_notes` and `folder_id` are never sent.
- No `.ts` or `.tsx` file is a copy of a reference file (compare against `docs/design/ui-reference/src`); only CSS carries over, and only rules these screens use.
- The list and the trash use different query keys. `useInfiniteQuery` is used for paging; there is no `setInterval` and no hand-written timer, and there is no page-number or offset state.
- Row content (title, host) is rendered as text, never through `dangerouslySetInnerHTML`.
- No feature imports another feature. `Favicon`, `FetchStatusChip` and `hostOf` were moved (not copied) and no old copy remains in `bookmark-detail`.
- A request for the next page cannot be issued while one is in flight, and cannot be issued when `next_cursor` is `null`. The observer is created and disconnected in an effect with a cleanup.
- A later-page failure keeps the rows on screen; a later-page `401` replaces them. A `401` or an error is never swallowed.
- `AddUrlForm` no longer navigates on success and refetches the list instead.
- Try to break it with: a page with items and `next_cursor` set followed by a page with `items: []` and `next_cursor: null`; a first page with `items: []` but a non-null `next_cursor`; a title of 300 characters and a title with no spaces; a title of only spaces (does it count as empty?); a URL with no host; a `favicon_url` that fails to load; the same bookmark appearing on two pages; the intersection event firing three times quickly; leaving the page while a page request is in flight; saving a URL while the list is loading its next page.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, the design brief or this file conflict with each other.
- You think you need a change to the backend or the contract, a new dependency, or a UI library.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `npm ci` in `frontend/` first on a fresh checkout, run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), any place you departed from the reference design and why, the known gaps, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
