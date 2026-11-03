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

- [ ] POST sends `X-CSRF-Token` equal to the `csrf_token` cookie; GET does not. File `lib/api/request.ts`, test "csrf header on writes only".
- [ ] 409 problem+json becomes `ApiError` with status, `code`, `existing_bookmark_id`, `in_trash`; 429 also carries `Retry-After`. File `lib/api/request.ts`, test "problem+json becomes ApiError".
- [ ] A non-problem error body becomes `ApiError` with status and no problem; a network failure is not an `ApiError`. File `lib/api/request.ts`, tests "non-problem error" and "network failure".
- [ ] Malformed `csrf_token` cookie does not throw before the request is sent. File `lib/api/request.ts`, test "bad percent-escape in cookie".

## Failure mapping (`lib/bookmarks/saveFailure.test.ts`)

- [ ] Every row of the table: duplicate live and trashed (with existing id), `invalid_url`, `too_long` on url and on title, `bookmark_limit_reached`, 429 with valid / missing / empty / negative / non-numeric `Retry-After`, 401, anything else and a network failure. File `lib/bookmarks/saveFailure.ts`. The empty and non-numeric header parsing is covered in `request.test.ts`.

## Save popup (`features/save/components/SavePopup.test.tsx`; hooks: `useWindowClose.test.tsx`, `lib/bookmarks/useSaveBookmark.test.tsx`)

- [ ] Save focused on open; Enter saves; Esc cancels; Enter and Esc on an alert dismiss it; nothing created on open; second Enter while saving saves once. File `SavePopup.tsx`.
- [ ] Title sent only when non-empty after trim; typed title is what is sent. File `SavePopup.tsx`.
- [ ] Success shows "Saved", `window.close()` after 1 s, "You can close this tab now." 350 ms after a close call; Cancel closes at once with the same fallback. Files `SavePopup.tsx`, `useWindowClose.ts`.
- [ ] Duplicate (live and trashed) and each other failure stay open with the right message; dismissing keeps the typed title. File `SavePopup.tsx`.
- [ ] Missing or non-http `url` disables Save and shows the message. File `SavePopup.tsx`.
- [ ] 401 shows the signed-out message; link carries the encoded path and query; dev-login in a dev build, `/auth/login` otherwise. Files `SignedOutMessage.tsx` (`components/ui/SignedOutMessage.test.tsx`), plus the popup test for the query string.

## Home page (`features/bookmark-list/components/AddUrlForm.test.tsx`)

- [ ] Enter submits; button disabled with an empty URL and while saving; success navigates to `/bookmarks/{id}`. File `AddUrlForm.tsx`.
- [ ] Each failure shows its message and keeps the input; duplicate links to the existing bookmark; 401 shows the signed-out message. File `AddUrlForm.tsx`.

## Bookmark page (`features/bookmark-detail/components/BookmarkView.test.tsx`, `hooks/useBookmark.test.tsx`)

- [ ] pending, ok, failed and trashed each show the right text; trashed banner has no Restore; content `<b>x</b>` appears literally. File `BookmarkView.tsx`.
- [ ] Favicon falls back to the tile when `favicon_url` is null and on image error. File `Favicon.tsx`, test `Favicon.test.tsx`.
- [ ] Polling: 1 s while pending, 5 s after 30 s, stops on ok / failed / 404 / 401 / unmount. File `useBookmark.ts`, test `useBookmark.test.tsx`.
- [ ] 404 shows "Bookmark not found". File `BookmarkView.tsx`.
- [ ] 401 or 404 on a later poll replaces the shown bookmark; another failure keeps the data and keeps polling. Files `BookmarkView.tsx`, `useBookmark.ts`.
- [ ] Empty title shows the host name; unparsable URL shows the whole URL. Files `hostOf.ts` (`hostOf.test.ts`), `BookmarkView.tsx`.

## Repo-wide

- [ ] `make check` passes.
- [ ] No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` (grep before the last commit).
- [ ] Nothing changed under `backend/`, `docs/` (other than this plan file, which the task requires), the Makefile or `openapi.yaml`; only CSS copied from the reference (grep and `git diff --stat`).

## Judgment calls

(filled in at the end)
