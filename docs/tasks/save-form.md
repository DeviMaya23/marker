# Task: save popup and bookmark view (front end)

> Trial slice, front end. One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them. It is the front half of `docs/tasks/save-a-url.md`, which is already merged and working. (The file is still called `save-form.md`; the slug for the scripts is `save-form`.)

## Goal

A signed-in user can save a URL in two ways, and then see the bookmark and watch its page fetch finish:

1. **The save popup** (`/save?url=…&title=…`), the small window the bookmarklet opens (brief screen 5).
2. **A paste-a-URL field** on a temporary home page (`/`), standing in for the add field in the real top bar until the list screen exists.

Both end at a read-only **bookmark page** (`/bookmarks/:id`, a part of brief screen 3) that shows the fetch state and polls until it is done. The slice also lays the base the later screens reuse: the router, the API helper, error handling and the styles.

Requirements covered: FR-3 (entering a URL; the bookmarklet's popup), FR-3a, FR-3b, FR-3c (see "Known gap"), FR-3d (the popup's title is sent), FR-4 (as the server reports it), FR-5a, FR-6, FR-21a (a trashed bookmark opens and says so), FR-24 (duplicate wording), NFR-13 (the client half: the CSRF header), NFR-17 (the cap message), NFR-16 (the rate-limit message).

## The design

The design for these screens already exists. Read, in `docs/design/ui-reference/` (read-only reference, not code to copy):

- `ui-design-brief.md`: the screens, states and copy the design was made from. Screens 3 and 5 are yours.
- `DECISIONS.md`: judgment calls and the glossary of screen and state names. Use its names.
- `src/pages/SavePopupPage.tsx`, `src/pages/BookmarkDetailPage.tsx`, `src/components/{Favicon,States,LibraryTopBar,BookmarkRow}.tsx`: the behavior and markup to reproduce.
- `src/styles/*.css`: the look.

How to use it:

- **Reproduce the look and behavior** with your own code, in this repo's stack and conventions. The reference is a prototype with a mock API; its code does not meet `CONVENTIONS.md` (hand-rolled hooks and router, `eslint-disable`, no tests).
- **Do copy the CSS you need.** Carry `tokens.css` and `base.css` across, and from `components.css` and `layout.css` only the rules these screens use (buttons, inputs, banners, status chips, favicon, popup, detail page). Put them under `frontend/src/styles/` and import them from `main.tsx`. Keep the class names so the reference stays comparable.
- **Do not copy** any `.tsx` or `.ts` file, and do not use its mock API, its hooks, its router or its toast. Icons come from `lucide-react`, not from the reference's `react-icons`.
- Where this file and the reference disagree, this file wins. Say so in your report.

## Role and ownership

Role: Frontend (see `AGENTS.md`).

You may change `frontend/**`. You may not change `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/save-form.plan.md`, see `AGENTS.md`), the Makefile, or `frontend/src/lib/api/schema.d.ts` (generated). Dev server: `http://localhost:5175` (see `vite.config.ts`); the Go server must be running for the app to work, and tests never need it.

## Operations used

- `createBookmark` (`POST /api/v1/bookmarks`), body `CreateBookmarkRequest`: `url`, and `title` only when it is non-empty after trimming. Never send `folder_id`.
- `getBookmark` (`GET /api/v1/bookmarks/{id}`), response `BookmarkDetail`.

Take every request and response type from `src/lib/api/schema.d.ts`. Do not write a second copy of any of them by hand. Every other operation is still a 501 stub on the server; do not call it.

## Behavior

### Routes (browser history)

Add a router (see Dependencies) using browser history, not hash routes. Routes: `/` (home), `/save` (popup), `/bookmarks/:id`. Any other path shows a short "Page not found" page with a link to `/`.

### API helper

In `src/lib/api/`:

