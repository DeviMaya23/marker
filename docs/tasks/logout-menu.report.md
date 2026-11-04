# Verification report: logout-menu

Branch: `claude/logout-menu-s7okcx-trrdtd` (builder's work: `claude/logout-menu-s7okcx`, head `fc0a936`)

Result: **no Blocking findings.** `make check` passes (exit 0; Vitest 76 files, 956 tests passed; Go tests, lint, stylelint, OpenAPI lint pass; only the 7 existing Redocly `tag-description` warnings). I added no tests and changed no source.

Integration tests: **not run.** The task changes nothing under `backend/` (diff against `main` has zero lines in `backend/`), so `make test-integration-local` was not needed. No criterion depends only on integration tests.

## 1. Acceptance criteria

Paths are under `frontend/src/`. "Real" means the test would fail without the behavior. Requirements: FR-2 (app half) and NFR-13 (CSRF on the write).

| Criterion | Test | Real? | Status |
|---|---|---|---|
| `logout()` POSTs `/auth/logout`, CSRF from cookie, no body, no Content-Type, resolves `{logout_url}` (FR-2, NFR-13) | `lib/api/auth.test.ts` "POSTs /auth/logout…" | Yes: asserts URL, method, body, header, no Content-Type. Mutations (c) and (d) turned it red | Met |
| 401, 403, 429 (`Retry-After: 7`) reject as `ApiError` with status, problem, retryAfter | `auth.test.ts` `it.each([401,403,429])` | Yes | Met |
| Existing `request.test.ts` cases unchanged; `/auth/logout` path requested | `request.test.ts` "requests the path under the given base…" (existing cases untouched in diff) | Yes | Met |
| `logoutTarget`: valid URLs unchanged (incl. upper case, 5,000 chars); every listed bad input gives `/` | `features/account/lib/logout.test.ts` | Yes: every input in the task list is present, plus U+007F. Mutation (a) turned `useLogout` tests red | Met |
| `describeLogoutFailure` table (401, 429 with 7 / 0 / null, 403, 501, 500, non-ApiError, TypeError) | `logout.test.ts` | Yes, exact `toEqual` | Met |
| 200 + valid URL: `goTo` once with URL, no toast, stays disabled | `hooks/useLogout.test.tsx` "on 200 goes to the URL once…" | Yes, also asserts no invalidation. Mutation (b) turned it red | Met |
| 200 + `''` / `javascript:alert(1)`: `goTo('/')` once | `useLogout.test.tsx` `it.each` | Yes (`toHaveBeenCalledWith('/')` once, so the bad value is never passed) | Met |
| Second `logout()` in flight / after success sends nothing | `useLogout.test.tsx` "sends nothing for a second logout…" | Yes (mock called once) | Met |
| 403, 501, 500, network: error-tone toast, no `goTo`, re-enabled | `useLogout.test.tsx` `it.each` | Yes, tone read from `.toast--error` | Met |
| 429 `Retry-After: 3`: message; re-enabled | `useLogout.test.tsx` "words a 429…" | Yes | Met |
| 401: "You're logged out." error toast with "Log in" to `loginHref` of `/trash?x=1`; re-enabled | `useLogout.test.tsx` "on 401 toasts…" | Yes, but see Non-blocking 1 (asserts the encoded path and `return_to=`, not the exact href) | Met |
| Retry after failure works | `useLogout.test.tsx` "works again after a failure" | Yes | Met |
| Trigger is a button "Account & help" with `sidebar__top-link`; closed until opened; two menuitems in order | `components/AccountMenu.test.tsx` first test | Yes (also asserts no `href`) | Met |
| "Account & help" navigates through the router, `onNavigate` once, no `goTo`, closes; same on `/account` | `AccountMenu.test.tsx` `it.each(['/', '/account'])` | Yes. Mutation (f) (full page load) turned it red. On `/account` the location check alone can't tell "stayed" from "went", but `onNavigate` and menu close are asserted | Met |
| "Log out" calls `logout` once, no `onNavigate`, closes | `AccountMenu.test.tsx` "Log out logs out once…" | Yes. Mutation (e) turned it red | Met |
| Disabled while pending, enabled after failure, disabled after success | `AccountMenu.test.tsx` "is disabled while pending…" | Yes | Met |
| Footer menu after Folders; no link role; three old tests replaced | `app-shell/SidebarContent.test.tsx` (diff replaces the three) | Yes | Met |
| Keyboard: Enter opens, ArrowDown reaches Log out, Esc closes and refocuses | `AccountMenu.test.tsx` last test | Yes | Met |
| `Menu` without `side`/`align`: existing tests unchanged | `Menu.test.tsx` (diff only adds one test); `BookmarkRow` and `FolderTree` tests pass in the full run | Yes | Met |
| `side="top"` `align="start"` reach the positioner | `Menu.test.tsx` "passes side and align to the positioner" (asserts `data-side`, `data-align`; jsdom shows them) | Yes | Met |
| `make check` passes | Ran it: exit 0 | n/a | Met |
| Nothing outside allowed paths changed | `git diff a2c3a72` touches only allowed `frontend/` files plus `docs/tasks/logout-menu.plan.md` (see section 3) | n/a | Met |

## 2. Plan check

- Every acceptance criterion has a plan item, and every item is ticked. No criterion is missing from the plan.
- Each ticked item names a test that exists and checks the behavior (section 1). The plan's claims match what I ran: 956 tests passed.
- Plan vs diff: no difference. The judgment calls in the plan match the code (optional fourth argument `{ base?: string }` on `apiRequest`; `https:///x` and bare `https://` rejected by a string check before `new URL`; `side` undefined by default, `align` defaults to `end`).
- The plan reports a flake in `EmptyTrash.test.tsx` ("focuses the field on open"). I did not see it in my full run; it is unrelated to this task (Non-blocking 3).
- Plan says the integration tests were not run because nothing under `backend/` changed. Correct.

## 3. Rule checks

- **Only `handler/` imports `internal/api`:** no Go file changed.
- **`user_id` filter / `users.version`:** no repository or write transaction changed.
- **`go.mod` and dependencies:** `backend/`, `package.json` and `package-lock.json` are unchanged (zero diff lines).
- **Allowed paths:** the diff lists `SidebarContent(.test).tsx`, `Menu(.test).tsx`, `AccountMenu(.test).tsx`, `useLogout(.test).ts(x)`, `logout(.test).ts`, `auth(.test).ts`, `request(.test).ts`, `goTo.ts` (doc comment only) and `layout.css`, plus the plan. Nothing else.
- **`useLogout` never touches the query client:** read the diff; it imports no query client. Tests spy on `invalidateQueries` for success and failures.
- **Only `useLogout` navigates away, through `goTo`; no unchecked `logout_url`:** `goTo(logoutTarget(url))` is the only call with the server value. `AccountMenu` uses the router. `git grep` finds `window.location` only in `lib/goTo.ts` and in the existing `BookmarkletSection.tsx` (reads `origin`, pre-existing). No `dangerouslySetInnerHTML` or `eval` added.
- **Request path:** `/auth/logout` through `{ base: '' }`; other wrappers still use the `/api/v1` default. Mutation (d) turned a test red.
- **`Menu` defaults unchanged:** the diff shows only the two optional props and the pass-through. `align` defaults to `end` as before; `side` undefined.
- **Footer:** `sidebar__footer` holds only `<AccountMenu>`; no `NavLink` to `/account` remains; the item has no `href`.
- **CSS:** `.sidebar__top-link` was edited in place (one block); the three new selectors follow the existing rules; stylelint passes inside `make check`. The popup z-index was not touched.
- **Discrimination (scratch edits, all reverted; `git status` clean):**

| Mutation | Result |
|---|---|
| (a) pass raw `logout_url` to `goTo` | 2 tests red (`useLogout`) |
| (b) re-enable trigger after success | 3 tests red (hook and `AccountMenu`) |
| (c) drop the CSRF header | `auth.test.ts` red |
| (d) call `/api/v1/auth/logout` | `auth.test.ts` red |
| (e) call `onNavigate` for Log out | `AccountMenu.test.tsx` red |
| (f) full page load for "Account & help" | `AccountMenu.test.tsx` red |

## 4. Break attempts

- `logoutTarget` extra inputs (scratch test, deleted): `https://id.example:99999/x`, `https://:80/x`, `https://?x`, `https://#x`, `\thttps://id.example/` and `https://id.example/\rx` give `/`. `https://id.example`, `https://id.example#f`, `http://[::1]/x`, `HtTp://a/` and `https://id.example/%0a` are returned unchanged. All correct under the task's rules.
- Double submit: the `useRef` guard sets before the first await, so two Enters or a double click send one request (covered by the in-flight test).
- 429 with `Retry-After: 0`, no header and an HTTP date (null): covered by `describeLogoutFailure` rows and `apiRequest`'s existing `retryAfter` parsing.
- Ran `src/features/account`, `src/app-shell`, `Menu.test.tsx` and `src/lib/api` three times: 201 passed each time.
- Not checked: how the popup looks in a real browser (flip on a short sidebar, drawer z-index). The task leaves these to the user's hand check.

## 5. Findings

### Blocking

None.

### Non-blocking

1. The `401` toast test checks that the login link contains the encoded `/trash?x=1` and `return_to=`, not the exact `loginHref(...)` value. It still fails if the location is dropped.
2. `logoutTarget` accepts `https://@id.example/` (empty credentials parse to an empty username and password) and non-ASCII whitespace such as U+00A0 and U+0085. The task's rule lists only ASCII control and space characters, so this is within spec; the result is still a plain `https:` navigation.
3. `EmptyTrash.test.tsx` is reported flaky by the builder. Unrelated to this task; it did not fail in my runs.
