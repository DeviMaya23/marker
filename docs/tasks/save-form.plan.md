# Plan: save popup and bookmark view (front end)

Branch: `claude/save-form-task-oy6ggs`. All paths under `frontend/src/`. Tests are colocated (`x.ts` + `x.test.ts(x)`).

Layout: `lib/api/` (helper, `ApiError`, wrappers), `features/save/` (failure mapping, `useSaveBookmark`, popup, add-by-URL form), `features/auth/` (login URL, signed-out message), `features/bookmark-detail/` (`useBookmark`, view, favicon, status chip), `pages/` (thin route entries), `styles/` (copied CSS).

## API helper
- [ ] POST sends `X-CSRF-Token` = `csrf_token` cookie (read at call time); GET does not. — `lib/api/request.ts`, `request.test.ts` ("csrf header")
- [ ] 409 problem+json becomes `ApiError` with status, `code`, `existing_bookmark_id`, `in_trash`; 429 carries `Retry-After` seconds. — `lib/api/request.ts`, `request.test.ts` ("problem body", "retry-after")
- [ ] Non-problem response becomes `ApiError` with status and no problem; network failure is not an `ApiError`. — `lib/api/request.ts`, `request.test.ts` ("non-problem", "network failure")

## Failure mapping (pure)
- [ ] Every row of the table, `too_long` on url and title, 429 with/without `Retry-After`, duplicate existing id. — `features/save/lib/saveFailure.ts`, `saveFailure.test.ts`

## Save popup
- [ ] Save focused on open; Enter saves; Esc cancels; Enter/Esc on an alert dismiss it; nothing created on open; second Enter while saving does not save twice. — `features/save/components/SavePopup.tsx`, `SavePopup.test.tsx` (+ phases in `hooks/useSaveBookmark.ts`, `useSaveBookmark.test.ts`)
- [ ] Title sent only when non-empty after trim; the typed title is sent. — `SavePopup.test.tsx`
- [ ] Success shows "Saved", `window.close()` after 1 s, "close this tab" 350 ms after a close call; Cancel same without the delay. — `SavePopup.test.tsx` (fake timers)
- [ ] Duplicate (live, trashed) and other failures stay open with the right message; dismissing keeps the typed title. — `SavePopup.test.tsx`
- [ ] Missing or non-http `url` disables Save and shows the message. — `SavePopup.test.tsx`
- [ ] 401 shows signed-out message; link carries encoded path and query; dev-login in dev, `/auth/login` otherwise. — `features/auth/lib/loginUrl.ts` (`loginUrl.test.ts`), `features/auth/components/SignedOut.tsx`, `SavePopup.test.tsx`

## Home page
- [ ] Enter submits; button disabled when empty and while saving; success navigates to the bookmark page. — `features/save/components/AddByUrl.tsx`, `AddByUrl.test.tsx`
- [ ] Each failure shows its message and keeps the input; duplicate links to the existing bookmark; 401 shows signed-out message. — `AddByUrl.test.tsx`

## Bookmark page
- [ ] pending / ok / failed / trashed show the right text; trashed banner has no Restore; `<b>x</b>` content appears literally. — `features/bookmark-detail/components/BookmarkView.tsx`, `BookmarkView.test.tsx`
- [ ] Favicon falls back to the tile when `favicon_url` is null and when the image errors. — `features/bookmark-detail/components/Favicon.tsx`, `Favicon.test.tsx`
- [ ] Polling: 1 s while pending, 5 s after 30 s, stops on ok/failed, 404, 401, and after unmount. — `features/bookmark-detail/hooks/useBookmark.ts`, `useBookmark.test.tsx`
- [ ] 404 shows "Bookmark not found". — `features/bookmark-detail/components/BookmarkView.test.tsx`

## Routing and base
- [ ] Routes `/`, `/save`, `/bookmarks/:id`, others "Page not found" with a link to `/`; query provider and router wired in `main.tsx`; health page removed. — `App.tsx`, `App.test.tsx`
- [ ] CSS copied (only rules used) to `styles/` and imported from `main.tsx`.

## Repo-wide
- [ ] `make check` passes.
- [ ] No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`; nothing outside `frontend/**` changed except this plan file; nothing copied from the reference except CSS.
- [ ] Dependencies: `react-router` (task-allowed) and `@tanstack/react-query` (allowed by the user in this session; listed in `STACK.md`; already in the lockfile root).
