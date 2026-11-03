# Verification report: save popup and bookmark view (front end)

**Verifier branch:** `claude/save-form-verify-mkjo2m` (starts at the builder's `claude/save-form-task-oy6ggs` tip `2879818`, plus four added tests in `SavePopup.test.tsx` and this report).
**Verdict:** the slice is mostly correct and `make check` is green. There are two Blocking findings: a 401 during polling is swallowed (B1), and a dependency beyond the task file's list was added (B2). Everything else is small.

## 1. `make check`

Exit 0, before and after my added tests (96 → 100 frontend tests, 11 files). Backend tests, `go vet`, ESLint, the TypeScript build and `openapi-lint` all pass. `openapi-lint` prints 7 tag-description warnings in `openapi.yaml`, which this branch does not touch. Setup note: I had to run `npm ci` first because `frontend/node_modules` was missing.

## 2. Acceptance criteria

Tests are under `frontend/src/`. "Real" means the test fails if the behavior is removed. Overall status: **met** unless noted.

| Criterion | Covering test | Real? | Status |
|---|---|---|---|
| POST sends `X-CSRF-Token` = cookie; GET does not (NFR-13) | `lib/api/request.test.ts` "request csrf header" (POST, read at call time, GET, no credentials option) | Yes, the cookie is changed between calls | Met |
| 409 problem+json → `ApiError` with status/code/duplicate fields; 429 carries `Retry-After` | `request.test.ts` "request errors" | Yes | Met |
| Non-problem response → `ApiError`, no problem; network failure is not `ApiError` | `request.test.ts` | Yes | Met |
| Failure mapping: every table row, `too_long` on url and title, 429 with/without header, duplicate id | `features/save/lib/saveFailure.test.ts` | Yes (`toEqual` on the whole result) | Met. The "without Retry-After" text differs from the task table, see N1 |
| Popup: Save focused, Enter saves, Esc cancels, nothing created on open | `SavePopup.test.tsx` "keyboard and focus" | Yes | Met |
| Popup: Enter/Esc on an alert dismiss it | "dismisses an alert on Enter and on Esc without closing the window" | Yes; also asserts no second create and no `close()` | Met |
| Popup: second Enter while saving does not save twice | "does not save twice when Enter is pressed twice quickly" | Yes: two events in one `act`, `createBookmark` called once, fields disabled | Met |
| Popup: title sent only when non-empty after trim; typed title sent | "SavePopup title" | Yes | Met |
| Popup: "Saved", `close()` at 1 s, "close this tab" 350 ms after a close call; Cancel without delay | "SavePopup closing" (fake timers; 999 ms vs 1000 ms boundary) | Yes | Met |
| Popup: live and trashed duplicate and each other failure stay open; dismiss keeps title | "SavePopup failures" `it.each` (6 failures; also asserts no link and no `close()`) | Yes | Met |
| Popup: missing or non-http `url` disables Save and shows the message | "SavePopup url check" (missing, `javascript:`, `hello`, plus Enter does nothing for `ftp:`) | Yes | Met |
| Popup: 401 shows signed-out message; link carries encoded path+query; dev-login in dev, `/auth/login` otherwise | "SavePopup signed out" (stubs `DEV` true and false; url contains `&`, `#`, a space) | Yes | Met |
| Home: Enter submits; button disabled when empty and while saving; success navigates | `AddByUrl.test.tsx` | Yes | Met |
| Home: each failure shows message and keeps input; duplicate links to the existing bookmark; 401 signed-out | `AddByUrl.test.tsx` | Yes | Met |
| Bookmark page: pending/ok/failed/trashed text; no Restore button; `<b>x</b>` literal | `BookmarkView.test.tsx` | Yes (`textContent` and no `<b>` element). "No Restore" is checked as "no button at all" | Met |
| Favicon falls back to tile on null and on image error | `Favicon.test.tsx` | Yes | Met |
| Polling 1 s pending, 5 s after 30 s, stops on ok/failed, 404, 401, unmount | `useBookmark.test.tsx` | Yes at hook level. A 401/404 *mid-poll* is not shown by the page, see B1 | **Partly met** (hook yes, screen no) |
| 404 shows "Bookmark not found" | `BookmarkView.test.tsx` | Yes (first load only) | Met |
| `make check` passes | run above | | Met |
| No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` | `grep` over `frontend/src` (excluding generated `schema.d.ts`): none | | Met |
| Nothing under `backend/`, `docs/`, Makefile, `openapi.yaml` changed; nothing copied but CSS | `git diff` against the merge base: only `docs/tasks/save-form.plan.md` (the plan, expected) under those paths. No long-line overlap with reference `.tsx` beyond six copy strings in `SavePopup.tsx` | | Met |
| Signed out (task section, not in the list): 401 from any of the three screens shows the message | Initial-load cases tested on all three; mid-poll 401 not | | **Partly met**, see B1 |

Requirement IDs: FR-3/3a/3b/3d, FR-5a, FR-6, FR-21a, FR-24, NFR-13, NFR-16, NFR-17 are all exercised by the rows above. FR-3c is the known gap (the popup learns it is signed out only on Save). The builder lists it, and I did not try to work around it.

## 3. Plan check (`docs/tasks/save-form.plan.md`)

- Every acceptance criterion in the task file appears in the plan, in the same groups. Nothing is missing.
- Every ticked item names an existing test, and the tests check the stated behavior (confirmed in section 2).
- Differences between plan and diff:
  - `features/save/hooks/useCloseWindow.ts` (+ test) exists in the diff but is not in the plan's layout line. It is a legitimate extra hook and is covered.
  - The plan says `@tanstack/react-query` was "allowed by the user in this session". Nothing in the repo records that, see B2.
  - The plan says the 429 "a moment" wording is a deliberate change, see N1.
  - Plan says `src/index.css` was removed: true.
- The plan is honest that nothing ran in a browser or against the Go server. I could not run a browser either.

## 4. Rule checks

| Rule | Result |
|---|---|
| Only `handler/` imports `internal/api` | Not applicable: no backend file changed |
| Every repository query filters by `user_id` | Not applicable: no repository change |
| `users.version` incremented in every write transaction | Not applicable: no write path changed |
| `go.mod` `go`/`toolchain` unchanged; no new dependency beyond the allowed list | Go: `go.mod`/`go.sum` untouched. **npm: `@tanstack/react-query` added beyond the task file's list (B2)**; `react-router` 8.5.1 is allowed |
| Types come from `schema.d.ts` | Yes. `lib/api/types.ts` only aliases generated schemas. `ProblemBody` is composed with `&`/`Pick`, not a hand copy |
| No reference `.ts`/`.tsx` copied; only used CSS carried over | `tokens.css`, `base.css` identical to the reference. `components.css`/`layout.css` hold only rules these screens use (two classes unused: `save-popup__loading`, `state-panel__icon`; negligible). `pages.css` is new |
| CSRF read from cookie at call time, on every write | Yes: `request.ts` reads `document.cookie` per call and covers POST/PATCH/DELETE |
| No HTML parsing of content; saved URL links use `noopener noreferrer` | Yes: content is a text node; no `dangerouslySetInnerHTML` or `innerHTML` anywhere. The URL anchor has `target="_blank" rel="noopener noreferrer"` |
| Polling uses `refetchInterval`, no `setInterval`, stops in every listed case | `useBookmark.ts` uses `refetchInterval`; no `setInterval` in `src`. Stops on ok/failed/404/401 and unmount at the hook level |
| Popup matches brief screen 5 line by line | Matches the task file: keys, 1 s "Saved", 350 ms fallback, duplicate wording, errors stay open |
| Login return link keeps the popup query string, encoded | Yes: `encodeURIComponent(pathname + search)` |

## 5. Findings

### Blocking

**B1. A 401 during polling is swallowed; the page stays on stale "Pending" (task section "Signed out").**
`BookmarkView.tsx` shows the signed-out message only when `bookmark` is empty. After a successful first load, a later poll that returns 401 leaves `data` in place, so the error is never shown. The hook correctly stops polling, so the page shows a "Pending" chip that never changes, with no message and no way to log in.
Reproduce (I ran this as a throwaway test and did not commit it): render `BookmarkView` with `getBookmark` mocked to resolve a `pending` bookmark once, then reject with `new ApiError(401, null, null)`; advance fake timers 5 s. Result: 2 calls, "You're logged out…" absent, chip "Pending" still shown.
Expected per the task file: "On a 401 from any of the three screens, show 'You're logged out…'". Fix is in `BookmarkView.tsx` (check `error` for a 401 before rendering data). Add a test for it next to the existing 401 test.

**B2. Dependency beyond the task file's list.**
`frontend/package.json` adds `@tanstack/react-query` (`^5.105.3`). The task file says "You may add `react-router`... Nothing else. `package.json` and `package-lock.json` change only for that." The task also requires TanStack Query's `refetchInterval`, so the task file contradicts itself. The right move was to stop and ask. `STACK.md` does list TanStack Query, and the plan says the user approved it in the session. This is Blocking only because nothing in the repo records that approval. If you confirm it, treat B2 as cleared.

### Non-blocking

- **N1. 429 without `Retry-After`** reads "Try again in a moment." The task table gives "about N seconds" and "a moment" when missing, which could read as "about a moment". The builder chose the better sentence and said so. The tests pin the chosen wording.
- **N2. 404 during a poll** (the bookmark was deleted meanwhile) also leaves the stale page with no "Bookmark not found" (same cause as B1; I reproduced it the same way).
- **N3. Retry-After edge values.** An empty header gives `Number('')` = 0, so "about 0 seconds". A negative value shows "about -5 seconds".
- **N4. A malformed cookie** (`csrf_token=%E0%A4%A`) makes `decodeURIComponent` throw a `URIError` before the request is sent. On the popup that shows "Couldn't save that link."
- **N5. URL length is not checked on the client.** A 2,048-character and a 2,049-character `url` parameter are both sent as-is, and the server decides (`too_long`). This matches the plan and the task file. I added tests that pin it, and they do not assert the server's answer.
- **N6. `Favicon` keeps its `broken` flag** if `faviconUrl` changes on the same mounted component. This cannot happen today, since the page remounts per bookmark and the URL does not change.

### Tests I added

In `frontend/src/features/save/components/SavePopup.test.tsx`, new `describe('SavePopup limits and url shapes')`: a title of exactly 300 characters, urls of exactly 2,048 and 2,049 characters, and a url containing `&` and `#`. All pass. No source files were changed.

## 6. Integration tests

None. This task is front end only and adds no Go code, so there are no integration tests to run or to depend on. Nothing was verified in a browser or against the Go server. No criterion rests only on one.
