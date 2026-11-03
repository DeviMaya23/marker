# Plan: save popup and bookmark view (front end)

Branch: `claude/save-form-task-oy6ggs`. All paths under `frontend/src/`. Tests are colocated (`x.ts` + `x.test.ts(x)`).

Layout: `lib/api/` (helper, `ApiError`, wrappers), `features/save/` (failure mapping, `useSaveBookmark`, popup, add-by-URL form), `features/auth/` (login URL, signed-out message), `features/bookmark-detail/` (`useBookmark`, view, favicon, status chip), `pages/` (thin route entries), `styles/` (copied CSS).

## API helper
- [x] POST sends `X-CSRF-Token` = `csrf_token` cookie (read at call time); GET does not. — `lib/api/request.ts`, `request.test.ts` ("csrf header")
- [x] 409 problem+json becomes `ApiError` with status, `code`, `existing_bookmark_id`, `in_trash`; 429 carries `Retry-After` seconds. — `lib/api/request.ts`, `request.test.ts` ("problem body", "retry-after")
- [x] Non-problem response becomes `ApiError` with status and no problem; network failure is not an `ApiError`. — `lib/api/request.ts`, `request.test.ts` ("non-problem", "network failure")

## Failure mapping (pure)
- [x] Every row of the table, `too_long` on url and title, 429 with/without `Retry-After`, duplicate existing id. — `features/save/lib/saveFailure.ts`, `saveFailure.test.ts`

## Save popup
- [x] Save focused on open; Enter saves; Esc cancels; Enter/Esc on an alert dismiss it; nothing created on open; second Enter while saving does not save twice. — `features/save/components/SavePopup.tsx`, `SavePopup.test.tsx` (+ phases in `hooks/useSaveBookmark.ts`, `useSaveBookmark.test.ts`)
- [x] Title sent only when non-empty after trim; the typed title is sent. — `SavePopup.test.tsx`
- [x] Success shows "Saved", `window.close()` after 1 s, "close this tab" 350 ms after a close call; Cancel same without the delay. — `SavePopup.test.tsx` (fake timers)
- [x] Duplicate (live, trashed) and other failures stay open with the right message; dismissing keeps the typed title. — `SavePopup.test.tsx`
- [x] Missing or non-http `url` disables Save and shows the message. — `SavePopup.test.tsx`
- [x] 401 shows signed-out message; link carries encoded path and query; dev-login in dev, `/auth/login` otherwise. — `features/auth/lib/loginUrl.ts` (`loginUrl.test.ts`), `features/auth/components/SignedOut.tsx`, `SavePopup.test.tsx`

## Home page
- [x] Enter submits; button disabled when empty and while saving; success navigates to the bookmark page. — `features/save/components/AddByUrl.tsx`, `AddByUrl.test.tsx`
- [x] Each failure shows its message and keeps the input; duplicate links to the existing bookmark; 401 shows signed-out message. — `AddByUrl.test.tsx`

## Bookmark page
- [x] pending / ok / failed / trashed show the right text; trashed banner has no Restore; `<b>x</b>` content appears literally. — `features/bookmark-detail/components/BookmarkView.tsx`, `BookmarkView.test.tsx`
- [x] Favicon falls back to the tile when `favicon_url` is null and when the image errors. — `features/bookmark-detail/components/Favicon.tsx`, `Favicon.test.tsx`
- [x] Polling: 1 s while pending, 5 s after 30 s, stops on ok/failed, 404, 401, and after unmount. — `features/bookmark-detail/hooks/useBookmark.ts`, `useBookmark.test.tsx`
- [x] 404 shows "Bookmark not found". — `features/bookmark-detail/components/BookmarkView.test.tsx`

## Routing and base
- [x] Routes `/`, `/save`, `/bookmarks/:id`, others "Page not found" with a link to `/`; query provider and router wired in `main.tsx`; health page removed. — `App.tsx`, `App.test.tsx`
- [x] CSS copied (only rules used) to `styles/` and imported from `main.tsx`.

## Repo-wide
- [x] `make check` passes.
- [x] No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`; nothing outside `frontend/**` changed except this plan file; nothing copied from the reference except CSS.
- [x] Dependencies: `react-router` (task-allowed) and `@tanstack/react-query` (allowed by the user in this session; listed in `STACK.md`; already in the lockfile root).

## Judgment calls

Things the task file did not settle, and what I chose.

- **`@tanstack/react-query` added.** The task required it but only allowed `react-router`; the user approved adding it in this session. `react-router` is 8.5.1 (declarative `BrowserRouter` / `Routes`).
- **429 without `Retry-After`:** "Too many saves. Try again in a moment." (the table's "about a moment" reads badly). With the header: "…in about N seconds." A non-numeric `Retry-After` (an HTTP date) counts as missing.
- **`too_long` wording:** "The URL is too long (limit 2,048 characters)." / "The title is too long (limit 300 characters)."; if both fields are reported, both sentences are shown.
- **Trimming:** the title is sent trimmed; the home page URL is trimmed before sending. A prefilled popup title over 300 characters is not truncated (the server answers `too_long`); an over-long `url` parameter is also left to the server.
- **Keys in the popup** are handled on the document, so they work wherever focus is (including after the title is disabled while saving). Enter on the focused Cancel button is left to the button, so it cancels rather than saves.
- **Signed-out message** on the popup replaces the form; it needs no phase beyond `needs-login`. The link's return path comes from the router location.
- **Bookmark page:** `ok` with a null `content` shows "No text was saved for this page."; the trashed banner reads "In trash. This bookmark is read-only." (the reference's "Restore it…" part is dropped with the button); the 404 link reads "Back to home"; a transient poll failure while data is already shown keeps the data and keeps polling.
- **Departures from the reference** (this file wins): no folder fact, actions row, edit inputs, icons or app shell; the saved-popup delay is 1000 ms (reference 900); failure text comes from the fixed table, not the server's `detail`; no auth probe on open (`checking-auth` removed); the folder picker lists only "Top level" and is disabled; an untitled, non-pending bookmark shows "Untitled", not the host name.
- **Old scaffold CSS** (`src/index.css`) was removed: its variables clash with the copied tokens. Page layout rules are in `styles/pages.css`, written for this app.
- **Popup tests use `fireEvent`,** not user-event, because user-event hangs under Vitest fake timers. The other test files use user-event.
- **Not verified in a browser.** Nothing here ran against the Go server. FR-3c is the known gap (the popup learns it is signed out only when Save is pressed).
