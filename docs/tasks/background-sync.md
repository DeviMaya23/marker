# Task: background sync (front end)

> One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> **Prerequisite:** `sync-version` is merged (the server answers `GET /api/v1/sync/version`). It is on `main`. `frontend/src/lib/api/schema.d.ts` must already have the `getSyncVersion` operation with its `200 { version: number }` response; if it does not, stop and ask, because only the user regenerates it. Read `frontend/src/test/setup.ts`, `frontend/src/test/wrap.tsx` (`renderApp`, `testClient`) and `frontend/src/test/hookWrapper.tsx` first: the browser, router and query-client stand-ins already exist there and you must not duplicate them.

## Goal

A signed-in user who has the app open on two devices sees a change made on one appear on the other within a few seconds, without reloading: the folder list (while the sidebar or the drawer is showing it) and the list on screen refresh by themselves, without a loading skeleton and without the page jumping. In the narrow layout the drawer content only exists while the drawer is open, so with the drawer closed a change just marks the folder list stale and it is fetched when the drawer opens; that is accepted. This is the client half of sync; the server half is `sync-version`.

Requirements covered: NFR-2, client half: a change on another device appears within 5 seconds under normal conditions, and the view converges after a disruption (the poll is every 2.5 seconds, and a change that happened during a network outage is picked up by the first poll that gets through).

Out of scope, and why:

- Refreshing the bookmark detail page (`/bookmarks/:id`): it does not use `AppShell`. A bookmark changed on another device stays stale there until the page is reloaded. Decided by the user; see "Known gaps".
- Any sync on the save popup page (`/save`): it is a one-shot popup.
- A "sync" indicator, a toast, a "last updated" time or any other new visible element: the refresh is silent.
- The login screen, and a who-am-I endpoint (a backlog item): a `401` from the poll only reuses the signed-out message the lists already show.
- Keeping the scroll position when rows above the viewport are deleted by another device: the refresh keeps the rows on screen and does not reset the scroll, but it does not compensate for rows that vanish above.
- Exempting this route from rate limiting (NFR-16): rate limiting is not built. The contract already says the route is exempt.
- Cache headers, push, server-sent events, long polling: polling is the decided design.
- Any change to the contract, to `backend/**` or to `docs/**`.

## Role and ownership

Role: Frontend (see `AGENTS.md`).

You may change `frontend/**` except `package.json`, `package-lock.json`, `README.md` and the stylelint configuration. You may not change `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/background-sync.plan.md`, see `AGENTS.md`), the Makefile, `frontend/src/lib/api/schema.d.ts` (generated), `frontend/src/test/setup.ts`, or any file in `frontend/src/app-shell/` other than `AppShell.tsx`, its test `AppShell.test.tsx` and the two new files named below.

**Shared files.** Running now: `folder-section-test-flake` (changes only `features/folder-sidebar/components/FolderSection.test.tsx`) and `delete-account` (backend only). Neither touches any file below. A later front-end task (the paste-a-URL field with the limit message) changes `pages/` and `features/bookmark-list/`, not `app-shell/`. You change: `app-shell/AppShell.tsx` (one hook call), `app-shell/AppShell.test.tsx`, `pages/BookmarksPage.test.tsx`, `pages/FolderPage.test.tsx` and `App.test.tsx` (each only to mock the new wrapper, see "Acceptance criteria"), and the new files below. You do not change any page component, `SidebarContent.tsx`, `Drawer.tsx`, `features/**` source files, or the shared styles. If you think you must, stop and ask.

## Operations used

- `getSyncVersion` (`GET /api/v1/sync/version`), real on the server. Response `200 { version: integer >= 0 }`; `401` (the shared `Unauthenticated` problem). The contract lists no other status. Take the types from `schema.d.ts` (generated); do not write a type that mirrors an API shape.
- Nothing else is called. The refresh reuses the queries that already exist (`useFolders`, `useBookmarkList`) by invalidating their keys.

## Behavior

### The poll

