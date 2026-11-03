# Plan: bookmark list and trash view (front end)

Branch: `claude/bookmark-list-glkz45`. Paths are under `frontend/src/`. Tests are colocated and use Vitest + Testing Library, mocking the API wrapper with value-return spies.

## Acceptance criteria

### `listBookmarks` wrapper
- [ ] No args → no query string; `trashed: true` → `trashed=true`; `trashed: false` → no param; cursor with `+ / = &` URL-encoded. File `lib/api/bookmarks.ts`; test `lib/api/bookmarks.test.ts` (mocks `./request`).

### `formatDate`
- [ ] Table-driven with fixed `now`: 30 s, 59 s, 60 s, 59 min, 60 min, 23 h, 24 h, 6 d, 7 d, same year, earlier year. File `features/bookmark-list/lib/formatDate.ts`; test `formatDate.test.ts`.

### List
- [ ] Rows in order given; title; empty title → host; unparsable URL → whole URL; `<b>x</b>` literal. Files `components/BookmarkRow.tsx`, `components/BookmarkList.tsx`; test `components/BookmarkList.test.tsx`.
- [ ] Chip: pending "Fetching…", failed "Fetch failed", ok none. `BookmarkRow.tsx`; test `BookmarkList.test.tsx`.
- [ ] Each row links to `/bookmarks/{id}`; favicon falls back to tile on null `favicon_url`. `BookmarkRow.tsx`; test `BookmarkList.test.tsx`.
- [ ] First load shows skeleton (`aria-busy`); empty first page shows "No bookmarks yet". `BookmarkList.tsx`, `ListSkeleton.tsx`; test `BookmarkList.test.tsx`.
- [ ] Paging: first request has no cursor; each "visible" event sends the previous `next_cursor`; `null` cursor → no sentinel, no more requests. `hooks/useBookmarkList.ts`, `hooks/useVisibleSentinel.ts`, `BookmarkList.tsx`; tests `useBookmarkList.test.tsx`, `useVisibleSentinel.test.tsx`, `BookmarkList.test.tsx`.
- [ ] A second "visible" event while a request is in flight makes no second request. `useBookmarkList.ts`; test `useBookmarkList.test.tsx` (also three quick events).
- [ ] First-page error: message + "Try again" refetches; later-page error keeps rows, "Couldn't load more.", retry reuses the same cursor. `BookmarkList.tsx`, `useBookmarkList.ts`; tests `BookmarkList.test.tsx`, `useBookmarkList.test.tsx`.
- [ ] 401 on first page and on a later page each replace the list with the signed-out message. `useBookmarkList.ts`, `BookmarkList.tsx`; test `BookmarkList.test.tsx`.
- [ ] Observer disconnected on unmount; no `IntersectionObserver` → no throw. `useVisibleSentinel.ts`; tests `useVisibleSentinel.test.tsx`, `BookmarkList.test.tsx`.

### Add field
- [ ] Success clears input, refetches the list, does not navigate; duplicate still links; 401 still signed-out; failures keep input. `components/AddUrlForm.tsx`; test `AddUrlForm.test.tsx` (updated).

### Trash view
- [ ] Asks `trashed: true`; row shows "trashed " + date, no chip, links to the bookmark; `null` `deleted_at` omits "trashed". `components/TrashRow.tsx`, `BookmarkList.tsx`; test `BookmarkList.test.tsx` (trash block).
- [ ] No add field, no Restore, no Empty trash. `pages/TrashPage.tsx`; test `App.test.tsx`.
- [ ] "Trash is empty"; "Couldn't load the trash."; 401 signed-out; pages like the list. `BookmarkList.tsx`; test `BookmarkList.test.tsx`.
- [ ] List and trash do not share cache. `lib/queryKeys.ts`, `useBookmarkList.ts`; test `useBookmarkList.test.tsx`.

### Navigation
- [ ] `/` shows list, `/trash` shows trash; current link has `aria-current="page"`; unknown path still works. `app-shell/AppShell.tsx`, `pages/BookmarksPage.tsx`, `pages/TrashPage.tsx`, `App.tsx`; test `App.test.tsx`.

### Promoted components
- [ ] `git mv` `Favicon` (+ test), `FetchStatusChip` → `components/ui/`; `hostOf` (+ test) → `lib/`; update `bookmark-detail` imports; its tests pass with only path changes.

### Repo-wide
- [ ] `make check` passes.
- [ ] No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`.
- [ ] `package.json`, lockfile, `backend/`, `docs/` (except this file), Makefile, `openapi.yaml` unchanged; only CSS carried from the reference.

## Judgment calls

(filled in at the end)
