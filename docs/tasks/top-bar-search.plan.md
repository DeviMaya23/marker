# Plan: top-bar-search (front end)

Paths are under `frontend/src/`. Tick an item when its test exists and passes.

## listSearch (pure) — `features/bookmark-list/lib/listSearch.ts`, test `listSearch.test.ts`
- [ ] `q` trimmed; absent/empty/spaces → empty term; 200 chars whole; 201 cut to 200; 201 emoji cut to 200 emoji; cut ending on a space is trimmed
- [ ] `notes=1` on; `0`, `true`, empty, absent off
- [ ] Writing sets/removes `q` and `notes`, leaves other params; empty term removes `q`; notes off removes `notes`

## `listBookmarks` — `lib/api/bookmarks.ts`, test `lib/api/bookmarks.test.ts`
- [ ] `q` URL-encoded; a term with space, `&`, `"` and a non-ASCII letter round-trips
- [ ] `include_notes=true` only with `q` and `includeNotes: true`
- [ ] With no `q`, request URL identical to before (plain list, trash, folder)

## useListSearch — `features/bookmark-list/hooks/useListSearch.ts`, test `useListSearch.test.tsx` (harness in MemoryRouter, fake timers)
- [ ] Field keeps exactly what was typed after own write ("foo " stays; "foo bar" writes `q=foo bar`)
- [ ] Field changes at once; URL unchanged at 299 ms; at 300 ms `q` is the trimmed text; nav type replace
- [ ] Two keystrokes 200 ms apart give one write 300 ms after the second
- [ ] Only spaces removes `q`; text equal to URL term writes nothing (location key unchanged)
- [ ] Enter applies at once, later timer does not write again; Clear empties, removes `q` at once, focus kept
- [ ] URL change by other means (`/?q=bar`, then back) updates field and drops pending wait
- [ ] Path change with typed unapplied text drops it; field shows new URL's term
- [ ] Unmount with pending wait writes nothing afterwards
- [ ] Notes toggle writes/removes `notes=1`, replaces entry, keeps `q`; later write keeps `notes=1`
- [ ] "All bookmarks" from folder path → `/` with pending text and notes, as push; empty field → `/` without `q`; other param (`x=1`) carried
- [ ] "All bookmarks" on `/` and folder option on a folder page change nothing
- [ ] Enter while composing applies nothing; otherwise does
- [ ] First render shows URL's term; pasted 201-char `?q=` shown cut to 200

## SearchBar — `features/bookmark-list/components/SearchBar.tsx`, test `SearchBar.test.tsx`
- [ ] On `/`: field, "Search scope" with "All bookmarks" checked and folder option disabled, "Include notes" present, off, disabled
- [ ] With `q` the switch is enabled; toggling changes `notes` in URL; state kept in URL when `q` removed, shows disabled-but-on
- [ ] Folder page: folder option checked with name in label, or "This folder & subfolders" without a name; "All bookmarks" navigates as above
- [ ] Field `maxLength` 200, accessible name "Search bookmarks"; Clear button only when field has text
- [ ] On `/` disabled folder option has `title` "Open a folder to search inside it"

## components/ui wrappers
- [ ] `Switch` (`components/ui/Switch.tsx`, `Switch.test.tsx`): label, toggling calls `onCheckedChange`, `aria-checked` follows `checked`, disabled does not call
- [ ] `SegmentedControl` (`components/ui/SegmentedControl.tsx`, `SegmentedControl.test.tsx`): group name, matching option checked, choosing calls `onValueChange`, disabled option disabled and calls nothing

## BookmarkList / useBookmarkList with a search — `BookmarkList.tsx`, `useBookmarkList.ts`; tests `BookmarkList.test.tsx`, `useBookmarkList.test.tsx`, `lib/bookmarks/queryKeys.test.ts`
- [ ] `/?q=foo` request has `q`, no `includeNotes` key; `notes=1` adds `includeNotes: true`; folder page adds `folderId`; no `q` unchanged (BookmarkList.test.tsx)
- [ ] `trashed` ignores URL `q` (BookmarkList.test.tsx); hook given `trashed` and `search` sends no `q` (useBookmarkList.test.tsx)
- [ ] `bookmarkListKey` literal arrays unchanged without term; key with term differs from none, other term, other notes (queryKeys.test.ts)
- [ ] Late response for an earlier term not shown under the new one (BookmarkList.test.tsx)
- [ ] Second page carries cursor and same `q`, `includeNotes`, `folderId` (useBookmarkList.test.tsx)
- [ ] Change of term/notes → new first-page request with no cursor and different key; earlier cached pages not shown (useBookmarkList.test.tsx)
- [ ] Rows in server order (BookmarkList.test.tsx)
- [ ] Invalidating `BOOKMARK_LIST_KEY` refetches an open search with same `q`; delete on a result works and refreshes (BookmarkList.test.tsx)
- [ ] No matches panel: exact title (including `<b>` as text), descriptions notes off/on; replaces "This folder is empty." (BookmarkList.test.tsx, FolderPage.test.tsx)
- [ ] First page failure "Couldn't search your bookmarks."; 401 signed-out; later page failure "Couldn't load more." (BookmarkList.test.tsx)
- [ ] Section name "Search results" while searching, "Bookmarks" otherwise (BookmarkList.test.tsx)

## Pages — `pages/BookmarksPage.tsx`, `pages/FolderPage.tsx`
- [ ] Folder page: bar shows while folders load and when they failed (generic label), and when list 404s but folder is listed (with `notFound` panel); gone once folders loaded without it (`FolderPage.test.tsx`)
- [ ] Bar present on `/` and `/folder/:id`; absent on `/trash`, `/bookmarks/:id`, missing folder (`BookmarksPage.test.tsx`, `FolderPage.test.tsx`, `App.test.tsx`)
- [ ] Add-URL field still present on both pages with or without a search (`BookmarksPage.test.tsx`, `FolderPage.test.tsx`)
- [ ] `/trash?q=foo` lists the trash and sends no `q` (`App.test.tsx`)

## Repo-wide
- [ ] `make check` passes including `npm run lint:css`; CSS added to `styles/components.css` and `styles/layout.css` from tokens only
- [ ] No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `stylelint-disable`
- [ ] Protected files unchanged (`package.json`, lockfile, README, Makefile, stylelint config, `schema.d.ts`, `app-shell/`, `backend/`, `openapi.yaml`, `docs/` except this file)

## Judgment calls
(filled in at the end)