One poll runs while `AppShell` is mounted, so on the all-bookmarks page, a folder page and the trash page. It does not run on the detail page, the save page or the not-found page, which do not render `AppShell`. `AppShell` renders its sidebar either inline or in a drawer; the poll belongs to the shell and starts once, whichever layout is showing, and does not restart when the layout changes.

1. It asks for the version when the shell mounts, then **2500 ms after the previous poll settles**, whether it answered or failed (TanStack Query's `refetchInterval` restarts its timer after every fetch). A slow answer just delays the next poll, and two polls never overlap. This meets NFR-2's 5 seconds at normal latency; it is not a fixed tick, by decision. In development `main.tsx` mounts under `StrictMode`, so the hook mounts twice; the query dedupes the request, and the hook must still work (one baseline, no refresh from the double mount).
2. The **first successful answer** is only remembered (the baseline). It never refreshes anything. "No baseline yet" is `null` in the hook's ref, so a first answer of `0` is a baseline like any other number.
3. Every later successful answer is compared with the **last remembered number** with `!==` (not "greater than"). If it differs, the app refreshes (see below) and remembers the new number. If it is the same, nothing happens. A lower number counts as a change.
4. The remembered number survives a failed poll: the first poll that succeeds after an outage is compared with the number remembered before it. A change made during the outage is therefore picked up.
5. The baseline and the "stopped" flag (item 8) belong to one mounted shell. Each page renders its own `AppShell`, and on a page change the old shell unmounts and the new one mounts in the same commit, so a query cached by the old shell would still be there for the new one. To make sure a new shell never reads an old number or an old `401`, the poll's query key includes a token that is unique to each mount of the hook (generate it once per mount, for example `useId()` or a ref, and put it in the key), and the query has `gcTime: 0`. The hook may use `useRef` and `useState`; `AppShell` itself gets none. Losing the old baseline costs nothing: a list and the folder list are fetched again when a page mounts.
6. While the browser tab is hidden the poll is paused (no timer-driven request). When the tab becomes visible again one poll runs at once, and the 2500 ms wait restarts from that poll. Set both options explicitly in the hook (`refetchIntervalInBackground: false`, `refetchOnWindowFocus: true`); do not rely on the query client's defaults.
7. A poll that fails for any reason other than `401` (a network failure, a `5xx`, anything unexpected) is ignored: nothing is shown, nothing is refreshed, the 2500 ms rhythm continues. It does not retry sooner (`retry: false`).
8. A poll that answers `401` ends the polling for this shell and refreshes once, as for a change (see below), so the lists and the folder list ask the server again, get the same `401`, and show the signed-out message they already show. "Stopped" is derived, not stored: it is true when the poll query's own error is an `ApiError` with status `401`, and it turns the query's `enabled` option off and makes `refetchInterval` return `false`. Do not set state in an effect and do not read a ref during render (`react-hooks/set-state-in-effect` and `react-hooks/refs` are on, and `eslint-disable` is forbidden). The refresh is an effect that runs when "stopped" becomes true, with a ref (written only inside the effect) so it happens once per mounted shell, however many times the component re-renders. After the `401` the poll sends no more requests, including when the tab becomes visible again; it starts again only when a new shell mounts (a page change or a reload), with the unique key from item 5 so the old `401` is not seen. It shows nothing of its own.

### What a change refreshes

On a change (and on the `401` above) the app invalidates two query keys, in this order: the folder list (`FOLDERS_KEY`, `lib/folders/queryKeys.ts`) and every bookmark list (`BOOKMARK_LIST_KEY`, `lib/bookmarks/queryKeys.ts`, the prefix of the live list, the trash, each folder's list and each search). Use the query client's invalidation with the default refetch behavior: queries that are on screen refetch at once; the others are marked stale and refetch when they next mount. Nothing else is invalidated: not the single-bookmark queries, and not the poll's own key.

What the user sees:

- The rows already on screen **stay on screen** while the refresh runs. The list's phase does not go back to `loading`, so no skeleton appears. Nothing remounts, so the page does not scroll to the top, and a half-typed URL in the add field, an open dialog, a half-typed search and the sidebar's state are untouched. The rows change only when the new answer arrives.
- The existing rules apply to the result, with nothing new: a folder that was deleted on another device disappears from the refreshed folder list, and `FolderPage` then shows its existing "folder missing" panel; a refresh of the list that fails with rows on screen shows the existing "Couldn't load more." row (for a deleted folder it can show for a moment, until the folder list answers); a `401` shows the signed-out message.
- The user's own changes already refresh the lists by themselves. The poll then also sees the version go up and refreshes once more. That is accepted, not a bug.

### Known gaps

- A refresh of a list that has loaded many pages asks for all of those pages again, in order. At the 1,000-bookmark cap (NFR-17) that is up to twenty requests of fifty rows per change. Accepted at this scale.
- A request for the next page that is running when a change arrives is cancelled by the refresh, which asks for the pages again from the first. Not tested.
- A failed refresh with rows on screen shows "Couldn't load more." The wording is a backlog line (`bookmark-list`); this task does not change it. When another device deletes the folder you are viewing, the list's refresh answers `404` and that row can show for a moment before the folder list's answer swaps in the "folder missing" panel; accepted.
- Rows deleted above the viewport by another device move the rows below up. The scroll position is not adjusted.
- The detail page and the save popup do not sync (see "Out of scope").
- The poll's `networkMode` is TanStack Query's default (`online`): while the browser reports it is offline the request is paused, not failed, and it resumes on reconnect (the default `refetchOnReconnect` then also polls once). Nothing is shown either way.
- Nothing is checked in a real browser: the 2500 ms rhythm and the hidden-tab behavior are tested with fake timers and a stubbed `document.visibilityState` only.

## Structure

Follow `ARCHITECTURE.md` (`app-shell/` holds the sync poll that refreshes views; `lib/` holds the API wrappers) and the hook rules in `CONVENTIONS.md` (one hook per concern, a colocated test).

- `lib/api/sync.ts` (new): `getSyncVersion()`, a thin wrapper over `apiRequest` (`GET /sync/version`) that returns the generated response type (`{ version: number }`). No test of its own (a thin wrapper, `TESTING.md`).
- `app-shell/useSyncPoll.ts` (new) with `app-shell/useSyncPoll.test.tsx`: the poll and the refresh above. It takes no arguments and returns nothing. It uses one TanStack Query `useQuery` for the polling (`refetchInterval` returning `false` once stopped and `2500` otherwise, `enabled` false once stopped, `retry: false`, `gcTime: 0`, a key made of a local constant such as `'sync-version'` plus a per-mount token, see "The poll" item 5), a ref for the remembered number (`null` until the first answer), and effects that compare each new version with that ref and call `invalidateQueries`, and that handle the `401` once. The key is local to this file and not exported, because nothing else reads it. Export the interval as a named constant (`SYNC_POLL_MS = 2500`) so the test and the code share it.
- `app-shell/AppShell.tsx`: call `useSyncPoll()` once, at the top of `AppShell`, above the `narrow` branch, so both layouts share one poll. No other change to the component or its markup.
- Do not put the hook in `lib/` or `hooks/`: it knows about the shell's lifetime and about which queries a view uses, which is `app-shell/` work.

## Dependencies

None. `@tanstack/react-query` is installed. `package.json` and `package-lock.json` must not change. No timer or polling library.

## Acceptance criteria

All of these must have a test, run by `npm test`. Use Vitest and Testing Library, mock the API wrapper with a value-return spy (`vi.mock('../lib/api/sync', …)`), build the client with `testClient()` from `test/wrap.tsx` (no retries), and use fake timers for time (`user-event` hangs under fake timers, see `TESTING.md`: use `fireEvent`, and flush promises with `await vi.advanceTimersByTimeAsync(…)`). The hook test renders `useSyncPoll` through a small harness component or `renderHook` with `hookWrapper` from `test/hookWrapper.tsx`, and observes the refresh by spying on the client's `invalidateQueries` (`vi.spyOn(client, 'invalidateQueries')`) and checking the `queryKey` it receives.

**`useSyncPoll` (hook, fake timers)**
- With a mock that resolves at once, it asks for the version once on mount, not again before 2500 ms (at 2499 ms still one call), and again at 2500 ms, then every 2500 ms.
- The first answer invalidates nothing, and neither do later polls that return the same number (check after three polls of the same number).
- When the number changes (for example 3, then 4), `invalidateQueries` is called with `FOLDERS_KEY` and with `BOOKMARK_LIST_KEY`, once each, in that order, and a following poll returning 4 adds no call. A lower number (4, then 2) counts as a change as well. A first answer of `0` is a baseline like any other.
- A network failure (a rejected `TypeError`) and an `ApiError` with status `500` invalidate nothing and do not stop the poll: the next poll still happens 2500 ms later. After such failures, an answer equal to the number before them invalidates nothing; an answer that differs from it invalidates once.
- An `ApiError` with status `401` calls `invalidateQueries` with `FOLDERS_KEY` and `BOOKMARK_LIST_KEY` once each, and no further request is made: after ten more intervals the spy's call count has not grown. A `visibilitychange` to visible after the `401` makes no request either, and re-rendering the hook does not call `invalidateQueries` again.
- With `document.visibilityState` stubbed to `'hidden'`, advancing past two intervals makes no request; switching it to `'visible'` and dispatching a `visibilitychange` event on `window` (create it with `new Event('visibilitychange')`; TanStack's focus manager listens on `window`, and an event dispatched on `document` without `bubbles: true` never reaches it) makes exactly one request at once. Use the same way of dispatching in the `401` test above.
- Unmounting stops the poll: advancing three intervals after unmount makes no request, and an answer that resolves after the unmount (hold its promise, unmount, then resolve it with a different number) causes no `invalidateQueries` call.
- A second mount **in the same commit as the unmount of the first** (render a parent that swaps one harness child for another with a different `key`, with the same client and without advancing the timers between them) treats its first answer as a baseline even when the number differs from the first mount's: no invalidation. The same swap after a `401` in the first mount makes a new request in the second (the old `401` is not seen).
- Polls do not overlap: with `getSyncVersion` held pending, advancing three intervals leaves the spy at one call.
- Rendered under `StrictMode` (the harness wraps the hook in it), the hook makes a single baseline: one remembered number and no `invalidateQueries` call after the first answer.
- The poll's request is the only thing it does: `getSyncVersion` is called with no arguments, and no other wrapper is called.

**`AppShell` (component, fake timers, in `AppShell.test.tsx`)**
- At a wide viewport, with `listFolders` mocked, a version change makes `listFolders` run again, and the children and the sidebar links stay mounted throughout (same DOM nodes before and after, checked by holding a reference to the children's element).
- At a narrow viewport (`setViewport`) with the drawer closed, a version change keeps the children mounted and does not call `listFolders` (nothing shows the folder list then). With the drawer open, a version change makes `listFolders` run again.
- In each layout, with a mock that resolves at once, over one 2500 ms interval there is exactly one poll request, not two.
- Changing the viewport from wide to narrow while mounted does not start a second poll stream (still one request per interval) and does not count as a change.
- The existing tests in this file keep passing with `lib/api/sync` mocked (see below).

**Page (`BookmarksPage.test.tsx`)**
- With the list on screen, a version change makes `listBookmarks` run again with the same arguments as the first call, and while that second request is still pending the rows are still on screen and no skeleton is shown. When it resolves with a changed list, the rows show the new list.
- A signed-out answer to the poll (`401`) with rows on screen refetches the list; when that refetch also answers `401`, the signed-out message shows.

**Page (`FolderPage.test.tsx`)**
- On a folder page, a version change makes `listFolders` run again and `listBookmarks` run again with the same arguments as its first call (including the `folderId`). When the refreshed folder list no longer contains the folder, the page shows its existing "folder missing" panel (use the text and role the file's existing tests already assert).

**The mocks.** `AppShell` now polls, so every test that renders it would call the real `fetch`. The four test files that render `AppShell` (directly or through a page) are `app-shell/AppShell.test.tsx`, `pages/BookmarksPage.test.tsx`, `pages/FolderPage.test.tsx` and `App.test.tsx`; confirm that list with a search for `BookmarksPage`, `FolderPage`, `TrashPage`, `AppShell` and `<App ` in `*.test.tsx`, and add the same mock to every file it finds. Each mocks `lib/api/sync` so `getSyncVersion` resolves `{ version: 0 }` (or never resolves) and no test reaches `fetch`. Where a file calls `mockReset()` in `beforeEach` (`AppShell.test.tsx` does, for `listFolders`), set the sync mock's return value again after the reset, or reset only the other mocks: a bare reset makes `getSyncVersion` return `undefined`, which TanStack Query reports as an error. A test that passes only because the poll's request fails silently is wrong. Do not change `src/test/setup.ts` to do this globally.

**Repo-wide**
- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt:

- `getSyncVersion` is called only from `useSyncPoll`. `useSyncPoll` is called only from `AppShell`, once, above the layout branch (not inside either branch). No page, no feature and no other shell component starts a poll.
- The poll has `refetchIntervalInBackground: false`, `refetchOnWindowFocus: true`, `retry: false`, `gcTime: 0`, a per-mount token in its key, and `refetchInterval` returns `false` once stopped. No test can tell `refetchIntervalInBackground: false` from its absence (TanStack also checks focus), so read the options in the code; do not count a mutation of that option as a test check. The interval is `SYNC_POLL_MS`, 2500, used by both the code and the test.
- The comparison is `!==` against a ref that is not cleared by a failed poll, and the first answer does not invalidate. The invalidations are exactly `FOLDERS_KEY` and `BOOKMARK_LIST_KEY`, with no `refetchType: 'all'`, no `resetQueries`, no `removeQueries`, no `queryClient.clear()`: any of those would bring back the skeleton or drop rows.
- No state change, no `key` change and no remount is caused by the refresh in `AppShell` or the pages; the poll adds no `useState` to `AppShell`.
- Reading `useBookmarkList.ts` shows the phase stays `ready` while a refetch runs with data in the cache (`query.isPending` is false); the page test proves it with a pending second request.
- No dependency, `package.json`, lockfile, `schema.d.ts`, page component, `features/**` source or style file changed. No `localStorage` or timer outside the query's own options. No `eslint-disable`.
- To confirm the tests discriminate (break the behavior, see them fail, revert): change the interval to 5000; compare with `>` instead of `!==`; make the first answer invalidate; clear the remembered number after a failed poll; drop the `FOLDERS_KEY` invalidation (and separately the `BOOKMARK_LIST_KEY` one); keep polling after a `401`; drop the per-mount token from the query key (the same-commit swap test must fail); replace the invalidation with `resetQueries` and check the page test that holds the rows fails; call the hook inside both layout branches and check the "one request per interval" tests fail. Revert each.
- Try to break it with: a version that goes up then down; a poll that answers after the shell unmounted; two quick changes between two polls (one refresh is enough); a change that arrives while a "Load more" request is in flight; a `401` while a dialog is open; switching between a folder page and the trash many times quickly (each switch mounts a new poll); the tab hidden for a long time and then shown.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement or this file conflict with each other.
- You think you need a change to a page, to `features/**`, to `test/setup.ts`, to the shared styles, a dependency, or an edit to a spec file.
- Refreshing the lists without a skeleton turns out to be impossible with the existing `useBookmarkList` (for example the phase goes back to `loading`). Do not change the hook to make it work; report what you saw.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `npm ci` in `frontend/` if there is no `node_modules`, then `make check`; commit in small steps; push your branch (never `main`); and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), and anything you were unsure about. Also note every place you made a judgment call that this file did not settle, and say plainly that the timing and the hidden-tab behavior were tested with fake timers only and not checked in a real browser.
