# Plan: save popup and bookmark view (front end)

Branch: `claude/save-form-task-2bsd9k`. Paths are under `frontend/src/`. Tick an item when its test passes.

Layout (per `ARCHITECTURE.md`): shared logic in `lib/`, shared pieces used by more than one page in `components/ui/`, feature code in `features/<feature>/`, thin route entries in `pages/`. Features never import each other.

- `lib/api/`: `ApiError.ts`, `request.ts`, `bookmarks.ts` (the two wrappers)
- `lib/bookmarks/`: `saveFailure.ts`, `useSaveBookmark.ts` (shared by popup and home)
- `components/ui/`: `Banner.tsx`, `SignedOutMessage.tsx`
- `features/save/`: `components/SavePopup.tsx`, `hooks/useWindowClose.ts`
- `features/bookmark-list/`: `components/AddUrlForm.tsx` (home stand-in)
- `features/bookmark-detail/`: `components/BookmarkView.tsx`, `Favicon.tsx`, `FetchStatusChip.tsx`, `hooks/useBookmark.ts`, `lib/hostOf.ts`
- `pages/`: `HomePage`, `SavePage`, `BookmarkPage`, `NotFoundPage`; `App.tsx` holds the routes; `main.tsx` wires the router and the query provider

## API helper (`lib/api/request.test.ts`)

- [x] POST sends `X-CSRF-Token` equal to the `csrf_token` cookie; GET does not. File `lib/api/request.ts`, test "csrf header on writes only".
- [x] 409 problem+json becomes `ApiError` with status, `code`, `existing_bookmark_id`, `in_trash`; 429 also carries `Retry-After`. File `lib/api/request.ts`, test "problem+json becomes ApiError".
- [x] A non-problem error body becomes `ApiError` with status and no problem; a network failure is not an `ApiError`. File `lib/api/request.ts`, tests "non-problem error" and "network failure".
- [x] Malformed `csrf_token` cookie does not throw before the request is sent. File `lib/api/request.ts`, test "bad percent-escape in cookie".

## Failure mapping (`lib/bookmarks/saveFailure.test.ts`)

- [x] Every row of the table: duplicate live and trashed (with existing id), `invalid_url`, `too_long` on url and on title, `bookmark_limit_reached`, 429 with valid / missing / empty / negative / non-numeric `Retry-After`, 401, anything else and a network failure. File `lib/bookmarks/saveFailure.ts`. The empty and non-numeric header parsing is covered in `request.test.ts`.

## Save popup (`features/save/components/SavePopup.test.tsx`; hooks: `useWindowClose.test.tsx`, `lib/bookmarks/useSaveBookmark.test.tsx`)

- [x] Save focused on open; Enter saves; Esc cancels; Enter and Esc on an alert dismiss it; nothing created on open; second Enter while saving saves once. File `SavePopup.tsx`.
- [x] Title sent only when non-empty after trim; typed title is what is sent. File `SavePopup.tsx`.
- [x] Success shows "Saved", `window.close()` after 1 s, "You can close this tab now." 350 ms after a close call; Cancel closes at once with the same fallback. Files `SavePopup.tsx`, `useWindowClose.ts`.
- [x] Duplicate (live and trashed) and each other failure stay open with the right message; dismissing keeps the typed title. File `SavePopup.tsx`.
- [x] Missing or non-http `url` disables Save and shows the message. File `SavePopup.tsx`.
- [x] 401 shows the signed-out message; link carries the encoded path and query; dev-login in a dev build, `/auth/login` otherwise. Files `SignedOutMessage.tsx` (`components/ui/SignedOutMessage.test.tsx`), plus the popup test for the query string.

## Home page (`features/bookmark-list/components/AddUrlForm.test.tsx`)

- [x] Enter submits; button disabled with an empty URL and while saving; success navigates to `/bookmarks/{id}`. File `AddUrlForm.tsx`.
- [x] Each failure shows its message and keeps the input; duplicate links to the existing bookmark; 401 shows the signed-out message. File `AddUrlForm.tsx`.

## Bookmark page (`features/bookmark-detail/components/BookmarkView.test.tsx`, `hooks/useBookmark.test.tsx`)

