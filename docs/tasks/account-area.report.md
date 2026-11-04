# Verification report: account area

Branch: `claude/account-area-task-verify-khp949` (verifies builder branch `claude/account-area-task-m2s9e8`, commit 225874b; this branch adds two tests and this report).

Result: **no Blocking findings.** `make check` passes (72 frontend test files, 898 tests before my additions; Go tests, lint, stylelint, build and OpenAPI lint pass).

Integration tests: **not run.** The task changes only `frontend/` (plus its plan file), so `make test-integration-local` was not required; no PostgreSQL version to report. No criterion depends only on integration tests.

## 1. Criteria

All "could pass without it?" answers were checked by mutation: I broke the behavior, saw the test fail, and reverted (list in section 4).

| Criterion | Requirement | Test | Real? | Status |
|---|---|---|---|---|
| `bookmarkletHref` starts with `javascript:` | FR-3b | `bookmarklet.test.ts` "starts with javascript:" | yes | met |
| Code runs, one `window.open`, name `save-bookmark`, features, URL round-trips (query/fragment; `& # = "` space, non-Latin) | FR-3b | `bookmarklet.test.ts` it.each "opens the save page…" | yes; fails on name, features, or dropped `encodeURIComponent` of url/title | met |
| Origin with quote/backslash escaped | FR-3b | `bookmarklet.test.ts` "escapes the origin…" | yes; fails if origin pasted raw | met |
| No `noopener`/cookie/storage/csrf/token | FR-3b | `bookmarklet.test.ts` "carries no noopener…" | yes (string check) | met |
| `describeDeleteAccountFailure` 401, 429 (7/0/null), 403/500/problem body/TypeError | FR-25 | `deleteAccountFailure.test.ts` | rows exist for each case | met |
| `useDeleteAccount` success, rejection, re-entry, reset/next-run clears | FR-25 | `useDeleteAccount.test.tsx` | yes; removing the in-flight guard fails 2 tests | met |
| Section text, dialog name, focus, id `delete-account-confirm`, confirm disabled | FR-25 | `DeleteAccountSection.test.tsx` first test | yes | met |
| Phrase gating (`delete`, `…please`, empty disabled; trimmed/cased enabled), Enter only when enabled | FR-25 | same, it.each (also a `delete  my account` inner-space row) | yes; case-sensitive and whitespace-collapsing mutations fail it | met |
| Success: one call, `onDeleted` once after resolve, dialog closed | FR-25 | same, "calls onDeleted once, after…" | yes; calling `onDeleted` before the request, or on failure, fails 5 tests | met |
| Pending: field/Cancel/confirm disabled, Esc ignored, no second send | FR-25 | same, "locks the dialog…" | yes; dropping `busy`, enabling confirm while pending, not disabling the field each fail | met |
| 401/429/500/network: message, dialog open, text kept, confirm enabled, no `onDeleted` | FR-25 | same, it.each | yes | met |
| Cancel/Esc close with no request; reopen clean | FR-25 | same, "closes on Cancel and on Esc…" | yes; removing `del.reset()` fails it | met |
| `BookmarkletSection` href equals `bookmarkletHref(origin)`, click prevented, no `window.open` | FR-3b | `BookmarkletSection.test.tsx` | yes; removing `preventDefault` fails | met |
| Four steps in order | FR-3b | same | yes | met |
| `AccountPage` h1 `page__title`, two h2 in order, inside shell | FR-25 | `AccountPage.test.tsx` first test | yes | met |
| After delete: panel, shell gone, Log in href, description, no more `listFolders`/`getSyncVersion`, cache empty | FR-25 | `AccountPage.test.tsx` second test | yes; skipping `clear()` and rendering the panel inside `AppShell` each fail | met |
| Failed delete / cancel leave cache and page | FR-25 | `AccountPage.test.tsx` third test | yes; clearing the cache unconditionally fails | met |
| Nothing from deleted panel before delete | FR-25 | first `AccountPage` test (`queryByText(DELETED)`) | yes | met |
| `SidebarContent`: link to `/account`, after folders, `aria-current` on `/account` not `/` | FR-25 (UI) | `SidebarContent.test.tsx` first two tests | yes | met |
| Click calls `onNavigate` once | | `SidebarContent.test.tsx` third test | yes | met |
| `/account` route; unknown path still not-found | | `App.test.tsx` | yes | met |
| `make check` passes; nothing outside allowed paths | | run | | met |

