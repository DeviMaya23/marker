# Verification report: bookmark list and trash view (front end)

Branch: `claude/bookmark-list-verify-3xkqeg` (starts from `claude/bookmark-list-glkz45` at `f4d6f7b`).

**Verdict: no blocking findings.** Every acceptance criterion is met by a test that checks the behavior. Two non-blocking notes below.

## 1. `make check`

Passes (exit 0): Go lint and tests, OpenAPI lint (7 tag-description warnings, not from this branch), ESLint, `tsc`, Vitest 18 files / 226 tests. After my 4 added tests it is 230 tests; I ran only `vitest run src/features/bookmark-list` after adding them (80 passed), then ESLint and `tsc --noEmit` on the frontend (clean). I did not re-run the whole `make check` after adding tests.

## 2. Acceptance criteria

Tests are in `frontend/src/` and named by `it(...)` text. "Real" = would fail if the behavior were removed.

| Criterion | Covering test | Real? | Status |
|---|---|---|---|
| Wrapper: no args / `trashed:true` / `trashed:false` / cursor `+ / = &` encoded | `lib/api/bookmarks.test.ts` table | Yes (asserts the exact path) | Met |
| `formatDate` 30s, 59s, 60s, 59m, 60m, 23h, 24h, 6d, 7d, same year, earlier year | `formatDate.test.ts` table + 7d and year tests | Yes. Boundaries exact | Met |
| Rows in order; title; empty title → host; unparsable → whole URL; `<b>x</b>` literal (FR-7) | `BookmarkList.test.tsx`: "rows in the order given", "right title for %s" | Yes (also checks no `<b>` element) | Met |
| Chip pending / failed / ok (FR-5a) | "shows the %s chip", "no chip for an ok bookmark" | Yes | Met |
| Row links to `/bookmarks/{id}`; tile when `favicon_url` null | "links each row…", "falls back to the tile…" | Yes | Met |
| Skeleton on first load, empty library | "six skeleton rows and aria-busy", "empty library" | Yes | Met |
| Paging: no cursor first, `next_cursor` next, third page, null → no sentinel, no more requests | "pages through the cursors…", `useBookmarkList.test.tsx` "pages with the previous next_cursor…" | Yes (asserts the cursor list and call count) | Met |
| Second visible event while in flight → no second request | "two skeleton rows… one request" (3 events), hook test "one request when asked three times" | Yes | Met |
| First-page error + retry; later-page error keeps rows, same-cursor retry | "first-page error…", "keeps the rows on a later-page error…" | Yes (`[undefined, 'c1', 'c1']`) | Met |
| 401 first page and later page replace list | "first-page 401", "later-page 401" | Yes (rows gone) | Met |
| Observer disconnected on unmount; no `IntersectionObserver` → no throw | "disconnects the observer on unmount", "renders without IntersectionObserver", `useVisibleSentinel.test.tsx` | Yes (the unmount check is `every(...)` over created observers, and one exists) | Met |
| Add field: clears, refetches, no navigate; duplicate link; 401; failures keep input (FR-3) | `AddUrlForm.test.tsx` "saves on Enter…", failures table, 401 | Yes (list call count 1→2, no route change) | Met |
| Trash: `trashed:true`, "trashed " + date, no chip, link, null `deleted_at` | `BookmarkList.test.tsx` trash block | Yes | Met |
| Trash: no add field / Restore / Empty trash | `App.test.tsx` "read-only trash" (no `button` at all), trash "no buttons" | Yes | Met |
| Trash: empty, error text, 401, pages like list (FR-18) | trash block | Yes | Met |
| No shared cache | `useBookmarkList.test.tsx` "separate caches" | Yes (trash is `loading`, no rows, cursor-less call) | Met |
| Navigation: `/`, `/trash`, `aria-current`, unknown path | `App.test.tsx` | Yes | Met |
| Promoted components: detail tests pass, import paths only | `git mv` renames R100/R095/R091 (the 5–9% edits are imports); `BookmarkView.test.tsx` untouched | Yes | Met |
| `make check` | run above | | Met |
| No `any` / `@ts-ignore` / `@ts-expect-error` / `eslint-disable` | grep over changed source and tests | | Met |
| `package.json`, lockfile, `backend/`, Makefile, `openapi.yaml`, `docs/` (except plan) unchanged; only CSS copied | `git diff 7ec7d49 HEAD --stat` | | Met |

