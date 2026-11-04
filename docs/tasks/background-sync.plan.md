# Plan: background sync (front end)

Prerequisite checked: `schema.d.ts` has `getSyncVersion` with `200 { version: number }` and `401`.

Files: `lib/api/sync.ts` (new, no test), `app-shell/useSyncPoll.ts` + `useSyncPoll.test.tsx` (new), `app-shell/AppShell.tsx` (one hook call), `AppShell.test.tsx`, `pages/BookmarksPage.test.tsx`, `pages/FolderPage.test.tsx`, `App.test.tsx` (sync mock). All paths under `frontend/src/`.

## useSyncPoll (`app-shell/useSyncPoll.test.tsx`, fake timers)
- [ ] Asks once on mount, not before 2500 ms (2499 still one call), again at 2500, then every 2500 — test "polls on mount and every 2500 ms after the previous poll settles"
- [ ] First answer and later equal answers invalidate nothing — test "remembers the first answer and ignores equal ones"
- [ ] Change (3 then 4) invalidates FOLDERS_KEY then BOOKMARK_LIST_KEY once each, a repeat of 4 adds none; lower (4 then 2) counts; first answer 0 is a baseline — tests "invalidates the folders then the lists when the number changes", "treats a lower number as a change", "treats a first answer of 0 as a baseline"
- [ ] Network failure and 500 invalidate nothing, polling continues, remembered number survives (equal: none, different: once) — tests "ignores a network failure…", "ignores a 500…"
- [ ] 401 invalidates both once, no further request after ten intervals, none on visibilitychange, none on re-render — test "stops after a 401 and refreshes once"
- [ ] Hidden tab: no request past two intervals; visible + `visibilitychange` on window makes exactly one request — test "pauses while the tab is hidden and polls once when it is shown"
- [ ] Unmount stops polling; late answer after unmount invalidates nothing — tests "stops polling on unmount", "ignores an answer that resolves after unmount"
- [ ] Same-commit swap: second mount's first answer is a baseline; after a 401, second mount requests again — tests "a new mount in the same commit starts with its own baseline", "a new mount after a 401 polls again"
- [ ] No overlap with a pending request — test "does not overlap polls"
- [ ] StrictMode: single baseline, no invalidation — test "under StrictMode makes one baseline"
- [ ] Only `getSyncVersion()` with no args, no other wrapper — test "calls only getSyncVersion, with no arguments"

## AppShell (`app-shell/AppShell.test.tsx`, fake timers)
- [ ] Wide: change re-runs `listFolders`, children and sidebar links same DOM nodes — "wide: a version change refetches the folders and keeps the DOM"
- [ ] Narrow, drawer closed: children stay mounted, no `listFolders`; drawer open: `listFolders` re-runs — "narrow: …"
- [ ] One request per interval in each layout — "polls once per interval in each layout"
- [ ] Wide to narrow: still one request per interval, not a change — "keeps one poll when the viewport changes"
- [ ] Existing tests pass with `lib/api/sync` mocked (mock restored after `mockReset`)

## BookmarksPage (`pages/BookmarksPage.test.tsx`)
- [ ] Version change re-runs `listBookmarks` with same args; rows stay, no skeleton while pending; new rows on resolve
- [ ] Poll 401 refetches the list; list 401 shows the signed-out message

## FolderPage (`pages/FolderPage.test.tsx`)
- [ ] Version change re-runs `listFolders` and `listBookmarks` (same args incl. folderId); folder gone shows the existing "folder missing" panel

## Mocks
- [ ] `lib/api/sync` mocked in the four files rendering AppShell (`AppShell.test.tsx`, `BookmarksPage.test.tsx`, `FolderPage.test.tsx`, `App.test.tsx`; confirmed by search, TrashPage has no test file rendering it)

## Repo-wide
- [ ] `make check` passes
- [ ] Nothing outside the allowed paths changed