- One function that makes a request to `/api/v1/...`, sends and expects JSON, and on a write (`POST`, `PATCH`, `DELETE`) adds `X-CSRF-Token` with the current value of the `csrf_token` cookie, read at call time (NFR-13). A cookie value that cannot be decoded counts as missing: reading it never throws, and the request is still sent. Do not set a credentials option.
- A non-2xx response throws an `ApiError` carrying the HTTP status, the problem body when it is `application/problem+json` (`code`, `detail`, `errors`, and for duplicates `existing_bookmark_id` and `in_trash`), and for a `429` the `Retry-After` header as a number of seconds. A network failure throws an error that is clearly not an `ApiError`.
- Two thin wrappers, `createBookmark` and `getBookmark`, typed from the generated schema. Per `TESTING.md` they need no test; the helper's CSRF and error parsing do.

### Save failures (shared)

One pure function maps a failure from `createBookmark` to what the screen shows. Both save screens use it, and it has its own unit tests:

| Failure | Message |
|---|---|
| `409 duplicate_bookmark`, `in_trash` false | "This link is already saved." |
| `409 duplicate_bookmark`, `in_trash` true | "This link is in your trash." |
| `422 invalid_url` | "Only http and https links can be saved." |
| `422 validation_error` with `too_long` on `url` or `title` | which field is too long and its limit (URL 2,048, title 300) |
| `409 bookmark_limit_reached` | "You're at the 1,000 bookmark limit. Empty the trash or delete some bookmarks first." |
| `429` | "Too many saves. Try again in about N seconds." when `Retry-After` is a whole number of seconds, zero or more; otherwise "Too many saves. Try again in a moment." A missing, empty, negative or non-numeric header (an HTTP date, say) counts as missing. |
| `401` | not a message: the screen shows the signed-out state (below) |
| anything else, including a network failure | "Couldn't save that link." |

The function also returns, for a duplicate, the existing bookmark's id, so the home page can link to it.

### The save popup (`/save`)

Behavior and copy follow brief screen 5 and `SavePopupPage.tsx`:

- No app chrome; the layout is the small window (about 460 px wide).
- The URL comes from the `url` query parameter and is shown read-only. The title field is prefilled from the `title` parameter and editable (max 300). The folder picker shows only "Top level" and is disabled, because `listFolders` is not implemented yet. Cancel and Save buttons. Save has focus when the popup opens.
- If `url` is missing or is not an `http` or `https` URL, show "Only http and https links can be saved." and disable Save.
- Opening the popup creates nothing (FR-3a). Enter saves; Esc cancels. Esc and Enter on an alert dismiss it instead. While saving, the fields and buttons are disabled so one key press cannot save twice.
- Success: show "Saved" for 1 second, then call `window.close()`. If this code is still running 350 ms later (the browser did not allow closing), show "You can close this tab now." (FR-3b)
- Cancel: call `window.close()` at once, with the same 350 ms fallback.
- Duplicate: stay open with an info alert, whose text comes from the table above, and nothing else (no restore, no link). Any other failure: stay open with an error alert. OK, Enter or Esc dismisses the alert and returns to the form with what was typed.
- Phases are named as in `DECISIONS.md`, minus `checking-auth` (see "Signed out").

### The home page (`/`)

A page with the app name, one short sentence, and the paste-a-URL field: a URL input and a Save button. Enter submits. The button is disabled while the URL is empty or a save is in flight. On `201`, go to `/bookmarks/{id}`. On failure show the message from the table next to the field, keep what was typed, and for a duplicate link to `/bookmarks/{existing id}` ("Open it"). On `422 invalid_url` or `too_long`, put the message under the field. This is a stand-in: keep it plain.

### The bookmark page (`/bookmarks/:id`)

Follow `BookmarkDetailPage.tsx` for layout, minus everything that edits:

