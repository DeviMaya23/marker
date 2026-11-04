# Verification report: bookmark-actions (front end)

Branch: `claude/bookmark-actions-verifier-gfhmyr` (built from the builder's `claude/bookmark-actions-e4mhcd`, head `164e61e`).
Result: **1 Blocking finding.** No pull request opened.

`make check`: passed on the builder's head (415 tests) and again after my two added tests (416 passed, 1 expected fail).

## Acceptance criteria

| Criterion | Test(s) | Verdict |
|---|---|---|
| API wrappers: PATCH only given keys, `note: null`, omitted note absent; DELETE; POST `/restore`; `emptyTrash` returns `{deleted}` | `lib/api/bookmarks.test.ts` "write wrappers" (4 tests) assert method, path and exact body | Met. Would fail if a key were always sent. |
| Failure messages, every cell, `retryAfter` number/0/null, 422 title/note/both, network | `lib/bookmarks/describeFailure.test.ts` | Met. Pure function, exact strings. |
| Dialog: Esc, backdrop, busy, focus in/out | `components/ui/Dialog.test.tsx` | Met. |
| Menu: toggle, Esc+focus, arrows/Home/End, outside click, choose closes, `aria-expanded` | `components/ui/Menu.test.tsx` | Met. |
| Toast: 3.5 s / 6 s, action runs and dismisses, stacking, unmount clears timers | `components/ui/Toast.test.tsx` (fake timers) | Met. |
| Edit dialog: prefilled, Save disabled, 300/301, 500/501, emoji = 1 | `EditBookmarkDialog.test.tsx` (it.each 300/301, 500/501, emoji), `editChanges.test.ts` | Met. Tests check the Save button and the message, so they fail without the limit. |
| Only changed fields sent; trimmed title; spaces-only changes; note `null` cases | `editChanges.test.ts`, `EditBookmarkDialog.test.tsx` "saving" it.each | Met. |
| Enter submits; Esc/Cancel discard; second Enter; disabled while saving | `EditBookmarkDialog.test.tsx` | Met. |
| Success closes, refreshes, "Saved."; each Edit failure keeps dialog open with message; 401 signed-out | `useEditBookmark.test.tsx`, `EditBookmarkDialog.test.tsx` | **Partly met.** True for the dialog on the bookmark page and for 422/429/5xx. Not true in the list for 404 and 409: see Blocking 1. |
| Reopening starts from current values | `EditBookmarkDialog.test.tsx` "reopens" | Met. |
| List row: button name, menu order, no Move to…, new-tab link with `noopener noreferrer` | `BookmarkRow.test.tsx` | Met. |
| Delete once, refresh, "Moved to trash." + Undo, disabled in flight; Undo; Undo failure; Delete failures; 401 Log in | `BookmarkRow.test.tsx`, `useDeleteBookmark.test.tsx` | Met. I added the Undo-after-already-restored (409) row. |
| Nothing changes until refreshed list arrives | `BookmarkList.test.tsx` "keeps the row until the server has answered" | Met. Holds the delete promise open and checks the list call count. |
| Bookmark page: Edit/Delete, no Restore; edit refresh and cleared note; Delete toast, no Undo | `BookmarkView.test.tsx` "BookmarkView actions" | Met. |
| Trashed page: banner text, Restore, no Edit/Delete; restore to live view | `BookmarkView.test.tsx` | Met. |
| Buttons disabled in flight; 404/401 replace page | `BookmarkView.test.tsx` | Met. |
| Existing polling/title/page-text tests unchanged | same file, `git diff` shows only added blocks plus the trash banner assertion | Met. |
| Trash view: Open link + Restore, once, disabled, failures | `TrashRow.test.tsx` | Met. |
| Empty trash: disabled states, text for 1/several/more pages, phrase, Esc/Cancel, working state | `EmptyTrash.test.tsx` | Met. |
| Empty trash success/failure/401 | `EmptyTrash.test.tsx`, `useEmptyTrash.test.tsx` | Met. |
| Repo-wide: `make check`; no `any`/ts-ignore/eslint-disable; package files; no other paths changed | grep and diff, see rule checks | Met. |

Requirements: FR-8, FR-17, FR-19, FR-20, FR-21a are covered by the rows above; FR-8's "dialog stays open on failure" is the one in doubt (Blocking 1).

## Plan check

- Every acceptance criterion has a plan item; none missing. Every ticked item names a test that exists and checks the behavior.
- The plan says `make test-integration-local` was "run, passed". This task has no backend or integration test, so it does not bear on any criterion. I could not check the claim.
- Plan vs diff: the plan matches the diff. Judgment calls 1 to 14 are consistent with the code. Call 2 (Undo failure for every status except 401 shows the undo message) and call 5 (unlisted table combinations get the generic message) are reasonable reads.
- The plan's "Dialog stays open on each Edit failure" item is ticked, but the list case does not hold (Blocking 1).

## Rule checks

- Only `components/ui/` imports `@base-ui/react` (grep): pass. Only icons are from `lucide-react`; no headlessui, radix, Tailwind, react-icons.
- `package.json` adds only `@base-ui/react ^1.9.0`; the lockfile adds it and its dependencies (`@base-ui/utils`, `@floating-ui/*`, `reselect`, `use-sync-external-store`) and drops one `"dev": true`: pass.
- Nothing changed under `backend/`, `openapi.yaml`, Makefile, scripts, or `docs/` except the plan; `go.mod` untouched: pass.
- Types come from `schema.d.ts` (`Schemas['UpdateBookmarkRequest']`, `operations['emptyTrash']`); `folder_id`/`url` never sent; the `null`/absent distinction reaches the body (wrapper copies only defined keys): pass.
- No file is a copy of a reference file (the few same-named files differ by 40+ lines and share no structure): pass.
- No feature imports another; edit dialog, hooks and message function are shared: pass.
- No `setInterval`, `setQueryData` (outside a test that asserts it is not called), `onMutate`, `dangerouslySetInnerHTML`: pass. Toast timers belong to Base UI and are tested to clear on unmount.
- Saved URLs link with `noopener noreferrer`; page text and titles render as text: pass.
- Backend rules (`internal/api` imports, `user_id` filters, `users.version`): not applicable, no backend change.
- Call sites and the failure table: delete, restore and empty trash handle every row. Edit handles every row at the component level; in the list, 404/409 are shown nowhere (Blocking 1). 401 and 404 are not swallowed elsewhere.

## Findings

### Blocking

**1. A 404 or 409 on Save from the list row shows no message and closes the dialog (FR-8, acceptance criterion "each failure in the Edit column keeps the dialog open, shows the right message").**
The edit dialog is owned by `BookmarkRow`. After a failed save the hook refreshes (correctly, per the task). If the bookmark is gone or trashed, the refreshed list drops the row, which unmounts the dialog and its banner. No toast stands in for it, so the user's edit is lost without a word.
Reproduce: `frontend/src/features/bookmark-list/components/BookmarkList.test.tsx`, test "keeps the dialog open with its message when Save gets a 404 and the refreshed list no longer has the row" (written as `it.fails`, so it passes while the bug exists). Steps: list has row "Gone soon"; `updateBookmark` rejects with `ApiError(404)`; the next `listBookmarks` returns an empty page; open Edit, type, Save. Result: `dialog` is absent and "This bookmark no longer exists." is absent. Expected: dialog open with that message. The same happens for `409 bookmark_in_trash` (row leaves the live list). On the bookmark page the dialog survives, so only the list is affected.
Fix direction (not done, source is out of my scope): hold the dialog state above the rows, or show the message as a toast when the dialog is gone. Then change `it.fails` to `it`.

### Non-blocking

- `EditBookmarkDialog` puts `.modal-footer` inside `.modal-body` (`max-height: 50vh; overflow-y: auto`), so on a short screen the Save button scrolls with the fields. `Dialog` has an unused `footer` prop for this. Same for the empty-trash dialog.
- A stored title with surrounding spaces enables Save on open, because the trimmed value differs from the stored one and the save sends it trimmed. Only matters if the server ever stores untrimmed titles.
- Base UI gives each toast `role="dialog"` inside the `role="status"` region (plan call 12); screen readers may announce toasts unevenly. Not testable here.
- Base UI pauses a toast's timer on hover and focus, so "disappears after 3.5 s" holds only while the pointer and focus are elsewhere.

## Integration tests

None exist for this task (front end only; `docs/tasks/bookmark-edit-trash.md` covers the server). No criterion depends on one. I did not run `make test-integration-local`.

## Tests added

- `BookmarkRow.test.tsx`: Undo when the bookmark was already restored (409) shows the undo message and refreshes. Passes.
- `BookmarkList.test.tsx`: the `it.fails` reproduction for Blocking 1 (the mock factory gained `updateBookmark`).
