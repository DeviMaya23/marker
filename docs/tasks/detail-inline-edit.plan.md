# Plan: detail-inline-edit

Branch: `claude/detail-inline-edit-lulnlj`. Paths below are under `frontend/src/`.
`BV` = `features/bookmark-detail/components/BookmarkView.test.tsx`.
`make test-integration-local`: not run: the task touches no `backend/` file.
`make check`: run, passed (exit 0). Test files with timers run 3 times each, no flake.

## Acceptance criteria

### Live page: what is shown
- [x] Title input, Note textarea, null/'' note placeholder, h1 contains input — `EditableTitle.tsx`, `EditableNote.tsx`, `BookmarkView.tsx`; tests in `BV` ("inline fields")
- [x] Empty/space title → host placeholder; unparseable URL → whole URL — `EditableTitle.tsx`; `BV`
- [x] Markup in title/note is value text — `BV`
- [x] Trashed view read-only (heading text, note only when not null, '' note shows section) — `BookmarkView.tsx`; existing trashed tests in `BV`
- [x] Counters (note `n/500` always; title `n/300` on focus/over; `field__meta--over`) — `EditableTitle.tsx`, `EditableNote.tsx`; `BV`

### Committing
- [x] Title blur / Enter sends `{title}` once, new title shown, no "Saved." toast — `useInlineField.ts`, `useEditBookmark.ts`; `BV`
- [x] `  Hello ` over `Hello` → no request, shows `Hello` — `editChanges.ts` helper, `useInlineField.ts`; `BV`
- [x] Note commit rules (blur sends, Enter newline, clear → null, spaces → null, null+empty none) — `BV`
- [x] One field per call; two fields → two calls — `BV`
- [x] Boundaries 300/301, 500/501, emoji; over-limit messages, text kept, message clears — `useInlineField.ts`; `BV`
- [x] Second blur while in flight sends nothing; other field still sends — `BV`

### Status and the old value
- [x] `Saving…`/`Saved` per field, 2s, `clearTimeout` on unmount — `useInlineField.ts`; `BV`, `useInlineField.test.tsx`
- [x] Saved text shown while `getBookmark` held back; refreshed value after — `useInlineField.ts`; `BV`

### Refetch while editing
- [x] Untouched follows poll; touched keeps text and error — `BV`
- [x] Title save refetch doesn't replace note text — `BV`
- [x] Focus stays across refetch — `BV`

### Esc and failures
- [x] Esc restores baseline, clears error, no request; Esc then blur none; Esc during save — `BV`, `useInlineField.test.tsx`
- [x] Typing after the committing blur keeps later text; stored value typed back after save is sent — `BV`
- [x] Enter then blur with pending first save → one request — `BV`
- [x] Failure table rows (under right field, text kept, retry; 401 silent; 429; network) — `BV`
- [x] 404/409 also toast then page becomes not-found/trashed; no other toast — `BV`
- [x] Live → trashed in refetch drops typed text — `BV`

### Edit button
- [x] Existing dialog tests updated and passing — `BV`
- [x] Over-limit note + Edit → dialog shows stored note, field untouched — `BV`
- [x] Failed (500) touched note + Edit resends, dialog opens — `BV`

### Hooks and helpers
- [x] `useEditBookmark`: `toastOnSave:false`, result of save — `lib/bookmarks/useEditBookmark.ts`, `useEditBookmark.test.tsx`
- [x] `useBookmark` returns `isFetching` — `useBookmark.ts`, `useBookmark.test.tsx`
- [x] `editChanges` new helper table tests — `lib/bookmarks/editChanges.ts`, `editChanges.test.ts`
- [x] `BookmarkEditor` / `EditBookmarkDialog` tests pass untouched
- [x] `make check` passes
- [x] Nothing outside allowed paths changed

## Judgment calls
1. **`save` stays boolean; the result is a new `saveChanges`.** The task says `save` should resolve to a result, and that `BookmarkEditor` treats "saved" as `true`. But `BookmarkEditor` passes `edit.save` straight to the dialog as `onSave: Promise<boolean>`, and it is on the do-not-change list. A result object returned from `save` would be truthy and would close the dialog on a failure. So `save` is unchanged (`true` only for saved) and `saveChanges` returns the four-outcome result (`saved`, `ignored`, `unauthorized`, `failed` with the display and status). The inline fields use `saveChanges`. If you want `save` itself to return the result, `BookmarkEditor` and the dialog's `onSave` type must change first.
2. **Releasing the saved baseline.** The task names `isFetching` as the signal. A prop alone can miss a fetch that starts and ends between two renders, which would hold the saved text forever. The field therefore releases when the page query's cache says no fetch is running and `isFetching` is false. `isFetching` is the re-render trigger. The cache is only read, never written. With no active query nothing is fetching, so the release is immediate.
3. **An empty stored note and `null` are the same baseline.** A stored `''` note over typed empty or spaces sends nothing (`computeChanges` alone would send `null`). This avoids a pointless request after a note was cleared.
4. **Title counter, status and error sit under the `<h1>`** in the title block, so the heading holds only the input.
5. **Edit's draft drop uses a ref the field registers** (`dropRef`), and "in flight" is a ref set synchronously when a save starts.
6. **Mutation checks run by me** (b, d, e, f of the verifier list) each turned tests red; a and c were not run.
