# Verification report: detail-inline-edit

Verified branch: `claude/detail-inline-edit-lulnlj` (builder). Verifier branch (this report and two added tests): `claude/detail-inline-edit-verify-rrbjhe`.

**Result: no Blocking findings.** `make check`: passed (exit 0; 84 files, 1196 tests before my additions). `make test-integration-local`: **not run**, the task touches no `backend/` file (`git diff origin/main` shows only `frontend/**` and the plan). No criterion depends only on integration tests. All tests are frontend unit tests with a mocked API. I ran `BookmarkView.test.tsx` 3 times after adding my tests: 97/97 each time.

## Acceptance criteria

`BV` = `features/bookmark-detail/components/BookmarkView.test.tsx`. Requirements: FR-8, FR-21a, NFR-14.

| Criterion | Test(s) | Discriminates? | Status |
|---|---|---|---|
| Title input and Note textarea with stored values; null and `''` note empty with placeholder; `<h1>` contains input (FR-8) | `header and facts`: "shows the stored note…", "shows an empty note field…" (`it.each null/''`); `title` | Yes, reads input/textarea values and placeholder | Met |
| Empty and spaces title gives host placeholder; unparseable URL gives whole URL | `title` it.each `['', '   ']`, "shows the whole URL…" | Yes | Met |
| Markup is value text | `content is text`: "markup in the title and the note literally" | Yes | Met |
| Trashed: no inputs, heading text, note only if not null, `''` note shows section (FR-21a) | `a trashed bookmark` (3 tests) | Yes | Met |
| Counters: note `n/500` always; title only on focus or over; `field__meta--over`; spaces-only note raw, not over | `counters` (3 tests) | Yes | Met |
| Title blur/Enter sends only `{title}`, new title shown, no "Saved." toast | `committing` it.each (blur/Enter), "Shift+Enter…" | Yes (exact args). The no-toast part was not mutation-checked | Met |
| `  Hello ` over `Hello`: no request, shows `Hello` | "sends nothing for a title that only differs by spaces…" | Yes | Met |
| Note rules: blur sends; Enter newline; clear gives null; spaces gives null; null+empty none | "sends only the note on blur…", it.each at L714, "spaces-only note over a stored note" | Yes (mutation A/D turned them red) | Met |
| One field per call; two fields give two calls | "an edited note alone sends no title", "leaving the title then the note…" | Yes (mutation A: 13 red) | Met |
| Boundaries 300/301, 500/501, emoji; messages; text kept; message clears (NFR-14) | it.each at L748; my added emoji test; counters | Yes (mutation D: 5 red) | Met |
| Second blur in flight sends nothing; other field still sends | L771 test | Yes | Met |
| Saving…/Saved per field, 2 s, clearTimeout on unmount | L800, L817, `useInlineField.test.tsx` | Yes (mutation F: red) | Met |
| Saved text shown while `getBookmark` is held, then refreshed value | L828, L842 | Yes (mutation B1: red) | Met |
| Untouched follows poll; touched keeps text and error; save refetch keeps other field; focus stays | `refetch while editing` (5 tests) | Yes (mutation C, see below) | Met |
| Esc restores baseline, clears error, sends nothing; Esc then blur none; Esc in flight | `Esc` (2 tests) | Yes | Met |
| Later text kept after commit; stored value typed back after save is sent; Enter then blur gives one request | L851, L869, L788 | Yes (mutation B2: red) | Met |
| Failure table rows; 422 under the right field only; 401 silent; 429; network error | `failures` it.each (L968), "a 401…" | Yes (mutation E: red) | Met |
| 404/409 toast plus page becomes not-found/trashed, toast stays; no other toast | L1002, L1013, L1023 | Yes | Met |
| Live page trashed in a refetch drops typed text | L1037 | Yes | Met |
| Edit: dialog tests; over-limit draft dropped; failed draft resent and dialog opens | existing action test, L1051, L1063 | Yes | Met |
| `useEditBookmark`: `toastOnSave:false`, still refreshes; result of save | `useEditBookmark.test.tsx` | Yes | **Partly met**: the result comes from `saveChanges`, not `save` (see Non-blocking 1) |
| `useBookmark` returns `isFetching` | `useBookmark.test.tsx` | Yes | Met |
| `editChanges` helper table tests | `editChanges.test.ts` | Yes | Met |
| `BookmarkEditor`/`EditBookmarkDialog` tests untouched | not in diff | n/a | Met |
| `make check` passes; only allowed paths changed | run; `git diff --stat` | n/a | Met |

## Plan check

- Every criterion is in the plan. All ticks have a matching test; I found none that fail to check the behavior.
- Plan says mutations b, d, e, f were run and a, c were not. I ran all six (below).
- Differences between plan and diff: none. Judgment calls 1 to 5 match the code. Judgment call 3 (stored `''` note over spaces/empty sends nothing) is consistent with "a stored null and an empty field are the same".

## Rule checks

- Only `handler/` imports `internal/api`, repository queries filter by `user_id`, `users.version` increments: not applicable, no backend change.
- `go.mod` unchanged. No `package.json` or lockfile change.
- Untouched, as required: `EditBookmarkDialog`, `BookmarkEditor`, `BookmarkRow`, `describeFailure`, `app-shell/`, `components/ui/*`, `setup.ts`.
- `useEditBookmark`: differs only by `toastOnSave` and the added `saveChanges`. `save` keeps its boolean result, so the dialog callers behave as before. `useBookmark` adds only `isFetching`. `editChanges` only gains `changeForField`.
- Each field has its own `useEditBookmark` instance (called inside `useInlineField`, one per field component). So a slow title save cannot make the note's commit a no-op.
- Each inline call has one key. `changeForField` returns only `title` or `note`.
- Timers: only the 2 s `Saved` timer, cleared in the effect cleanup. No debounce or interval.
- No `setQueryData`, `setQueriesData` or `dangerouslySetInnerHTML` in the new code. The cache is only read (`getQueryState`).
- Touched rule: `value = typed ?? baseline` in `useInlineField.ts`. A refetch changes `stored` only, never `typed`.
- Blur and Esc cannot both send. Esc sets `typed` to null, so blur returns early at `text === null`.
- Mutations, each reverted (`git status` clean afterwards):

| Mutation | Result |
|---|---|
| (a) both fields in one call | 13 red |
| (b) drop the saved baseline, or drop typed text on success | 2 and 1 red |
| (c) a refetch overwrites a touched field (reset typed when `stored` changes) | 3 red. A weaker first attempt that only hid the text while `isFetching` was true stayed green, so that variant is not covered |
| (d) skip the over-limit check | 5 red |
| (e) toast for 422 | 2 red |
| (f) stop clearing the Saved timer | 1 red |

## Findings

### Blocking

None.

### Non-blocking

1. `save` still returns a boolean; the four-outcome result is on a new `saveChanges`. The task file says `save` itself should return the result. The plan explains why: `BookmarkEditor` passes `edit.save` straight to the dialog, which expects `Promise<boolean>`, and neither may change. The task file's two statements conflict, so the builder's choice is reasonable. The user may want the task file corrected.
2. `BookmarkView.tsx` formats the Edit button's `onClick` over several lines in a way the rest of the file doesn't. Style only.
3. Mutation (c) in its weak form survived (see above). The stronger form is caught, so the refetch rule is pinned.

## Tests I added (existing file `BV`, inline edit, committing)

- "unmounting while a save is in flight throws nothing and leaves no unhandled rejection". Passes.
- "a note of exactly 500 emoji is sent, 501 is not, and a title of 300 emoji is sent". Passes.

No source file was changed.
