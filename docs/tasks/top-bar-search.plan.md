# Plan: top-bar-search (front end)

Paths are under `frontend/src/`. Tick an item when its test exists and passes.

## listSearch (pure) — `features/bookmark-list/lib/listSearch.ts`, test `listSearch.test.ts`
- [x] `q` trimmed; absent/empty/spaces → empty term; 200 chars whole; 201 cut to 200; 201 emoji cut to 200 emoji; cut ending on a space is trimmed
- [x] `notes=1` on; `0`, `true`, empty, absent off
- [x] Writing sets/removes `q` and `notes`, leaves other params; empty term removes `q`; notes off removes `notes`

## `listBookmarks` — `lib/api/bookmarks.ts`, test `lib/api/bookmarks.test.ts`
- [x] `q` URL-encoded; a term with space, `&`, `"` and a non-ASCII letter round-trips
- [x] `include_notes=true` only with `q` and `includeNotes: true`
- [x] With no `q`, request URL identical to before (plain list, trash, folder)

## useListSearch — `features/bookmark-list/hooks/useListSearch.ts`, test `useListSearch.test.tsx` (harness in MemoryRouter, fake timers)
- [x] Field keeps exactly what was typed after own write ("foo " stays; "foo bar" writes `q=foo bar`)
- [x] Field changes at once; URL unchanged at 299 ms; at 300 ms `q` is the trimmed text; nav type replace
- [x] Two keystrokes 200 ms apart give one write 300 ms after the second
- [x] Only spaces removes `q`; text equal to URL term writes nothing (location key unchanged)
- [x] Enter applies at once, later timer does not write again; Clear empties, removes `q` at once, focus kept
- [x] URL change by other means (`/?q=bar`, then back) updates field and drops pending wait
- [x] Path change with typed unapplied text drops it; field shows new URL's term
- [x] Unmount with pending wait writes nothing afterwards
- [x] Notes toggle writes/removes `notes=1`, replaces entry, keeps `q`; later write keeps `notes=1`
- [x] "All bookmarks" from folder path → `/` with pending text and notes, as push; empty field → `/` without `q`; other param (`x=1`) carried
- [x] "All bookmarks" on `/` and folder option on a folder page change nothing
- [x] Enter while composing applies nothing; otherwise does
- [x] First render shows URL's term; pasted 201-char `?q=` shown cut to 200

## SearchBar — `features/bookmark-list/components/SearchBar.tsx`, test `SearchBar.test.tsx`
- [x] On `/`: field, "Search scope" with "All bookmarks" checked and folder option disabled, "Include notes" present, off, disabled
- [x] With `q` the switch is enabled; toggling changes `notes` in URL; state kept in URL when `q` removed, shows disabled-but-on
- [x] Folder page: folder option checked with name in label, or "This folder & subfolders" without a name; "All bookmarks" navigates as above
- [x] Field `maxLength` 200, accessible name "Search bookmarks"; Clear button only when field has text
- [x] On `/` disabled folder option has `title` "Open a folder to search inside it"

## components/ui wrappers
- [x] `Switch` (`components/ui/Switch.tsx`, `Switch.test.tsx`): label, toggling calls `onCheckedChange`, `aria-checked` follows `checked`, disabled does not call
- [x] `SegmentedControl` (`components/ui/SegmentedControl.tsx`, `SegmentedControl.test.tsx`): group name, matching option checked, choosing calls `onValueChange`, disabled option disabled and calls nothing

## BookmarkList / useBookmarkList with a search — `BookmarkList.tsx`, `useBookmarkList.ts`; tests `BookmarkList.test.tsx`, `useBookmarkList.test.tsx`, `lib/bookmarks/queryKeys.test.ts`
- [x] `/?q=foo` request has `q`, no `includeNotes` key; `notes=1` adds `includeNotes: true`; folder page adds `folderId`; no `q` unchanged (BookmarkList.test.tsx)
- [x] `trashed` ignores URL `q` (BookmarkList.test.tsx); hook given `trashed` and `search` sends no `q` (useBookmarkList.test.tsx)
- [x] `bookmarkListKey` literal arrays unchanged without term; key with term differs from none, other term, other notes (queryKeys.test.ts)
- [x] Late response for an earlier term not shown under the new one (BookmarkList.test.tsx)
- [x] Second page carries cursor and same `q`, `includeNotes`, `folderId` (useBookmarkList.test.tsx)
- [x] Change of term/notes → new first-page request with no cursor and different key; earlier cached pages not shown (useBookmarkList.test.tsx)
- [x] Rows in server order (BookmarkList.test.tsx)
- [x] Invalidating `BOOKMARK_LIST_KEY` refetches an open search with same `q`; delete on a result works and refreshes (BookmarkList.test.tsx)
- [x] No matches panel: exact title (including `<b>` as text), descriptions notes off/on; replaces "This folder is empty." (BookmarkList.test.tsx, FolderPage.test.tsx)
- [x] First page failure "Couldn't search your bookmarks."; 401 signed-out; later page failure "Couldn't load more." (BookmarkList.test.tsx)
- [x] Section name "Search results" while searching, "Bookmarks" otherwise (BookmarkList.test.tsx)