## 2. Plan check

`docs/tasks/account-area.plan.md` was read only after the criteria above were judged.

- Every acceptance criterion appears in the plan. None is missing.
- Every ticked item has a test that exists and checks the behavior (see the table).
- The plan matches the diff: icons (`CircleUser`, `Bookmark`, `Trash2`, `CircleCheck`), the `close()` reuse in `DeleteAccountSection`, the flex-column change to `.drawer-panel__body`, and the omitted demo CSS all match.
- The plan's integration line ("not run: task touches only frontend") is accurate.

## 3. Rule checks

- Only `handler/` imports `internal/api`: not applicable, no `backend/` change.
- `user_id` filtering, `users.version`, `go.mod`: not applicable, no `backend/` change.
- Changed files are all in allowed paths (`git diff --name-only`). `package.json`, `package-lock.json`, `schema.d.ts`, `AppShell.tsx`, `openapi.yaml`, `components/ui/` and the other pages are untouched.
- `href` is set only through a ref callback (`BookmarkletSection.tsx`). No `dangerouslySetInnerHTML`, `eval` or `new Function` in app code. The code string holds no token, cookie or user data.
- `deleteAccount` is called only from `useDeleteAccount`, which does not touch the query cache. `AccountPage` clears it in an effect on `deleted`, after `AccountDeleted` replaced the shell (`if (deleted) return <AccountDeleted />`, outside `AppShell`).
- The confirmation has the Empty-trash shape (typed phrase, disabled while pending, `busy` on `Dialog`). No new confirm component under `components/ui/`.
- `rateLimitMessage` is exported from `describeFailure.ts` and used by `deleteAccountFailure.ts`. The two existing private copies in `folderFailureMessage.ts` and `saveFailure.ts` are untouched and no new copy was added.
- CSS: the only removed lines in the diff are unchanged context; `.account-page` was edited in place, `.sidebar` and `.drawer-panel__body` edited in place, and `.sidebar__footer` is new with `margin-top: auto`, a top border, and the padding of `.sidebar__scroll`. No `sticky` or `fixed` on it; the stylelint rules pass. `.account-page` has `max-width: 640px` and nothing forces a width, so I expect no sideways scroll (read, not seen in a browser).

## 4. Breaking attempts

Mutations (each reverted; each made at least one test fail): window name, features string, no `encodeURIComponent` on title, on URL, raw origin; case-sensitive phrase; inner-space collapsing; confirm enabled while pending; no `busy`; failure kept after Cancel; `onDeleted` before the request and on failure; field not disabled; no re-entry guard; no `preventDefault`; no cache clear; cache cleared on every render; final page inside `AppShell`.

Cases the task file did not list, now tests in `DeleteAccountSection.test.tsx`: double click on confirm sends one request; a 429 followed by a retry that succeeds (the old failure disappears while it runs, then `onDeleted` once and the dialog closes). Both pass on the unchanged source.

Not testable here: a 401 followed by logging in from another tab; a narrow screen and the drawer layout in a real browser; the bookmarklet in a real browser.

## 5. Findings

**Blocking:** none.

**Non-blocking**

1. `useDeleteAccount` sets state in `finally` after `onDeleted` may already have unmounted the section's parent; React 19 ignores this, so there is no warning. No action.
2. The "no `noopener`/token" check is a substring check on the code, so a future comment containing such a word would fail it. Acceptable.
3. Layout (footer at the bottom of a short sidebar, the scrolling drawer body) was verified by reading the CSS only.
