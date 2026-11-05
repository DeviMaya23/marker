# Task: login failure message (front end)

Front end. One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Prerequisite

`login-screen` is merged: `frontend/src/pages/LoginPage.tsx`, `features/login/components/LoginCard.tsx`, `features/login/lib/safeReturnTo.ts` and `useLoginProbe` exist. The contract already describes the redirect this task reads: `authCallback` in `openapi.yaml` says every failure redirects to `/login?error=<code>`, where `<code>` is `access_denied` or `login_failed`, with `&return_to=<path>` added when the `state` was valid. If either is missing, stop and ask. This task needs no backend change and can be built and tested from the contract alone; it only shows the message end to end once the backend's callback redirect is live (`login-binding` completes the backend side).

## Goal

When the identity-provider login fails or is cancelled, the user comes back to the `/login` screen and is told why, instead of seeing a card that looks as if nothing happened. Two messages: "Login didn't complete. Please try again." for `error=login_failed`, and "Login was cancelled." for `error=access_denied`. The "Log in" link on the card keeps working and keeps returning to the page the user was trying to reach.

Requirements covered: FR-1 (the user logs in through the identity provider; this keeps the login usable after a failure by telling the user and leaving the retry link in place). `docs/requirements.md` states no wording for failures: the two messages are the drafter's, and the verifier says so.

Out of scope, with the reason for each:
- Any backend or contract change: the redirect is already specified.
- The `429` that the login routes can answer: that is a raw problem document shown by the browser, not a redirect (backend known gap).
- Showing the message to a signed-in user: a user whose session is still valid is sent on to `return_to` as `login-screen` does, and sees no message (see Known gaps).
- Clearing the `error` parameter from the address, a "dismiss" button, or a retry counter.
- Other `error` values, logging them, or telling the user more about the cause.
- The `/login` probe, the `401` redirect rule, and every other screen.

## Role and ownership

Role: Frontend (see `AGENTS.md`).

You may change `frontend/**` except `package.json`, `package-lock.json`, `README.md` and any stylelint configuration. You may not change `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/login-error-message.plan.md`, see `AGENTS.md`), the Makefile, or `frontend/src/lib/api/schema.d.ts` (generated).

Shared files: you change `pages/LoginPage.tsx` and `LoginPage.test.tsx`, `features/login/components/LoginCard.tsx` and `LoginCard.test.tsx`, `styles/layout.css` (one appended rule), and add `features/login/lib/loginError.ts` and its test. You do not change `components/ui/` (use `Banner` as it is), `test/setup.ts`, `lib/loginHref.ts`, `safeReturnTo.ts`, `useLoginProbe`, `App.tsx` or `AppShell`. Backend tasks can run alongside. No other frontend task is drafted; one that changes `styles/layout.css` or the login files must not run together with this one.

## Operations used

None called. The task reads two query parameters of the `/login` address, `error` and the existing `return_to`, which `authCallback` puts there (see Prerequisite). Generated types are not involved.

## Behavior

### Reading the error

`features/login/lib/loginError.ts` exports a type `LoginError` (`'login_failed' | 'access_denied'`), a function `loginErrorFrom(raw: string | null): LoginError | null`, and one exported map `LOGIN_ERROR_MESSAGES` (a `Record<LoginError, string>`): `login_failed` is "Login didn't complete. Please try again." and `access_denied` is "Login was cancelled.". `LoginCard` reads its text from this map. `loginErrorFrom` returns the code only for an exact, case-sensitive match of one of the two values; `null`, an empty string, a different case (`LOGIN_FAILED`), a value with spaces around it, or any other text gives `null`. If the address has the key more than once, `LoginPage` uses the first value (`URLSearchParams.get`).

### The screen

`LoginPage` reads `error` from the address next to `return_to`, and passes the result to `LoginCard` as a new optional prop `error` (a `LoginError`, absent for none). The probe flow is unchanged:
- While the probe is pending: only "Checking your session…", as today. No message.
- Signed in: the page goes to `return_to` with replace, as today. No message.
- Not signed in, or the probe failed for any other reason (`429`, `500`, a network error): the card, with the message if `error` was one of the two codes.

`LoginCard` with an `error` shows one error banner between the description ("A place to dump links and find them again.") and the "Log in" link: the existing `Banner` from `components/ui/Banner` with `tone="error"` and `role="alert"`, containing exactly the message text and nothing else. `role="alert"` is chosen on purpose: the card appears after the probe, so the banner is inserted into the page and announced; a screen reader that skips it still shows the text in the card. Spacing is the banner's own bottom margin and the card's existing gaps; the builder adds none (it cannot see a browser, so say so in the report). Without an `error` the card is exactly as it is today: no banner, no empty element, no `role="alert"`.