## Pages — `pages/BookmarksPage.tsx`, `pages/FolderPage.tsx`
- [x] Folder page: bar shows while folders load and when they failed (generic label), and when list 404s but folder is listed (with `notFound` panel); gone once folders loaded without it (`FolderPage.test.tsx`)
- [x] Bar present on `/` and `/folder/:id`; absent on `/trash`, `/bookmarks/:id`, missing folder (`BookmarksPage.test.tsx`, `FolderPage.test.tsx`, `App.test.tsx`)
- [x] Add-URL field still present on both pages with or without a search (`BookmarksPage.test.tsx`, `FolderPage.test.tsx`)
- [x] `/trash?q=foo` lists the trash and sends no `q` (`App.test.tsx`)

## Repo-wide
- [x] `make check` passes including `npm run lint:css`; CSS added to `styles/components.css` and `styles/layout.css` from tokens only
- [x] No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `stylelint-disable`
- [x] Protected files unchanged (`package.json`, lockfile, README, Makefile, stylelint config, `schema.d.ts`, `app-shell/`, `backend/`, `openapi.yaml`, `docs/` except this file)

## Judgment calls

Things the task file did not settle, and what I chose:

- **`listBookmarks` and an empty `q`:** the wrapper sends `q` only when it is a non-empty string (and `include_notes` only then), so `q: ''` behaves as no term. The hook never passes one anyway.
- **Scope change, "All bookmarks":** it first applies the field's text to the folder's own URL (a replace, like any apply), then pushes `/` with the live query string. The back button therefore returns to the folder page with the search the user had. Both writes read the live URL.
- **After the scope change the field shows the normalized term** (a trailing space is gone), because the path changed and the field follows the new URL then.
- **In-flight guard in `useBookmarkList`:** the `busy` ref now holds the key of the list that is loading, so a request still running for an earlier term cannot block `fetchNext` or `retry` for the current one. Behaviour for one list is unchanged.
- **`useAppliedSearch`** lives in `hooks/useListSearch.ts` (the task allowed the same file).
- **Query key:** `bookmarkListKey(trashed, folderId, search?)` takes the term and notes flag as a third argument; an empty term is treated as no term. The notes flag is in the key only with a term.
- **Radio disabled state:** Base UI renders the radio as a `span role="radio"`, so a disabled option is `aria-disabled="true"` and `data-disabled`, not a `disabled` attribute. The tests check `aria-disabled`.
- **New test file:** `pages/BookmarksPage.test.tsx` (the task named "the page tests"; none existed for this page). The trash, detail and save checks are in `App.test.tsx`; I did not add a `TrashPage.test.tsx`.
- **BookmarkList trashed guard is covered through the empty state:** `useBookmarkList` also ignores `search` when `trashed`, so removing only the `BookmarkList` guard cannot change the request. A test for `/trash?q=foo` with an empty trash (must show "Trash is empty", not the no-match panel) turns red when the guard is removed. I checked this by breaking it.
- **CSS:** copied `.segmented*`, `.switch*`, `.search-field*` from the reference and adapted them: `[data-checked]` and `[data-disabled]` instead of the `--active` class and `:checked`; the switch thumb is a real `Switch.Thumb` element coloured with `var(--surface)` (the reference's `#fff` would be a new hard-coded colour); the field has right padding for the Clear button; `.segmented__label` carries the ellipsis (max `24ch`); the field takes the whole row under 640px. 640px is my choice; no other breakpoint was given.
- **Reference differences, where this file wins:** search state is in the URL; the 300 ms wait; the scope control navigates; the bar sits in the page body above the add-URL field; the folder option's disabled title is "Open a folder to search inside it" (reference: "Open a folder to scope search to it"), and its label is `“<name>” & subfolders`.
- **Not run:** `make test-integration-local` (backend untouched, see the report).
