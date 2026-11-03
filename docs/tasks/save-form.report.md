# Verification report: save popup and bookmark view (front end)

Verifier branch: `claude/save-form-verify-hazuyg` (started from `claude/save-form-task-2bsd9k` at `ba0394b`).

**Verdict: no blocking findings.** `make check` passes (lint, TypeScript, openapi lint, 13 test files, 161 tests before my change; 162 after). Every acceptance criterion is met. Five non-blocking notes below.

I changed no source. I added one test row to `frontend/src/features/save/components/SavePopup.test.tsx` (URL of exactly 2,048 characters and a title of exactly 300). It passes.

Integration tests: none exist for this slice. It is frontend only, and no criterion depends on one. The server side of the save is covered by the already-merged `save-a-url` task.

Installed versions: `react-router` 8.5.1, `lucide-react` 1.67.0, `@tanstack/react-query` 5.105.3.

## 1. Acceptance criteria

"Real?" says whether the test would fail if the behavior were removed. All paths are under `frontend/src/`.

| # | Criterion | Test (file › name) | Real? | Status |
|---|---|---|---|---|
| A1 | POST sends `X-CSRF-Token`, GET does not (NFR-13) | `lib/api/request.test.ts` › "csrf header on writes only" (POST, PATCH/DELETE, GET, read at call time) | Yes: asserts the header value and its absence | Met |
| A2 | 409 problem+json becomes `ApiError` with status, `code`, duplicate fields; 429 carries `Retry-After` | `request.test.ts` › "problem+json becomes ApiError" (409, 429, `it.each` of header values) | Yes | Met |
| A3 | Non-problem body gives `ApiError` with no problem; network failure is not an `ApiError` | `request.test.ts` › "non-problem error", "network failure" | Yes | Met |
| A4 | Malformed `csrf_token` cookie does not throw before the send | `request.test.ts` › "bad percent-escape in cookie" | Yes: asserts fetch was called without the header | Met |
| F1 | Every row of the failure table (FR-24, NFR-16, NFR-17, FR-3) | `lib/bookmarks/saveFailure.test.ts` (all rows, `too_long` on url and title, 429 with valid, null and negative, existing id). Empty, date and fraction headers are parsed to null in `request.test.ts` | Yes | Met |
| P1 | Save focused; Enter saves; Esc cancels; Enter and Esc dismiss an alert; nothing created on open; double Enter saves once (FR-3a) | `SavePopup.test.tsx` › "opening and the keyboard" (focus, Enter, Esc, `it.each` alert keys, "saves once when Enter is pressed twice") | Yes | Met |
| P2 | Title sent only when non-empty after trim; typed title sent | › "what is sent" (`it.each` blank titles, typed title trimmed, no `folder_id`) | Yes | Met |
| P3 | "Saved", `close()` after 1 s, "close this tab" 350 ms later; Cancel same without delay (FR-3b) | › "closing" (fake timers, checks close not called at 999 ms) | Yes | Met |
| P4 | Duplicate live and trashed, other failures stay open; dismiss keeps title (FR-24) | › "failures stay open", "returns to the form with what was typed" | Yes | Met |
| P5 | Missing or non-http `url` disables Save and shows the message | › "a url that cannot be saved" (`it.each`, includes `javascript:`) | Yes | Met |
| P6 | 401 shows signed-out message; link carries encoded path and query; dev-login in dev, `/auth/login` otherwise | `SavePopup.test.tsx` › "signed out", `components/ui/SignedOutMessage.test.tsx` (both builds) | Yes | Met |
| H1 | Enter submits; button disabled when empty and while saving; success navigates | `features/bookmark-list/components/AddUrlForm.test.tsx` › "submitting" | Yes | Met |
| H2 | Failures show message and keep input; duplicate links; 401 signed-out | › "failures" | Yes | Met |
| B1 | pending, ok, failed, trashed texts; no Restore; `<b>x</b>` literal (FR-5a, FR-6, FR-21a) | `features/bookmark-detail/components/BookmarkView.test.tsx` › "fetch states", "content is text" | Yes. Line breaks rest on the `pre-wrap` CSS rule, which jsdom cannot check; I confirmed the rule exists (`styles/layout.css`, `.detail-page__content-body`) | Met |
| B2 | Favicon falls back to the tile on null and on image error | `Favicon.test.tsx` | Yes | Met |
| B3 | Polling: 1 s, 5 s after 30 s, stops on ok, failed, 404, 401, unmount | `hooks/useBookmark.test.tsx` (each case, plus unmount with a poll in flight) | Yes, fake timers and call counts | Met |
| B4 | 404 shows "Bookmark not found" | `BookmarkView.test.tsx` › "errors" | Yes | Met |
| B5 | Later 401 or 404 replaces the data; another failure keeps data and polls | `BookmarkView.test.tsx` › "later polls"; `useBookmark.test.tsx` | Yes | Met |
| B6 | Empty title shows host; unparsable URL shows whole URL | `BookmarkView.test.tsx` › "title"; `lib/hostOf.test.ts` | Yes | Met |
| R1 | `make check` passes | Ran it: exit 0 | n/a | Met |
| R2 | No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` | grep over `src/` (only the word "any" in test names) | n/a | Met |
| R3 | Nothing under `backend/`, Makefile, `openapi.yaml`, `docs/` changed; only CSS copied | `git diff --stat`: only `docs/tasks/save-form.plan.md` under `docs/` (see N4); the one near-copy is N2 | n/a | Met, with N2 and N4 |

## 2. Plan check (`docs/tasks/save-form.plan.md`)

- Every acceptance criterion in the task file has a plan item. None is missing.
- Every ticked item has a test and the test checks the behavior (table above).
- Differences between plan and diff: none found. File layout, the 15 judgment calls and the dependency list match the diff. Judgment call 11 (the 30 s window starts at mount) matches `useBookmark.ts`.
- The plan's judgment call 14 admits it wrote under `docs/`, which the task's ownership section forbids. See N4.

## 3. Rule checks

- **Only `handler/` imports `internal/api`; repository queries filter by `user_id`; `users.version` incremented in writes:** not applicable. The diff touches no backend file.
- **`go.mod` go/toolchain unchanged:** `go 1.26.0`, no toolchain line, and `go.mod` is not in the diff.
- **Dependencies:** `package.json` gains only `@tanstack/react-query`, `lucide-react` and `react-router`. The lockfile also adds `@remix-run/route-pattern` and `cookie-es` (react-router's own dependencies) and bumps the already-present `@tanstack/query-core` and `react-query` from 5.105.0 to 5.105.3.
- **Types from `schema.d.ts`:** `ApiError.ts` and `bookmarks.ts` build every type from `components['schemas']`. No hand-written `BookmarkDetail` or `Problem`.
- **CSRF at call time on every write:** `readCsrfToken()` runs inside `apiRequest` for each POST, PATCH and DELETE.
- **No HTML rendering of content:** no `dangerouslySetInnerHTML` or `innerHTML`. Content, title and note render as text nodes. Both saved-URL links use `target="_blank" rel="noopener noreferrer"`.
- **Polling:** `refetchInterval` only, no `setInterval`. The function returns false for 401 and 404 and when status is not pending. A later 401 or 404 is checked in `BookmarkView` before the data, so it is shown.
- **Popup against brief screen 5:** Enter and Esc, Save focus, URL read-only, 1 s "Saved", 350 ms fallback, duplicate wording with no restore or link, errors stay open until dismissed. All match.
- **Login return link:** `encodeURIComponent(pathname + search)`, so the popup's `url` and `title` are kept.
- **Hooks:** one hook per concern, each with a colocated test (`useSaveBookmark`, `useWindowClose`, `useBookmark`).
- **Known gap (FR-3c):** present as the task describes. The popup learns it is signed out only when Save is pressed. No probing call was added.
- **Break attempts, by reading the code and running new cases:**
  - Bad percent-escape in the cookie: sends the request without the header.
  - `Retry-After` of `-5`, empty, an HTTP date, `1.5`: all give the "in a moment" message.
  - URL of exactly 2,048 and 2,049 characters: both sent as given, the server decides (new test row).
  - Title of exactly 300: kept and sent. 301 in the prefill is cut to 300.
  - Trashed duplicate: "This link is in your trash."
  - `&` and `#` in `url`: sent intact when encoded.
  - `javascript:` URL: Save disabled with the message.
  - Leaving the page during a poll: tested and stops.
  - Two quick Enters: one request.

