# Task: save a URL, front end

> Trial slice, front end. One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them. It is the front half of `docs/tasks/save-a-url.md`, which is already merged and working.

## Goal

A signed-in user can type a URL (and optionally a title), save it, and watch the page fetch finish. After a save the app opens that bookmark's page, which shows the fetch state (pending, ok or failed) and updates by itself until the fetch is done. This also lays the base the later screens reuse: the router, the API helper and the error handling.

Requirements covered: FR-3 (entering a URL in the app), FR-3a (a URL and an editable title; nothing is created until the user confirms), FR-4 (as the server reports it), FR-5a, FR-6, FR-21a (a trashed bookmark opens and says so), FR-23 (a duplicate is reported, with a link to the existing bookmark), NFR-13 (the client half: the CSRF header), NFR-17 (the cap message).

Out of scope, and the screens must not pretend otherwise: a folder picker, the bookmarklet and the popup behavior (FR-3b to FR-3d), the bookmark list, editing, deleting and restoring, search, sync polling, and the favicon image (`getFavicon` is still a 501 stub on the server, so show no icon). Who-am-I and the sign-in screen come later (see "Signed out").

## Role and ownership

Role: Frontend (see `AGENTS.md`).

You may change `frontend/**`. You may not change `backend/**`, `openapi.yaml`, `docs/**`, the Makefile, or `frontend/src/lib/api/schema.d.ts` (generated). The server is real for the two operations below, so nothing is mocked in the running app; tests mock at the API-wrapper boundary (see `TESTING.md`).

## Operations used

- `createBookmark` (`POST /api/v1/bookmarks`), body `CreateBookmarkRequest`: `url`, and `title` only when the user typed one. Never send `folder_id`.
- `getBookmark` (`GET /api/v1/bookmarks/{id}`), response `BookmarkDetail`.

Take every request and response type from `src/lib/api/schema.d.ts`. Do not write a second copy of any of them by hand.

## Behavior

### Routes

Add a router (see Dependencies). Two routes:

- `/`: the save page.
- `/bookmarks/:id`: the bookmark page.

An unknown path shows a short "not found" page with a link to `/`.

### API helper

In `src/lib/api/`:

- One function that makes a request to `/api/v1/...`, sends and expects JSON, and on a write (`POST`, `PATCH`, `DELETE`) adds `X-CSRF-Token` with the current value of the `csrf_token` cookie, read at call time (NFR-13). Cookies go with the request by default; do not set any other credentials option.
- A non-2xx response throws an `ApiError` carrying the HTTP status, the problem body when it is `application/problem+json` (its `code`, `detail`, `errors`, and for duplicates `existing_bookmark_id` and `in_trash`), and nothing else. A network failure throws an error that is clearly not an `ApiError`.
- Two thin wrappers, `createBookmark` and `getBookmark`, typed from the generated schema. Per `TESTING.md`, the wrappers themselves need no test; the helper's CSRF and error parsing do.

### The save page (`/`)

- A URL field and an optional title field, and a Save button. Enter in either field submits. The button is disabled while the URL is empty or a save is in flight, so one click cannot save twice.
- Opening the page creates nothing (FR-3a).
- On `201`, go to `/bookmarks/{id}`.
- Map the failures, each shown on the page next to the form, and keep what the user typed:
  - `422 invalid_url`: "Enter a full web address starting with http:// or https://" under the URL field.
  - `422 validation_error` with a `too_long` entry: say which field is too long and its limit (URL 2,048, title 300), under that field. Another code on a field is shown as a generic message under that field.
  - `409 duplicate_bookmark`: "You already saved this" with a link to `/bookmarks/{existing_bookmark_id}`; when `in_trash` is true, say it is in the trash.
  - `409 bookmark_limit_reached`: say the 1,000 bookmark limit is reached.
  - `429`: say to wait a moment and try again.
  - `401`: see "Signed out".
  - Anything else, including a network failure: a general "Couldn't save, try again" message.
- Keep the mapping from a failure to a message in one pure function with its own unit tests, not inside the component.

### The bookmark page (`/bookmarks/:id`)

- Shows the URL (as a link that opens in a new tab with `rel="noopener noreferrer"`), the title (or "Untitled" while it is empty), and the fetch state as text: "Fetching the page…" while `pending`, "Saved" when `ok`, "Couldn't fetch the page" when `failed` (the bookmark is still saved, FR-6). When `deleted_at` is set, also say "In the trash".
- When `content` is not null, show the first 500 characters of it, followed by "…" if it was longer. It is plain text: render it as a text node, never as HTML.
- Polling: while `fetch_status` is `pending`, refetch every 1 second for the first 30 seconds, then every 5 seconds. Stop as soon as the status is `ok` or `failed`, and stop on a `404` or a `401`. Polling also stops when the page is left. Use TanStack Query's `refetchInterval`, not a hand-written timer.
- `404`: "Bookmark not found" with a link to `/`. Anything else that fails: a short error with a retry button.
- A link back to `/` ("Save another").

