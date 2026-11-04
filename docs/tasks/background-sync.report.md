# Verification report: background sync

Branch: `claude/background-sync-task-97frmt-omnp8x` (builder commits up to `90f3765`, plus one verifier test).

**Result: no Blocking findings.** `make check` passed (65 test files, 857 tests before my change, 858 after). Source was not changed; the only edit I made is one extra test (below).

## Acceptance criteria

All tests are in `frontend/src/`. "Discriminates" means I broke the behavior in the source, saw the test fail, and reverted (see Mutations).

| Criterion | Test | Verdict |
|---|---|---|
| Hook: once on mount, 2499 ms still one call, 2500 again, then every 2500 | `useSyncPoll.test.tsx` "polls on mount and again 2500 ms…" | Met. Fails with interval 5000. |
| First answer and equal later answers invalidate nothing (3 polls) | "remembers the first answer and ignores equal ones" | Met. Fails if first answer invalidates (`previous === null` dropped). |
| 3→4 invalidates FOLDERS_KEY then BOOKMARK_LIST_KEY once, 4 again adds none | "invalidates the folders then the lists once…" | Met. Fails if either key is dropped. |
| Lower number (4→2) is a change | "treats a lower number as a change" | Met. Fails with `>=` comparison. |
| First answer `0` is a baseline | "treats a first answer of 0 as a baseline" | Met. |
| Network failure / 500: nothing invalidated, polling continues, equal answer none, different answer once | "ignores %s, keeps polling…" (two rows) | Met. Fails if the remembered number is cleared after a failure. |
| 401: both keys once, no more requests after ten intervals, none on `visibilitychange`, none on re-render | "stops after a 401, refreshing once" | Met. Fails if polling continues after 401. |
| Hidden tab: no request; visible + `visibilitychange` on window: exactly one request at once | "pauses while the tab is hidden…" | Met. Fails with `refetchIntervalInBackground: true` (the task file says this can't be relied on; I also read the option in the code, see rule checks). |
| Unmount stops the poll; late answer after unmount causes no invalidation | "stops polling on unmount, and ignores an answer…" | Met, but see Non-blocking 1 (the late-answer half cannot fail). |
| Same-commit swap: new mount baselines on its own; after a 401 the new mount requests again | "gives a mount in the same commit…", "does not show a new mount the old 401" | Met. Both fail when the per-mount token is removed from the key. |
| No overlap with a pending request | "does not overlap polls" | Met. |
| StrictMode: one baseline, no invalidation | "makes a single baseline under StrictMode" | Met. |
| Only `getSyncVersion()` with no arguments | "calls only getSyncVersion, with no arguments" | Met. `queryFn: () => getSyncVersion()` keeps TanStack's context out. |
| AppShell wide: change re-runs `listFolders`, same DOM nodes | `AppShell.test.tsx` "wide: a version change refetches…" | Met. |
| AppShell narrow, drawer closed: children stay, no `listFolders`; drawer open: re-runs | "narrow: a change keeps…", "narrow: with the drawer open…" | Met. |
| One request per interval in each layout | "%s: makes exactly one poll request per interval" (wide, narrow) | Met. Fails with the hook called twice. |
| Wide→narrow while mounted: still one stream, not a change | "keeps one poll stream when the viewport changes…" | Met. Fails with the hook called twice. |
| Existing AppShell tests pass with sync mocked | whole file; `sync.mockReset().mockResolvedValue(...)` after reset | Met. |
| BookmarksPage: change re-runs `listBookmarks` with same args, rows and no skeleton while pending, new rows on resolve | `BookmarksPage.test.tsx` "refetches the list with the same arguments…" | Met. Holds a pending second request; fails with `resetQueries`. |
| BookmarksPage: poll 401 refetches, list 401 shows signed-out message | "refetches on a 401 from the poll…" | Met. Fails if the lists key is dropped. |
| FolderPage: change re-runs `listFolders` and `listBookmarks` (same args incl. `folderId`); folder gone shows "folder missing" | `FolderPage.test.tsx` "refetches the folders and the list…" | Met. Uses the existing text "This folder doesn't exist." |
| Mocks in the four files that render AppShell | grep for `BookmarksPage`, `FolderPage`, `TrashPage`, `AppShell`, `<App ` in `*.test.tsx` finds exactly `App.test.tsx`, `AppShell.test.tsx`, `BookmarksPage.test.tsx`, `FolderPage.test.tsx`; all mock `lib/api/sync` | Met. |
| `make check` passes; nothing outside allowed paths | Ran `make check`; `git diff 38f6a3a..HEAD --stat` | Met. |

Requirement NFR-2 (client half): covered by the rows above. Timing and the hidden-tab behavior are fake-timer tests only; nothing was checked in a real browser.

## Plan check (`docs/tasks/background-sync.plan.md`, read after the above)

- Every acceptance criterion appears in the plan; none is missing.
- Every ticked item names a test that exists and checks the behavior (verified above). Plan test names differ slightly from the file ("invalidates the folders then the lists once when the number changes" vs the plan's longer wording), which is cosmetic.
- Plan vs diff: the file list matches the diff exactly (`git diff 38f6a3a..HEAD`: plan, `App.test.tsx`, `AppShell.test.tsx`, `AppShell.tsx` (+2 lines), `useSyncPoll.ts`, `useSyncPoll.test.tsx`, `sync.ts`, the two page tests). No difference found.
- The plan's judgment calls (function-form `enabled`, `useId()` token, two effects, local `tick` helper, 401 test lets the first load succeed) are all visible in the diff and acceptable.

## Rule checks

- Only `handler/` imports `internal/api`: no backend file changed.
- `user_id` filtering on repository queries and `users.version` increments: not applicable, no backend or repository change.
- `go.mod`, `package.json`, `package-lock.json`, `schema.d.ts`, `openapi.yaml`, `docs/**` (other than the plan), pages, `features/**`, styles, `test/setup.ts`: unchanged.
- `getSyncVersion` is called only from `useSyncPoll.ts`; `useSyncPoll` only from `AppShell.tsx`, first line of the component, above the `narrow` branch.
- Poll options read in `useSyncPoll.ts`: `refetchIntervalInBackground: false`, `refetchOnWindowFocus: true`, `retry: false`, `gcTime: 0`, key `['sync-version', useId()]`, `refetchInterval` returns `false` once the error is a 401 and `SYNC_POLL_MS` (2500, exported and used by tests) otherwise.
- Comparison is `previous === version` against a ref that failures do not clear; first answer (`previous === null`) does not invalidate. Invalidations are exactly `FOLDERS_KEY` then `BOOKMARK_LIST_KEY` with default options: no `refetchType`, `resetQueries`, `removeQueries` or `clear()`.
- "Stopped" is derived from `query.error`; the 401 refresh is an effect guarded by a ref written only inside the effect; no ref read during render; no `eslint-disable` anywhere in `frontend/src`.
- `AppShell` gained no `useState`, key or remount; its only change is the hook call and import.
- No `localStorage`, `setTimeout` or `setInterval` in the new source.
- `useBookmarkList` keeps phase `ready` during a refetch with cached data; proven by the page test with a pending second request.

## Mutations (changed, ran app-shell and the two page tests, reverted; tree clean afterwards)

| Mutation | Failing tests |
|---|---|
| Interval 5000 | 1 |
| `>=` instead of `!==` | 1 |
| First answer invalidates | 15 |
| Drop `FOLDERS_KEY` invalidation | 9 |
| Drop `BOOKMARK_LIST_KEY` invalidation | 9 |
| Keep polling after 401 | 1 |
| Drop token from key | 3 (including the same-commit swap tests) |
| `resetQueries` instead of `invalidateQueries` | 7 (including the page test holding the rows) |
| Clear remembered number after a failed poll | 2 |
| `refetchIntervalInBackground: true` | 1 |
| Hook called twice in `AppShell` | 4 |

Not mutated: calling the hook inside each layout branch separately (the doubled call above fails the same tests).

## Break attempts beyond the task file

- Version up then down (3, 4, 3): refreshes on each change. I added a test for this: "refreshes on every change when the number goes up and then back down" in `useSyncPoll.test.tsx`. It passes.
- Two changes between two polls: one comparison per poll, so one refresh; follows from the code and the "no overlap" test.
- Poll answering after unmount: effects do not run after unmount, no invalidation (tested).
- Rapid page switching: each mount has its own `useId()` key; the same-commit swap tests cover one swap; repeated swaps use the same mechanism. Not stress-tested.
- Tab hidden then shown after a long time: one poll at once (tested once; the length of time doesn't change the path).
- A change during an in-flight "Load more", and a 401 while a dialog is open: not tested (the task file marks the first as not tested); the code only calls `invalidateQueries`, which does not remount anything.

## Integration tests

None exist for this task and none were run: it is frontend-only and no acceptance criterion depends on an integration test. The server side (`GET /api/v1/sync/version`) belongs to `sync-version`.

## Findings

### Blocking

None.

### Non-blocking

1. The late-answer half of "stops polling on unmount, and ignores an answer that arrives after it" cannot fail: the invalidating effects do not run after unmount, so no source change would break it. The "stops requesting" half does discriminate.
2. The tests rely on a `tick` helper (advance 1 ms more so TanStack's batched notification reaches the component), repeated in four files. The plan records this; it is a candidate for a shared test helper later.
3. Timing, hidden-tab and 401 behavior were checked with fake timers and a stubbed `visibilityState` only, as the task file accepts.