- A back link to `/`. The favicon (see below), the title as plain text (while it is empty, the URL's host name instead, as the brief asks: `www.example.com` for `https://www.example.com/a`, or the whole URL if it cannot be parsed), and the URL as a link opening in a new tab with `rel="noopener noreferrer"`.
- Facts: the saved date and the fetch status chip (pending, complete, failed). Leave out the folder fact and the actions row.
- The note, as read-only text, only when it is not null.
- "Page text": a placeholder explaining why while `pending`, another when `failed` (the link still works, FR-6), and the text itself when `ok`, rendered as a plain text node with its line breaks kept (`white-space: pre-wrap`), in the reading layout from the reference. Never as HTML.
- When `deleted_at` is set, the "In trash" banner from the reference, read-only, **without** the Restore button (restore is not built yet) (FR-21a).
- Polling: while `fetch_status` is `pending`, refetch every 1 second for the first 30 seconds, then every 5 seconds. Stop as soon as the status is `ok` or `failed`, and on a `404` or `401`. A `401` or `404` on a later poll replaces what is on screen with the signed-out message or "Bookmark not found", even when the bookmark is already shown. Any other failure on a later poll keeps the shown data and keeps polling. Polling also stops when the page is left. Use TanStack Query's `refetchInterval`, not a hand-written timer.
- `404`: "Bookmark not found" with a link to `/`. Any other failure: the reference's error state with a retry button.
- **The favicon** is the reference's `Favicon` behavior: an image from `favicon_url`, or a lettered tile when there is none or the image fails to load. The favicon endpoint is still a 501 stub, so the tile is what you will see; that is expected.

### Signed out

There is no who-am-I endpoint yet, so the app learns it is signed out only when a call returns `401`. On a `401` from any of the three screens, show "You're logged out. Log in to continue." with a link. The link is a normal anchor (a full page load, not a router link) to `/auth/dev-login?name=alice&return_to=<current path and query, URL-encoded>` in a development build (`import.meta.env.DEV`), and to `/auth/login?return_to=<same>` otherwise (that route is not implemented yet either). The return value keeps the popup's `url` and `title` parameters.

**Known gap:** FR-3c says the popup should send a logged-out user to login as soon as it opens. Without who-am-I, the popup learns this only when the user presses Save. Do not work around it (no probing calls). The report lists it.

### Structure

Follow the hook rule in `CONVENTIONS.md`: one hook per concern with a colocated test, written with it.

- `src/lib/api/`: the helper, `ApiError`, the two wrappers.
- A hook for the save (phases, the call, the mapped result), used by both save screens; `useBookmark(id)` for reading with the polling rule.
- The pure failure-mapping function.
- Components for the three pages and the shared pieces (`Favicon`, the status chip, banners, the signed-out message). Plain semantic markup and no UI library. Where the reference has an icon, use the matching icon from `lucide-react` (bookmark, check, external link, clock, alert, arrow left). Icons are decorative: hide them from assistive technology (`aria-hidden`) and keep any button's accessible name as text or `aria-label`.
- Wire the router and TanStack Query's provider in `main.tsx`. Remove the health page from `App.tsx`; leave the proxy in `vite.config.ts` as it is.

## Dependencies

You may add `@tanstack/react-query` (data fetching in `STACK.md`; the polling uses its `refetchInterval`), `react-router` (one router) and `lucide-react` (the only icon library; do not add `react-icons` or any other). Use the current stable release of each and state the versions in your report. Nothing else. `package.json` and `package-lock.json` change only for those three.

## Acceptance criteria

All of these must have a test, run by `npm test`. Use Vitest and Testing Library, mock at the wrapper boundary with value-return spies, and use fake timers for the delays and the polling.

**API helper**
- A `POST` sends `X-CSRF-Token` equal to the `csrf_token` cookie, and a `GET` does not.
- A `409` problem+json response becomes an `ApiError` with the status, `code` and the duplicate fields; a `429` also carries `Retry-After`.
- A response that is not problem+json becomes an `ApiError` with the status and no problem body. A network failure is not an `ApiError`.
- A malformed `csrf_token` cookie does not make the call throw before the request is sent.

**Failure mapping (pure)**
- Every row of the table, including `too_long` on the URL and on the title, a `429` with a valid `Retry-After` and with a missing, empty, negative and non-numeric one, and the duplicate's existing id.

**Save popup**
- Save has focus on open; Enter saves; Esc cancels; Enter and Esc on an alert dismiss it; nothing is created on open; a second Enter while saving does not save twice.
- The title is sent only when non-empty after trimming, and the typed title (not only the prefilled one) is what is sent.
- Success shows "Saved", then calls `window.close()` after 1 second; if the timer still runs 350 ms after a close call, the "close this tab" message appears. Cancel does the same without the delay.
- Duplicate (live and trashed) and each other failure stay open with the right message; dismissing keeps the typed title.
- A missing or non-http `url` disables Save and shows the message.
- A `401` shows the signed-out message; its link carries the encoded path and query, and it points at dev-login in a dev build and at `/auth/login` otherwise.

**Home page**
- Enter submits; the button is disabled with an empty URL and while saving; success navigates to the new bookmark's page.
- Each failure shows its message and keeps the input; a duplicate links to the existing bookmark; a `401` shows the signed-out message.

**Bookmark page**
- `pending`, `ok`, `failed` and trashed each show the right text; the trashed banner has no Restore button. Content is shown as text: a content string containing `<b>x</b>` appears literally.
- The favicon falls back to the tile when `favicon_url` is null and when the image errors.
- Polling: refetches every 1 s while pending, moves to 5 s after 30 s, and stops when the status becomes `ok` or `failed`, on a `404`, on a `401`, and after the page unmounts.
- `404` shows "Bookmark not found".
- A `401` or `404` on a later poll, after the bookmark is on screen, replaces it with the signed-out message or "Bookmark not found"; another failure on a later poll keeps the data and keeps polling.
- An empty title shows the URL's host name; an empty title with a URL that cannot be parsed shows the whole URL.

**Repo-wide**
- `make check` passes.
- No `any`, `@ts-ignore`, `@ts-expect-error` or `eslint-disable`.
- Nothing under `backend/`, `docs/`, the Makefile or `openapi.yaml` changed, and nothing copied from the reference except CSS.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt. The verifier cannot run a browser, so these are by reading the code and the tests:

- Every request and response type comes from `schema.d.ts`; there are no hand-written copies of `BookmarkDetail`, `Problem` and the like.
- No `.ts` or `.tsx` file is a copy of a reference file (compare against `docs/design/ui-reference/src`); only CSS carries over, and only rules these screens use.
- The CSRF value is read from the cookie at call time and appears on every write the helper makes.
- Page content is never passed to `dangerouslySetInnerHTML` or anything that parses HTML. Links to a saved URL open with `noopener noreferrer`.
- Polling uses `refetchInterval`, there are no `setInterval` loops, and the interval function stops in every case listed. A 401 or 404 that arrives after data is on screen is shown, not swallowed.
- The popup's behavior matches brief screen 5 line by line (keyboard, 1 s "Saved", the 350 ms fallback, duplicate wording, errors stay open).
- The return link for login keeps the popup's query string, properly encoded.
- Try to break it with: a `csrf_token` cookie with a bad percent-escape; a `Retry-After` of `-5`, empty, and an HTTP date; a `url` parameter of exactly 2,048 characters and one of 2,049; a title of exactly 300; a trashed duplicate; a `url` with `&` or `#` in it; a `javascript:` URL in the `url` parameter; leaving the bookmark page while a poll is in flight; two quick Enter presses.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, the design brief or this file conflict with each other.
- You think you need a change to the backend or the contract, a dependency beyond the list above, or a UI library.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), the `react-router` and `lucide-react` versions, any place you departed from the reference design and why, the known gap, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