## 3. Plan check (`bookmark-list.plan.md`, read after the above)

- Every criterion in the task file appears in the plan. All items are ticked and each named test exists and checks the behavior.
- Plan vs diff: no differences found. The plan's file list, judgment calls (whitespace-only title → host, de-duplication across pages, empty page with a cursor keeps paging, failed refresh reuses "Couldn't load more.", no sentinel after a later-page failure) match the code.
- Small omission in the plan's CSS note: it does not mention the new `.page form` rule (`styles/app.css`), which gives every form inside `.page` a bottom margin, including pages other than the list. Cosmetic.

## 4. Rule checks

- Only `handler/` imports `internal/api`; repository `user_id`; `users.version`: not applicable, this is a frontend-only diff (nothing under `backend/` changed).
- `go.mod` untouched; no dependency change (`package.json`, lockfile unchanged).
- Icons: only `lucide-react`. No `react-icons`.
- `listBookmarks` types come from `schema.d.ts` (`Schemas['BookmarkPage']`, `BookmarkSummary`); no second copy. Only `trashed` and `cursor` are ever sent; `limit`, `q`, `include_notes`, `folder_id` never.
- Not copies of reference files: unique-line comparison against `docs/design/ui-reference/src/components/{BookmarkList,BookmarkRow,TrashRow}.tsx` shows the code is original (about 55–80% of lines are new). Only CSS carried over, only list/row/skeleton/sentinel rules, plus new nav and list-error rules.
- Different query keys: `['bookmark-list', { trashed }]`. `useInfiniteQuery` is used; no `setInterval`/`setTimeout`; no page or offset state.
- Row text is rendered as text; no `dangerouslySetInnerHTML`.
- No feature imports another feature. `Favicon`, `FetchStatusChip`, `hostOf` were moved; nothing left in `bookmark-detail`.
- Next-page guard: `fetchNext` returns early if `!hasNextPage || isFetching`, plus a ref guard against two events in one tick. The sentinel is only rendered when `hasNextPage`. The observer is created in an effect with a `disconnect` cleanup.
- A later-page failure keeps rows (`loadMoreFailed`); a later-page 401 replaces them (`signed-out` takes priority). Errors are surfaced, never swallowed.
- `AddUrlForm` no longer navigates; it invalidates `['bookmark-list']` on success.

## 5. Attempts to break it

Tests I added, each in the existing test file for the code, all passing:

- `BookmarkList.test.tsx`: a page with a cursor followed by `items: []`/`null` keeps the rows, drops the sentinel and shows no empty state.
- `BookmarkList.test.tsx`: unmounting while a page request is in flight, then resolving, does not throw.
- `useBookmarkList.test.tsx`: invalidating (as after a save) while the next page is in flight ends with fresh rows and `ready`.
- `formatDate.test.ts`: 7 days minus 1 ms → "6d ago", 1 hour minus 1 ms → "59m ago", future time → "just now", invalid date → empty.

Already covered by the builder's tests (so not re-added): first page empty with a non-null cursor, title of 300 characters, spaces-only title, URL with no host (falls back to the whole URL), failing favicon image (`Favicon.test.tsx`), same bookmark on two pages, three quick events. No bug found with any of these.

## 6. Integration tests

None exist and none apply: this slice is frontend-only and all tests mock the API wrapper. No criterion depends on integration tests. Nothing was checked against a real server or in a browser; the task says so too.

## 7. Findings

### Blocking

None.

### Non-blocking

1. **Possible stall in a real browser (not reproduced; jsdom cannot show it).** `IntersectionObserver` only calls back when intersection changes. If the sentinel stays within 400 px after a page loads (a tall screen and a short page), no new event fires, so the next page may not load until the user scrolls. Tests use a fake observer that fires on demand, so they cannot catch this. Worth a look once the real server is connected.
2. A failed refresh with rows on screen (for example after a save) shows "Couldn't load more." The plan lists this as a judgment call; the wording is slightly off.
3. `.page form { margin-bottom }` is global to `.page` rather than scoped to the add field.
