# Verification report: top-bar-search (front end)

**Branch:** `claude/top-bar-search-zt1yan-dgbacv` (this session's branch, reset to the builder's `claude/top-bar-search-zt1yan` at `b19e924`, plus the verifier's test additions).
**Result:** no Blocking findings. 1 Non-blocking flake, 3 Non-blocking notes.

## `make check`

| Step | Result |
|---|---|
| lint (gofmt, go vet, eslint, stylelint) | passed |
| `go test ./...` | passed (backend untouched by this branch) |
| `npm test` | **first full run: 1 failed / 829 passed** (`FolderSection.test.tsx` "deleting /folder/b Recipes leaves you at /", an unrelated file this branch does not touch). Re-run of the whole suite: 830/830 passed. That file alone, 3 runs: 29/29 passed. See N1. |
| build, openapi-lint | passed (7 existing redocly warnings) |

After my added tests: `useListSearch.test.tsx` 20/20, three runs in a row; eslint and `tsc` clean.

## Acceptance criteria

All 26 changed files are under `frontend/src/` plus the plan. "Discriminates" = I checked the test would fail if the behavior were removed (mutation, or by reading the assertion).

| Criterion | Covering test(s) | Real check? | Verdict |
|---|---|---|---|
| listSearch: trim, empty, 200/201, emoji, trailing-space cut (FR-9) | `listSearch.test.ts` (passes 200 whole / cuts 201 / 201 emoji / trims after cut) | Yes: removing the cut turned 4 tests red | Met |
| listSearch: `notes=1` only; write keeps other params | `listSearch.test.ts` | Yes (asserts exact URL strings) | Met |
| `listBookmarks`: `q` encoded, round trip | `bookmarks.test.ts` | Yes, parses the request URL | Met |
| `include_notes` only with `q` and true | `bookmarks.test.ts` "sends include_notes=true only with a q and includeNotes: true" | Yes: removing the line turned it red (FR-10) | Met |
| No `q`: URL identical (plain, trash, folder) | `bookmarks.test.ts` | Yes, exact URLs | Met |
| useListSearch: field keeps typed text ("foo " / "foo bar") | `keeps exactly what was typed after its own write…` | Yes | Met |
| 299/300 ms, replace, one write for two keys | `changes the field at once…`, `makes one write…` | Yes: 300→0 turned both red | Met |
| Only spaces; equal term writes nothing | `removes q for only spaces…` (location key compared) | Yes | Met |
| Enter, Clear, focus, composing | `applies Enter at once…`, `Clear empties…`, `does nothing on Enter while composing…` | Yes | Met |
| URL change by other means / back drops wait | `follows a change by other means and drops a pending wait; back restores` | Yes | Met |
| Path change drops typed text | `drops typed but unapplied text on a path change…` | Yes: removing the drop turned it red | Met |
| Unmount cancels | `writes nothing after unmounting with a wait pending` | Yes: removing the cleanup turned it red | Met |
| Notes toggle, keeps q, replace | `toggles notes by replacing the entry…`, `keeps a pending term when notes is toggled…` | Yes | Met |
| Scope: push to `/`, pending text, notes, `x=1`, empty field, no-ops | `hooks/useListSearch.test.tsx` "notes and scope" (5 tests) | Yes | Met |
| First render / pasted 201 chars cut | `shows the URL term on the first render…` | Yes | Met |
| SearchBar: `/`, switch states, folder label, maxLength, name, Clear, title | `SearchBar.test.tsx` | Yes (role/name queries; disabled via `aria-disabled`, see N3) | Met |
| Switch / SegmentedControl wrappers | `Switch.test.tsx`, `SegmentedControl.test.tsx` | Yes | Met |
| List: request args with `q` / notes / folder; none without | `BookmarkList.test.tsx`; existing exact-match assertions unchanged | Yes | Met |
| `trashed` ignores `q` | `BookmarkList.test.tsx` (`/trash?q=foo` empty trash), `useBookmarkList.test.tsx`, `App.test.tsx` | Partly by design: the hook also guards, so the `BookmarkList` guard shows only through the empty-state text; removing it turned that test red | Met |
| Key literals and key differences | `queryKeys.test.ts` | Yes (literal arrays) | Met |
| Late response not shown under new term | `BookmarkList.test.tsx` (held promise) | Yes | Met |
| Second page carries cursor, `q`, notes, folder | `useBookmarkList.test.tsx` | Yes | Met |
| New term / notes → first page, own key | `useBookmarkList.test.tsx` | Yes | Met |
| Server order | `…not newest first or alphabetical` | Yes: client sort by title and by date each turned tests red | Met |
| Invalidate refetches; delete refreshes | `BookmarkList.test.tsx` | Yes | Met |
| No-match panel, `<b>` as text, both descriptions, replaces "This folder is empty." | `BookmarkList.test.tsx`, `FolderPage.test.tsx` | Yes (exact strings) | Met |
| Errors: search failure text, 401, later page | `BookmarkList.test.tsx` | Yes | Met |
| Section name | `BookmarkList.test.tsx` | Yes | Met |
| Pages: bar while folders load/fail/404, gone when missing | `FolderPage.test.tsx` | Yes | Met |
| Bar present/absent per route; add-URL kept; `/trash?q=foo` | `BookmarksPage.test.tsx`, `FolderPage.test.tsx`, `App.test.tsx` | Yes | Met |
| Repo-wide: `make check`, no `any`/disable comments, protected files | see rule checks | | Met (N1 flake) |

FR-9, FR-10, FR-11 (folder id sent on folder page; scope control) and FR-21 (no bar and no `q` on trash) each have at least one discriminating test above.

## Plan check

- Every acceptance criterion has a plan item; nothing missing.
- All plan items are ticked and every named test exists and passes. No ticked item with a missing or vacuous test.
- Plan vs diff: matches. The judgment calls (`aria-disabled` radio, `busy` ref per list key, 640 px breakpoint, `useAppliedSearch` in the hook file, scope change applying to the folder entry first) all match the code. The plan's "make check passes" held on my second full run, not on my first (N1).

## Rule checks

- Only `components/ui/` imports `@base-ui/react` (Switch, SegmentedControl, plus existing wrappers). Icons only from `lucide-react`; no `react-icons`.
- Backend untouched, so: `internal/api` imports, `user_id` filters, `users.version`, `go.mod` go/toolchain: no diff, nothing to check.
- No change to `package.json`, lockfile, README, Makefile, stylelint config, `schema.d.ts`, `app-shell/`, `openapi.yaml`, `backend/`. Only `docs/tasks/top-bar-search.plan.md` changed under `docs/` (plus this report).
- No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `stylelint-disable`, `dangerouslySetInnerHTML` in the diff. No debounce library; the timer is in `useListSearch`.
- New CSS uses `var(--…)` only; no hex/rgb colors.
- Search bar is `div role="search"`; not a form.
- State is URL-only: `useAppliedSearch` reads the URL; the list and the bar share `readListSearch`/`normalizeTerm`, so the 200-char rule exists once. The only extra state is the field text and a remembered-term ref, both required by the task.
- Timer clearing: every keystroke (`onChange`), Enter/Clear/scope (`apply`), URL or path change that drops text (effect), unmount (cleanup effect). Each verified by reading and by mutation.
- Existing tests unchanged except added imports (`cleanup`, `MemoryRouter`).
- Not copies of reference files: `SearchBar.tsx`, `Switch.tsx`, `SegmentedControl.tsx` are new code on Base UI; only CSS was adapted.
- Discrimination mutations (all reverted): 300→0 (2 red); remove unmount cleanup (1 red); remove path-change drop (1 red); stop sending `include_notes` (1 red); client sort ×2 (2–4 red); remove `trashed` guard in `BookmarkList` (1 red); remove 200-char cut (4 red).

## Extra cases tried

Added to `useListSearch.test.tsx` (all pass): a 200-character term is written whole and 201 is cut to 200 while the field keeps the 201 typed; `a&b`, `100%`, `"quoted phrase" -word or`, `<script>` read back identically from the URL; five rapid toggles of notes end on, a sixth ends off, keep `q` and `x=1`, and replace the entry. Already covered by existing tests: toggle during pending text, Back after search/scope change, late page under a new term, `/trash?q=…`, folder 404 with bar.

Integration tests: none exist for this task and none were run (frontend only; backend untouched). No criterion depends on them.

## Findings

### Blocking

None.

### Non-blocking

- **N1. Flaky unrelated test.** `FolderSection.test.tsx` "when viewing a child of it, deleting /folder/b Recipes leaves you at /" failed once in the first full `make check` run (`expected '/folder/b' to be '/'`, after a `waitFor`) and passed in the next full run and in 3 isolated runs. The file is not in this diff. Likely timing under load.
- **N2. Back after a scope change.** `chooseScope` applies the text to the folder's own entry (replace) before pushing `/`, so Back returns to the folder page *with* the search the user typed, not as it was before. The plan states this; the task file does not say which it wants.
- **N3. Wrapper does not refuse `trashed` + `q`.** `listBookmarks` would send both if a caller gave both; only `useBookmarkList` prevents it. No caller does. The `BookmarkList` trash guard is redundant with the hook's.
- **N4. Disabled radio is `aria-disabled`, not `disabled`.** Base UI's behavior; the tests assert `aria-disabled`.