### Signed out

There is no who-am-I endpoint yet. The app learns it is signed out only when a call returns `401`. On a `401` from either page, show "You're signed out." In a development build only (`import.meta.env.DEV`), add a link to `/auth/dev-login?name=alice&return_to=<the current path>`. Use a normal link (a full page load), not a router link. Nothing else about sign-in is built here.

### Structure

Follow the hook rule in `CONVENTIONS.md`: one hook per concern with a colocated test, written with it.

- `src/lib/api/` for the helper, `ApiError` and the two wrappers.
- A hook for the save (`useSaveBookmark` or similar): the mutation, and it returns a semantic result, not raw setters.
- A hook for reading a bookmark with the polling rule (`useBookmark`).
- The pure message mapping, and one for the content preview.
- Components for the two pages. Keep the markup plain: semantic elements and a small stylesheet. No UI library, no CSS framework; styling is undecided and not part of this task.
- Wire the router and TanStack Query's provider in `main.tsx`. Remove the health page from `App.tsx`; keep the `/healthz` proxy in `vite.config.ts` as it is.

## Dependencies

You may add `react-router` (one router; use its current stable release and state the version in your report). Nothing else. `package.json` and `package-lock.json` change only for that.

## Acceptance criteria

All of these must have a test, run by `npm test`. Use Vitest and Testing Library, mock at the wrapper boundary with value-return spies, and use fake timers for the polling.

**API helper**
- A `POST` sends `X-CSRF-Token` equal to the `csrf_token` cookie, and a `GET` does not.
- A `409` problem+json response becomes an `ApiError` with the status, `code`, and the duplicate fields.
- A response that is not problem+json becomes an `ApiError` with the status and no problem body. A network failure is not an `ApiError`.

**Messages (pure)**
- Each case in "The save page" maps to the message and field described, including `too_long` on the URL and on the title, and an unknown code on a field.
- The content preview cuts at 500 characters and adds "…" only when it cut.

**Save page**
- Enter submits; the button is disabled with an empty URL and while saving; an empty title is not sent.
- `201` navigates to the new bookmark's page.
- Each failure shows its message in the right place and keeps the typed values: `invalid_url`, `too_long`, duplicate (live and trashed, with the right link), limit, `429`, a generic error.
- A `401` shows the signed-out message. The sign-in link is present in a dev build and absent otherwise.

**Bookmark page**
- `pending`, `ok`, `failed` and trashed each show the right text. Content is shown as text: a content string containing `<b>x</b>` appears as that literal text.
- Polling: refetches every 1 s while pending, moves to 5 s after 30 s, and stops when the status becomes `ok` or `failed`, on a `404`, on a `401`, and after the page unmounts.
- `404` shows "Bookmark not found".

**Repo-wide**
- `make check` passes.
- No `any`, `@ts-ignore`, `@ts-expect-error` or `eslint-disable` (the one allowed exception in `CONVENTIONS.md` aside).
- Nothing under `backend/`, `docs/`, the Makefile or `openapi.yaml` changed.

## Verifier checks

Checks specific to this task, on top of the repo-wide ones in the verifier prompt. The verifier cannot run a browser, so these are by reading the code and the tests:

- Every request and response type comes from `schema.d.ts`; there are no hand-written copies of `BookmarkDetail`, `Problem` and the like.
- The CSRF value is read from the cookie at call time, and appears on every write the helper makes.
- Page content is never passed to `dangerouslySetInnerHTML` or anything that parses HTML. Links to a saved URL open with `noopener noreferrer`.
- Polling uses `refetchInterval`, there are no `setInterval` or `setTimeout` loops, and the interval function stops on every case listed above.
- Messages for each server error code match the codes in `openapi.yaml` (`invalid_url`, `validation_error` with `too_long`, `duplicate_bookmark`, `bookmark_limit_reached`).
- The favicon image is not rendered anywhere.
- Try to break it with: a URL of exactly 2,048 characters and a title of exactly 300; a duplicate whose `in_trash` is true; leaving the bookmark page while a poll is in flight; a `201` response with an empty title; two quick Enter presses.

## Stop and ask when

- The contract (`openapi.yaml`) or a requirement conflicts with this file, or with itself.
- You think you need a change to the backend or the contract, a dependency beyond the list above, or a UI library.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), the `react-router` version, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
