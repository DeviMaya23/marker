# Plan: background sync (front end)

Prerequisite checked: `schema.d.ts` has `getSyncVersion` with `200 { version: number }` and `401`.

Files: `lib/api/sync.ts` (new, no test), `app-shell/useSyncPoll.ts` + `useSyncPoll.test.tsx` (new), `app-shell/AppShell.tsx` (one hook call), `AppShell.test.tsx`, `pages/BookmarksPage.test.tsx`, `pages/FolderPage.test.tsx`, `App.test.tsx` (sync mock). All paths under `frontend/src/`.

## useSyncPoll (`app-shell/useSyncPoll.test.tsx`, fake timers)
- [x] Asks once on mount, not before 2500 ms (2499 still one call), again at 2500, then every 2500 — test "polls on mount and every 2500 ms after the previous poll settles"
- [x] First answer and later equal answers invalidate nothing — test "remembers the first answer and ignores equal ones"
- [x] Change (3 then 4) invalidates FOLDERS_KEY then BOOKMARK_LIST_KEY once each, a repeat of 4 adds none; lower (4 then 2) counts; first answer 0 is a baseline — tests "invalidates the folders then the lists when the number changes", "treats a lower number as a change", "treats a first answer of 0 as a baseline"
- [x] Network failure and 500 invalidate nothing, polling continues, remembered number survives (equal: none, different: once) — tests "ignores a network failure…", "ignores a 500…"
- [x] 401 invalidates both once, no further request after ten intervals, none on visibilitychange, none on re-render — test "stops after a 401 and refreshes once"
- [x] Hidden tab: no request past two intervals; visible + `visibilitychange` on window makes exactly one request — test "pauses while the tab is hidden and polls once when it is shown"
- [x] Unmount stops polling; late answer after unmount invalidates nothing — tests "stops polling on unmount", "ignores an answer that resolves after unmount"
- [x] Same-commit swap: second mount's first answer is a baseline; after a 401, second mount requests again — tests "a new mount in the same commit starts with its own baseline", "a new mount after a 401 polls again"
- [x] No overlap with a pending request — test "does not overlap polls"
- [x] StrictMode: single baseline, no invalidation — test "under StrictMode makes one baseline"
- [x] Only `getSyncVersion()` with no args, no other wrapper — test "calls only getSyncVersion, with no arguments"

## AppShell (`app-shell/AppShell.test.tsx`, fake timers)
- [x] Wide: change re-runs `listFolders`, children and sidebar links same DOM nodes — "wide: a version change refetches the folders and keeps the DOM"
- [x] Narrow, drawer closed: children stay mounted, no `listFolders`; drawer open: `listFolders` re-runs — "narrow: …"
- [x] One request per interval in each layout — "polls once per interval in each layout"
- [x] Wide to narrow: still one request per interval, not a change — "keeps one poll when the viewport changes"
- [x] Existing tests pass with `lib/api/sync` mocked (mock restored after `mockReset`)

## BookmarksPage (`pages/BookmarksPage.test.tsx`)
- [x] Version change re-runs `listBookmarks` with same args; rows stay, no skeleton while pending; new rows on resolve
- [x] Poll 401 refetches the list; list 401 shows the signed-out message

## FolderPage (`pages/FolderPage.test.tsx`)
- [x] Version change re-runs `listFolders` and `listBookmarks` (same args incl. folderId); folder gone shows the existing "folder missing" panel

## Mocks
- [x] `lib/api/sync` mocked in the four files rendering AppShell (`AppShell.test.tsx`, `BookmarksPage.test.tsx`, `FolderPage.test.tsx`, `App.test.tsx`; confirmed by search, TrashPage has no test file rendering it)

## Repo-wide
- [x] `make check` passes
- [x] Nothing outside the allowed paths changed

## Judgment calls
- `queryFn` is `() => getSyncVersion()` so TanStack's context argument is not passed (the "no arguments" criterion).
- `enabled` is given as a function of the query (`!isSignedOut(q.state.error)`), because "stopped" derives from the query's own error, which is not available before `useQuery` returns.
- The per-mount token is `useId()`.
- The comparison and the 401 refresh are two `useEffect`s keyed on the answered number and on `stopped`; the shared helper `refreshViews` is local to `useSyncPoll.ts`.
- Test timing: TanStack batches notifications with a 0 ms timer, so tests advance 1 ms after each interval (`tick`); exact-boundary checks (2499/2500 ms) use a plain advance. The helper is repeated in each test file rather than added to `test/`, which would be a new shared file.
- The `BookmarksPage` 401 test lets the first list load succeed (rows on screen), then answers 401 for the refetch.
- The "late answer after unmount", "no overlap" and "StrictMode" tests check behaviour via call counts and the `invalidateQueries` spy only.
- No test file renders `TrashPage`; it is covered by `AppShell` tests, which render the shared shell.
- Timing and hidden-tab behaviour were tested with fake timers and a stubbed `visibilityState` only, not in a real browser.