The "Log in" link is unchanged: `loginHref(returnTo, '')`, where `returnTo` is the existing `safeReturnTo` of the `return_to` parameter. A failed login redirected with `return_to=/trash` therefore gives the link `/auth/login?return_to=%2Ftrash`, and without one the link returns to `/`.

### Style

Append one rule to `styles/layout.css` after the `.login-card__fineprint` rule: `.login-card .banner` centres its content (`justify-content: center` and `text-align: center`), because the card centres its text and the banner is a flex row. No new colours or tokens; the banner's own error colours are used. `make lint-css` must pass.

### Known gaps

- A user whose session is still valid when a login fails (for example a stale callback opened in a second tab) is redirected on by the probe and never sees the message.
- The `error` parameter stays in the address; reloading the page shows the message again. A later successful login lands on `return_to`, not here.
- `login_failed` covers every failure (bad or expired state, wrong binding cookie, code exchange failure, a server fault): the message does not say which, on purpose.
- The two texts are English only, like the rest of the app.
- The banner is not dismissible and has no icon.

## Structure

By `ARCHITECTURE.md`: the login feature's helper goes in `features/login/lib/loginError.ts` (like `safeReturnTo.ts`); the page reads the address and passes a prop (`pages/LoginPage.tsx`); `LoginCard` stays presentational.

## Dependencies

None. `Banner` already exists in `components/ui/`. Do not change `package.json` or the lockfile.

## Acceptance criteria

Vitest with Testing Library, no network; the existing mocks in `LoginPage.test.tsx` (`getSyncVersion`, `goTo`) are reused.

**`loginErrorFrom` (`features/login/lib/loginError.test.ts`)**
- `login_failed` and `access_denied` give their code; `null`, `''`, `LOGIN_FAILED`, ` login_failed`, `login_failed ` , `access-denied` and `x` give `null` (write the trailing-space case as `'login_failed '`).
- `LOGIN_ERROR_MESSAGES` has exactly the two texts above, keyed by code.

**`LoginCard` (`LoginCard.test.tsx`)**
- With `error="login_failed"` there is one element with `role="alert"` whose text is exactly "Login didn't complete. Please try again."; with `error="access_denied"`, exactly "Login was cancelled.".
- Without `error`: no `role="alert"` and no element with the banner class.
- The "Log in" link and its `href` are the same with and without `error`.

**`LoginPage` (`LoginPage.test.tsx`)**, signed out (`getSyncVersion` rejects with a `401`):
- `/login?error=login_failed` shows the login-failed message once the card appears, and the "Log in" link is present.
- `/login?error=access_denied` shows "Login was cancelled."
- `/login?error=login_failed&return_to=%2Ftrash`: the message is shown and the link's `href` is `/auth/login?return_to=%2Ftrash`.
- `error=` values `foo`, an empty value, `LOGIN_FAILED` and no `error` at all: no `role="alert"` on the page.
- `?error=login_failed&error=access_denied` shows the login-failed message (first value).
- `error=login_failed%00`, a 5,000-character `error` and `error[]=x` (the key is then `error[]`, not `error`): no alert.
- `error=access_denied&return_to=%2F%2Fevil.example`: the message is shown and the link returns to `/` (`loginHref('/', '')`).
- While the probe is pending, with `error=login_failed` in the address: only the "Checking your session…" status, and no alert.
- Signed in (`getSyncVersion` resolves) with `error=login_failed`: the page goes to `/` (or to `return_to`) with replace and no alert is ever shown.
- Probe fails with a `500`, a `429` and a network error, with `error=access_denied`: the card shows with the message.
- All the existing `LoginPage` and `LoginCard` tests still pass unchanged.

**Repo-wide**
- `make check` passes (including `make lint-css`).
- Nothing outside the allowed paths changed.

## Verifier checks

- Diff touches only the allowed paths; `package.json` and the lockfile are unchanged.
- Read `LoginCard`: the banner is rendered only when `error` is set, uses `Banner` with `tone="error"` and `role="alert"`, and the text comes from the single map in `loginError.ts`, not from literals duplicated in the component or the page.
- Read `LoginPage`: the message cannot appear while the probe is `checking` or when it is `signed-in`.
- Break each behavior and see its test fail, then revert: show the banner without `error`; make the match case-insensitive; swap the two messages; render the banner during `checking`; drop `role="alert"`; make the link ignore `return_to` (always `/`).
- Check by reading that the new CSS rule is scoped under `.login-card` and adds no colour of its own. The verifier cannot run a browser: say that the centred look was not seen.
- Inputs to try beyond the listed tests: `error=login_failed%20` (trailing space), a double-encoded value, `error=login_failed#x`.

## Stop and ask when

- The contract, a requirement, or this file conflict with each other, or `authCallback` does not describe the `/login?error=` redirect.
- You think you need a change outside your paths, a dependency, or an edit to a spec file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about, including that the centred banner was not seen in a browser. Also note every place you made a judgment call that this file did not settle.
