# Plan: detail-inline-edit

Branch: `claude/detail-inline-edit-lulnlj`. Paths below are under `frontend/src/`.
`BV` = `features/bookmark-detail/components/BookmarkView.test.tsx`.
Backend untouched, so `make test-integration-local` is not required: not run: no backend change.

## Acceptance criteria

### Live page: what is shown
- [ ] Title input, Note textarea, null/'' note placeholder, h1 contains input — `EditableTitle.tsx`, `EditableNote.tsx`, `BookmarkView.tsx`; tests in `BV` ("inline fields")
- [ ] Empty/space title → host placeholder; unparseable URL → whole URL — `EditableTitle.tsx`; `BV`
- [ ] Markup in title/note is value text — `BV`
- [ ] Trashed view read-only (heading text, note only when not null, '' note shows section) — `BookmarkView.tsx`; existing trashed tests in `BV`
- [ ] Counters (note `n/500` always; title `n/300` on focus/over; `field__meta--over`) — `EditableTitle.tsx`, `EditableNote.tsx`; `BV`

### Committing
- [ ] Title blur / Enter sends `{title}` once, new title shown, no "Saved." toast — `useInlineField.ts`, `useEditBookmark.ts`; `BV`
- [ ] `  Hello ` over `Hello` → no request, shows `Hello` — `editChanges.ts` helper, `useInlineField.ts`; `BV`
- [ ] Note commit rules (blur sends, Enter newline, clear → null, spaces → null, null+empty none) — `BV`
- [ ] One field per call; two fields → two calls — `BV`
- [ ] Boundaries 300/301, 500/501, emoji; over-limit messages, text kept, message clears — `useInlineField.ts`; `BV`
- [ ] Second blur while in flight sends nothing; other field still sends — `BV`

### Status and the old value
- [ ] `Saving…`/`Saved` per field, 2s, `clearTimeout` on unmount — `useInlineField.ts`; `BV`, `useInlineField.test.tsx`
- [ ] Saved text shown while `getBookmark` held back; refreshed value after — `useInlineField.ts`; `BV`

### Refetch while editing
- [ ] Untouched follows poll; touched keeps text and error — `BV`
- [ ] Title save refetch doesn't replace note text — `BV`
- [ ] Focus stays across refetch — `BV`

### Esc and failures
- [ ] Esc restores baseline, clears error, no request; Esc then blur none; Esc during save — `BV`, `useInlineField.test.tsx`
- [ ] Typing after the committing blur keeps later text; stored value typed back after save is sent — `BV`
- [ ] Enter then blur with pending first save → one request — `BV`
- [ ] Failure table rows (under right field, text kept, retry; 401 silent; 429; network) — `BV`
- [ ] 404/409 also toast then page becomes not-found/trashed; no other toast — `BV`
- [ ] Live → trashed in refetch drops typed text — `BV`

### Edit button
- [ ] Existing dialog tests updated and passing — `BV`
- [ ] Over-limit note + Edit → dialog shows stored note, field untouched — `BV`
- [ ] Failed (500) touched note + Edit resends, dialog opens — `BV`

### Hooks and helpers
- [ ] `useEditBookmark`: `toastOnSave:false`, result of save — `lib/bookmarks/useEditBookmark.ts`, `useEditBookmark.test.tsx`
- [ ] `useBookmark` returns `isFetching` — `useBookmark.ts`, `useBookmark.test.tsx`
- [ ] `editChanges` new helper table tests — `lib/bookmarks/editChanges.ts`, `editChanges.test.ts`
- [ ] `BookmarkEditor` / `EditBookmarkDialog` tests pass untouched
- [ ] `make check` passes
- [ ] Nothing outside allowed paths changed

## Judgment calls
(filled in at the end)
