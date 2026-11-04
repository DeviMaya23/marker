# Plan: bookmark list and trash view (front end)

Branch: `claude/bookmark-list-glkz45`. Paths are under `frontend/src/`. Tests are colocated and use Vitest + Testing Library, mocking the API wrapper with value-return spies.

## Acceptance criteria

### `listBookmarks` wrapper
- [x] No args → no query string; `trashed: true` → `trashed=true`; `trashed: false` → no param; cursor with `+ / = &` URL-encoded. File `lib/api/bookmarks.ts`; test `lib/api/bookmarks.test.ts` (mocks `./request`).

### `formatDate`
- [x] Table-driven with fixed `now`: 30 s, 59 s, 60 s, 59 min, 60 min, 23 h, 24 h, 6 d, 7 d, same year, earlier year. File `features/bookmark-list/lib/formatDate.ts`; test `formatDate.test.ts`.

### List
- [x] Rows in order given; title; empty title → host; unparsable URL → whole URL; `<b>x</b>` literal. Files `components/BookmarkRow.tsx`, `components/BookmarkList.tsx`; test `components/BookmarkList.test.tsx`.
- [x] Chip: pending "Fetching…", failed "Fetch failed", ok none. `BookmarkRow.tsx`; test `BookmarkList.test.tsx`.
- [x] Each row links to `/bookmarks/{id}`; favicon falls back to tile on null `favicon_url`. `BookmarkRow.tsx`; test `BookmarkList.test.tsx`.
- [x] First load shows skeleton (`aria-busy`); empty first page shows "No bookmarks yet". `BookmarkList.tsx`, `ListSkeleton.tsx`; test `BookmarkList.test.tsx`.
- [x] Paging: first request has no cursor; each "visible" event sends the previous `next_cursor`; `null` cursor → no sentinel, no more requests. `hooks/useBookmarkList.ts`, `hooks/useVisibleSentinel.ts`, `BookmarkList.tsx`; tests `useBookmarkList.test.tsx`, `useVisibleSentinel.test.tsx`, `BookmarkList.test.tsx`.
- [x] A second "visible" event while a request is in flight makes no second request. `useBookmarkList.ts`; test `useBookmarkList.test.tsx` (also three quick events).
- [x] First-page error: message + "Try again" refetches; later-page error keeps rows, "Couldn't load more.", retry reuses the same cursor. `BookmarkList.tsx`, `useBookmarkList.ts`; tests `BookmarkList.test.tsx`, `useBookmarkList.test.tsx`.
- [x] 401 on first page and on a later page each replace the list with the signed-out message. `useBookmarkList.ts`, `BookmarkList.tsx`; test `BookmarkList.test.tsx`.
- [x] Observer disconnected on unmount; no `IntersectionObserver` → no throw. `useVisibleSentinel.ts`; tests `useVisibleSentinel.test.tsx`, `BookmarkList.test.tsx`.

### Add field
- [x] Success clears input, refetches the list, does not navigate; duplicate still links; 401 still signed-out; failures keep input. `components/AddUrlForm.tsx`; test `AddUrlForm.test.tsx` (updated).

### Trash view
- [x] Asks `trashed: true`; row shows "trashed " + date, no chip, links to the bookmark; `null` `deleted_at` omits "trashed". `components/TrashRow.tsx`, `BookmarkList.tsx`; test `BookmarkList.test.tsx` (trash block).
- [x] No add field, no Restore, no Empty trash. `pages/TrashPage.tsx`; test `App.test.tsx`.
- [x] "Trash is empty"; "Couldn't load the trash."; 401 signed-out; pages like the list. `BookmarkList.tsx`; test `BookmarkList.test.tsx`.
- [x] List and trash do not share cache. `lib/queryKeys.ts`, `useBookmarkList.ts`; test `useBookmarkList.test.tsx`.

### Navigation
- [x] `/` shows list, `/trash` shows trash; current link has `aria-current="page"`; unknown path still works. `app-shell/AppShell.tsx`, `pages/BookmarksPage.tsx`, `pages/TrashPage.tsx`, `App.tsx`; test `App.test.tsx`.

### Promoted components
- [x] `git mv` `Favicon` (+ test), `FetchStatusChip` → `components/ui/`; `hostOf` (+ test) → `lib/`; update `bookmark-detail` imports; its tests pass with only path changes.

### Repo-wide
- [x] `make check` passes.
- [x] No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`.
- [x] `package.json`, lockfile, `backend/`, `docs/` (except this file), Makefile, `openapi.yaml` unchanged; only CSS carried from the reference.

## Judgment calls

- **Whitespace-only title counts as empty**: the row shows the host (same rule as the bookmark page, `title.trim() === ''`). The task says only "empty".
- **Same bookmark on two pages is shown once**, at its first position (React keys must be unique); the task did not say.
- **Empty page with a non-null cursor** is not "No bookmarks yet": the list stays in the ready state and the sentinel keeps paging.
- **A failed refresh with rows on screen** (e.g. after a save) uses the same "Couldn't load more." line; its "Try again" refetches. The task only describes later-page errors.
- **No sentinel while a later page has failed**, so a visible sentinel cannot retry in a loop; only the button retries.
- **Query keys**: `['bookmark-list', { trashed }]`; saving invalidates the prefix, so a cached trash is also marked stale.
- **`AppShell`** (nav plus `<main class="page">`) lives in `app-shell/` and wraps the list and trash pages; the bookmark page, save popup and not-found page keep their own markup. The nav is `<nav aria-label="Main">` with `NavLink`s (`end` on `/`) for `aria-current`.
- **`formatDate`** returns `''` for an unparsable date and "just now" for a date in the future.
- **Chip**: `FetchStatusChip` is unchanged (it renders "Complete" for `ok`); the row does not render it for `ok`.
- **Rows are tested through `BookmarkList.test.tsx`** rather than separate row test files, since `TESTING.md` says presentational components are not unit-tested. Nav behavior is tested in `App.test.tsx`.
- **`displayTitle`** is a small feature-local helper shared by the two row components.
- **CSS**: copied only the list/row/skeleton/sentinel rules (class names kept); the nav, `list-error` and `page__title` rules are new. Removed the `.home h1` / `.home__lead` rules left unused by deleting the home page.
- **Departures from the reference**: no row actions, note preview, menu, sidebar or toast; skeleton sizes are inline styles; the empty and error panels use the shared `StatePanel` (an `h2` title).
- **Not verified**: nothing was seen in a browser or against a real server (mocks only).
