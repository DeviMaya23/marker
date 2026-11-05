# Verification report: login-error-message

Branch: `claude/login-error-message-verify-5f70hk` (reset to the builder's `claude/login-error-message-2h68hr`, 913203d, plus this report).

Result: **no Blocking findings.**

## `make check`

Run, exit 0: lint, lint-css, typecheck/build, openapi lint (7 pre-existing warnings), Go tests (cached), Vitest 83 files / 1117 tests passed.

## Acceptance criteria

| # | Criterion | Test | Real check? | Status |
|---|---|---|---|---|
| 1 | `loginErrorFrom`: two codes give code; `null`, `''`, `LOGIN_FAILED`, `' login_failed'`, `'login_failed '`, `access-denied`, `x` give null | `loginError.test.ts` (it.each x2) | Yes; case-insensitive mutation fails 2 tests | Met (FR-1) |
| 2 | `LOGIN_ERROR_MESSAGES` exactly the two texts | `loginError.test.ts` "has exactly the two texts" (`toEqual`) | Yes; swapping texts fails 12 tests | Met |
| 3 | `LoginCard` `error` gives one alert with exact text | `LoginCard.test.tsx` "shows %s as one alert…" (length 1, `textContent` equal) | Yes; role change fails | Met |
| 4 | No `error`: no alert, no banner element | `LoginCard.test.tsx` "shows no alert and no banner…" | Yes; always-render mutation fails 10 | Met |
| 5 | Link/href same with and without `error` | same test (compares href) | Yes | Met |
| 6 | Page: `login_failed`, `access_denied`, `return_to=%2Ftrash` href | `LoginPage.test.tsx` "shows the login-failed…", "shows the cancelled…", "keeps return_to…" | Yes; link-ignores-return_to mutation fails 8 | Met |
| 7 | `foo`, empty, `LOGIN_FAILED`, absent, `%00`, 5000 chars, `error[]=x`: no alert | "shows no alert for %s" (9 rows, includes `%20` and double-encoded) | Yes, each waits for the link before asserting absence | Met |
| 8 | Duplicate key uses first | "uses the first value…" | Yes (swapping would show "cancelled") | Met |
| 9 | Unsafe `return_to` still shows message, link to `/` | "links to / for an unsafe return_to…" | Yes | Met |
| 10 | Pending probe: only status, no alert | "shows only the checking status…" | Yes; banner-during-checking mutation fails 1 | Met |
| 11 | Signed in: replace navigation, no alert | "never shows it when signed in" (2 rows, asserts `REPLACE`) | Yes | Met |
| 12 | Probe 500 / 429 / network error: message shown | "shows the message when the probe fails with %s" | Yes | Met |
| 13 | Existing login tests unchanged | diff has 0 deleted test lines | Yes | Met |
| 14 | `make check` incl. lint-css; only allowed paths | run above; see rule checks | Yes | Met |

The two wordings are the drafter's; `docs/requirements.md` states none (as the task file says).

## Plan check (read after the above)

- Every criterion is in the plan; every ticked item names a test that exists and checks the behavior.
- Plan vs diff: no differences. The extra cases (`%20`, double-encoded, `#x`) are in the diff and in the plan's judgment calls.
- Plan says integration tests "not run: no `backend/` file". Correct, see below.
- Plan mentions one unrepeated `EmptyTrash.test.tsx` focus failure. It did not occur in my full run; noted only.

## Rule checks

- Only allowed paths changed: `frontend/src/{features/login,pages,styles}` and the plan file. No `package.json`, lockfile, `go.mod`, `backend/`, `openapi.yaml`, `docs/` (other than the plan) changes. No dependency added.
- `internal/api` import and `user_id`/`users.version` rules: not applicable, no backend change.
- Banner rendered only when `error` is set, via `Banner tone="error" role="alert"`; text from `LOGIN_ERROR_MESSAGES` only, no duplicated literals in component or page.
- `LoginPage` returns the "checking" status or `Navigate` before it reaches `LoginCard`, so the message cannot show in `checking` or `signed-in`.
- CSS: one rule `.login-card .banner`, appended after `.login-card__fineprint`, scoped under `.login-card`, only `justify-content` and `text-align`, no colour. The centred look was **not seen**: no browser view of the result.
- Mutations (each reverted, tree clean afterwards): banner always shown (10 fail), case-insensitive match (2), swapped messages (12), banner during checking (1), `role` dropped (11), link ignoring `return_to` (8). All caught.
- Extra inputs `error=login_failed%20`, double-encoded value, `error=login_failed#x`: covered by the builder's rows and behave as specified (the first two show no alert, the fragment is not part of the query so the message shows).

## Integration tests

Not run: the task touches no `backend/` file. No criterion depends on integration tests.

## Findings

Blocking: none.

Non-blocking:
1. The `LoginPage` pending-probe test finds the status by text because the test wrapper has another `role="status"` region; fine, only noting.
2. The builder's one-off `EmptyTrash.test.tsx` focus failure did not reproduce in my run; possibly a flaky test, out of scope.
