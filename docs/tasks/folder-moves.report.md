# Verification report: folder-moves

Branch: `claude/folder-moves-task-kyi515-8fm0g0` (builder's work: `claude/folder-moves-task-kyi515`, head `6c55ff0`)

Result: **no Blocking findings.** `make check` passes (exit 0; Vitest 709 passed, of which 2 are tests I added; Go tests, lint, OpenAPI lint pass). Only the 7 existing `tag-description` warnings from Redocly appear.

## 1. Acceptance criteria

All tests are Vitest; paths are under `frontend/src/`. "Real" means the test would fail without the behavior.

| Criterion | Test | Real? | Status |
|---|---|---|---|
| `updateBookmark` sends `folder_id` string / `null` / absent; title, note unaffected | `lib/api/bookmarks.test.ts` "sends folder_id as a string, as an explicit null, and not at all" (+ existing title/note tests) | Yes, asserts exact body | Met |
| `updateFolder` `parent_id` string / `null` / absent; rename sends only `name` | `lib/api/folders.test.ts` (two tests) | Yes | Met |
| Valid targets, every listed case | `lib/folders/moveTargets.test.ts` (`it.each` + subtests; depth arithmetic matches `folders-api.md` "Depth": `row depth + h > 3`) | Yes | Met |
| Failure table, bookmark column (retryAfter number/0/null, other 409, network) | `lib/bookmarks/describeFailure.test.ts` rows `*, move` and 429 table | Yes | Met |
| Failure table, folder column | `lib/folders/folderFailureMessage.test.ts` | Yes | Met |
| Dialog: current location selected; Move disabled until another; null / id sent | `MoveDialog.test.tsx` | Yes | Met |
| Disabled rows not selectable, skipped by arrows, title; bookmark move none disabled | `MoveDialog.test.tsx` "cannot select a disabled row", "skips disabled rows…", "a bookmark move disables no row" | Yes | Met |
| Loading, failed + Try again + Move disabled, 401 message | `MoveDialog.test.tsx` | Yes | Met |
| Esc/Cancel/backdrop; busy ignores them; "Moving…"; second confirm sends nothing | `MoveDialog.test.tsx` "closing" block | Yes | Met |
| Failure banner `role="alert"`, stays open, keeps selection; 401 | `MoveDialog.test.tsx` "a failure"; per-column messages in `MoveFolderDialog.test.tsx`, `MoveBookmarkDialog.test.tsx` | Yes | Met |
| Reopen from current location; vanished location/folder → "Top level", no crash | `MoveDialog.test.tsx` "opening again…" | Yes | Met |
| Bookmark move: once, invalidates lists + page + folders, toasts; 409 trash and 404 refresh | `useMoveBookmark.test.tsx` | Yes | Met |
| Folder move: invalidates folders + lists, toast; 409 conflict / 422 no refresh; 404 refreshes | `useMoveFolder.test.tsx` (`it.each`) | Yes | Met |
| `useBookmarkFeedback.refresh` invalidates folders (delete, restore asserted); `AddUrlForm` after success only | `useBookmarkFeedback.test.tsx`, `useDeleteBookmark.test.tsx`, `useRestoreBookmark.test.tsx`, `AddUrlForm.test.tsx` | Yes | Met |
| Row menu order, opens dialog, trashed row none | `BookmarkRow.test.tsx`, `BookmarkList.test.tsx`, `TrashRow.test.tsx` | Yes | Met |
| Bookmark page: Folder fact states, hidden when trashed, move refresh, 404/401 replace page | `BookmarkView.test.tsx` | Yes | Met |
| Folder row menu order, depth-3 disabled, dialog with subtree disabled | `FolderTree.test.tsx`, `FolderSection.test.tsx` | Yes | Met |
| Save popup: default, `folder_id` sent / absent, title rule | `SavePopup.test.tsx` "what is sent", "the folder choice" | Yes | Met |
| Popup loading and failed (incl. 401), Try again | `SavePopup.test.tsx` | Yes | Met |
| Popup 404 on save; add field same text | `saveFailure.test.ts`, `SavePopup.test.tsx`, `AddUrlForm.test.tsx` | Yes | Met |
| Enter/Esc with select open; Enter on closed control; old key handling | `SavePopup.test.tsx` "keys that belong to the select" + existing key tests | Yes | Met |
| Names as text | `SavePopup`, `MoveDialog`, `Select`, `BookmarkView` tests with HTML names | Yes | Met |
| `make check`; no `any`/`@ts-ignore`/`eslint-disable`; protected files unchanged | run + grep; `git diff --stat` shows no change to `package.json`, lockfile, README, Makefile, stylelint, backend, openapi, docs (except plan) | n/a | Met |

## 2. Plan check

- Every acceptance criterion has a plan item; none is missing.
- Every ticked item has an existing test that checks the behavior (see table).
- Plan vs diff: matches. Judgment call 2 (any `422` on a folder move does not refresh) is as described. Not in the plan: a **bookmark** `422` on move refreshes (see Non-blocking 1).

## 3. Rule checks

- Only `handler/` imports `internal/api`: no backend change in the diff.
- Repository queries filter by `user_id`: n/a, no backend change.
- `users.version`: n/a, no backend change.
- `go.mod` / toolchain and dependencies: unchanged; `package.json`, lockfile unchanged.
- Only `components/ui/` imports `@base-ui/react` (grep). Icons from `lucide-react` only. No `setQueryData`, `onMutate` or `setInterval` in non-test code.
- Types come from `schema.d.ts` (`Pick<UpdateBookmarkRequest,…>`, `Schemas['UpdateFolderRequest']`); no hand-written copy. `null` vs absent preserved for `folder_id` and `parent_id`; a rename sends only `name`; the edit dialog never passes `folder_id`.
- Depth rule: `moveTargets` disables `depth + height > 3`, itself and descendants; matches `folders-api.md` ("deepest descendant at `d + h - 1`").
- `MoveDialog.tsx` differs from the reference file; no `.ts/.tsx` copied (CSS only).
- No feature imports another feature; dialog, hooks and messages are shared.
- Dialog: `busy` ignores Esc/backdrop; focus return is Base UI's `Dialog`; footer through the `footer` prop; radio group is Base UI's.
- Popup key handler: a capture-phase listener records whether the select owns Enter/Esc; the window handler returns early on it. Tested.
- Sidebar counts: `useBookmarkFeedback.refresh` and `AddUrlForm` invalidate `['folders']`; folder mutations still invalidate lists.
- Every failure-table row is handled: 401/404 are never swallowed (both refresh and show).

## 4. Breaking attempts

Boundaries tried: a whole depth-3 chain moved (disabled under every row, including depth-1), a depth-2 chain under depth 1 (exact limit, enabled); moving into own grandchild (disabled); current parent (valid, Move disabled); double click (guarded by `submitting` ref plus `inFlight`); 409 conflict, 422 cycle, 404; the moved folder vanishing; 30 folders and a 100-character name; HTML in a name. The first two and the last two are new rows I added (`moveTargets.test.ts`, `MoveDialog.test.tsx`); all pass. Nothing broke.

## 5. Integration tests

None exist for this task: it is front end only against mocked wrappers, and nothing under `backend/` changed. No criterion depends only on integration tests. I did not run `make test-integration-local`. The connection to the real server is the user's, as the task file says.

## 6. Findings

### Blocking

None.

### Non-blocking

1. Bookmark move, `422` (for example `validation_error`): `describeFailure(…, 'move')` returns `refresh: true`. The task says a `422` does not refresh. The task's own list of server answers has no `422` for a bookmark move, so this cannot happen against the described server. Folder moves handle it correctly.
2. On a bookmark move, a `409` with another code or a 500 refreshes; matches the task ("every case except…"), noted only for completeness.
3. Judgment call 6 (the popup refetches the folder list after any failed save with a folder chosen, not only a 404) is harmless and cheap.