- [x] pending, ok, failed and trashed each show the right text; trashed banner has no Restore; content `<b>x</b>` appears literally. File `BookmarkView.tsx`.
- [x] Favicon falls back to the tile when `favicon_url` is null and on image error. File `Favicon.tsx`, test `Favicon.test.tsx`.
- [x] Polling: 1 s while pending, 5 s after 30 s, stops on ok / failed / 404 / 401 / unmount. File `useBookmark.ts`, test `useBookmark.test.tsx`.
- [x] 404 shows "Bookmark not found". File `BookmarkView.tsx`.
- [x] 401 or 404 on a later poll replaces the shown bookmark; another failure keeps the data and keeps polling. Files `BookmarkView.tsx`, `useBookmark.ts`.
- [x] Empty title shows the host name; unparsable URL shows the whole URL. Files `hostOf.ts` (`hostOf.test.ts`), `BookmarkView.tsx`.

## Repo-wide

- [x] `make check` passes.
- [x] No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` (grep before the last commit).
- [x] Nothing changed under `backend/`, `docs/` (other than this plan file, which the task requires), the Makefile or `openapi.yaml`; only CSS copied from the reference (grep and `git diff --stat`).

## Judgment calls

Things the task file did not settle, and what I did:

1. **Where files live.** The task named no paths. Shared logic is in `lib/` (`lib/bookmarks/` holds the failure mapping and the save hook, which the popup and the home page both use). `Banner`, `SignedOutMessage` and `StatePanel` are in `components/ui/` because more than one page uses them. `Favicon` and the status chip stay in `features/bookmark-detail/`, since only that page uses them. The task asks for these pieces, so I did not treat them as new abstractions that need approval.
2. **The `ApiError` problem type** is built from the generated `Problem`, `DuplicateBookmarkProblem` and `ValidationProblem` types, not written out by hand. It carries `retryAfter` as a plain number or `null`.
3. **Retry-After parsing.** Only a whole number (negative allowed) is read; empty, an HTTP date, a fraction and `0x10` all become `null`. The failure mapping then treats a negative value like a missing one.
4. **Wording not in the table.** The `too_long` messages are "That URL is too long. The limit is 2,048 characters." and "That title is too long. The limit is 300 characters." If both fields are too long, the URL message wins. A `validation_error` without `too_long` on `url` or `title` gets the generic message. A 409 or 422 with any other code also gets the generic message.
5. **Failure kinds.** The mapping returns a `kind` (`signed-out`, `duplicate`, `invalid-input`, `error`). The home page uses it to put `invalid_url` and `too_long` under the field and the rest in a banner beside it.
6. **Popup keyboard.** Enter and Esc are handled on `document`, not on the popup's div, so they still work after an alert is dismissed and focus returns to the page. Save is re-focused when the form comes back. Enter on the Cancel button presses Cancel, not Save. Esc and Enter do nothing while a save is in flight, and Esc closes the popup from the signed-out state.
7. **Prefilled title.** A `title` parameter longer than 300 characters is cut to 300 so the field is valid when it opens. A `url` parameter is trimmed. Neither is checked against 2,048 on the client: the server answers `too_long` and the popup shows it.
8. **Signed-out popup.** The form is replaced by the message and a Cancel button.
9. **Home page.** A URL of only spaces counts as empty. The URL is trimmed before it is sent. The input is read-only, not disabled, while saving, so focus is not lost. Editing the field clears an error message. A duplicate with no `existing_bookmark_id` shows the message without the "Open it" link.
10. **Bookmark page.** A title of only spaces counts as empty. "Host name" means `URL.hostname`, so no port. A note that is an empty string still shows the Note section (only `null` hides it). I kept the reference's second "open original link" icon next to the URL link; both have `rel="noopener noreferrer"`. The saved URL is used as an `href` as the server returns it; the server only stores http and https links.
11. **Polling clock.** The 30-second fast window starts when the page mounts (a ref set in an effect), not at the first response. `refetchInterval` is re-evaluated after each fetch, so the switch to 5 s happens at the first fetch at or after 30 s. With no bookmark loaded (first load failed) it does not poll; the retry button loads it again. Query retries are off so a 401 or 404 shows at once. TanStack Query's default refetch-on-window-focus is left on.
12. **Tests set `notifyManager.setScheduler` to a microtask** in the two files that count poll timings, because by default TanStack Query delivers results on a 0 ms timer that shifts the fake clock. It is restored after each test.
13. **CSS.** `tokens.css` and `base.css` were copied whole; `components.css` and `layout.css` only with the rules these screens use. `styles/app.css` is mine (home page, page container, note text). I deleted the Vite template's `src/index.css`, which would clash with `base.css`.
14. **The plan file is under `docs/`**, which the task says the agent may not change. The session instructions asked for it, so it is the only file I touched there.
15. **Extra tests** beyond the criteria: `useSaveBookmark`, `useWindowClose`, `isHttpUrl`, `hostOf`, `StatePanel`-free route tests in `App.test.tsx`.