## 4. Findings

### Blocking

None.

### Non-blocking

- **N1. Unused CSS rules carried over.** The task says to copy only the rules these screens use. Nothing in the app uses `.banner--warning` (the type allows it), `.btn--block`, `.field__meta`, `.textarea`, `.account-page`, `.list-sentinel` or `.save-popup__loading`. Reproduce: for each class in `styles/components.css` and `styles/layout.css`, grep `src/**/*.tsx`.
- **N2. `Favicon.tsx` stays very close to the reference `Favicon.tsx`.** It has the same markup, class names and fallback, and differs in the broken-image state and the `data-testid`. It is not a verbatim copy and the behavior is dictated by the task, so I did not call it a breach of "nothing copied except CSS". The user may want to judge it.
- **N3. Huge `Retry-After` is shown as is.** A header of `99999999999999999999` gives "Try again in about 100000000000000000000 seconds." The task's table allows any whole number of zero or more, so this follows the spec. Only an odd server would send it.
- **N4. The plan file sits under `docs/`**, which the Frontend role may not change. The session instructions asked for it, so I treat it as accepted. The same applies to this report.
- **N5. `readCsrfToken` stops at the first `csrf_token` cookie.** If two cookies with that name exist and the first is malformed, the valid second one is ignored and the header is left off. This needs duplicate cookies from different paths, so it is hypothetical.
