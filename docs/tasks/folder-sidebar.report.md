# Verification report: folder-sidebar (front end, part A)

Branch: `claude/folder-sidebar-jp4yri-qv4gn6` (the branch this session was given; the plan header names `claude/folder-sidebar-jp4yri`, the same work).

**Result: no Blocking findings.** One flaky test was found and fixed (test only, see "Fixed by the verifier").

## 1. `make check`

- As delivered: **failed intermittently**. `FolderSection.test.tsx` > "when viewing the deleted folder, deleting /folder/a Recipes leaves you at /" failed in 2 of 4 runs (`expected '/folder/a' to be '/'`). Cause: the success toast renders one tick before the navigation, and the test read the location as soon as the toast appeared. The source is correct (navigation happens right after the server answers, then the dialog closes).
- After the test fix: `make check` passes (47 files, 572 tests; lint, vet, Go tests, build). The file passed 8 of 8 repeat runs.
- The 7 warnings in the output are from `openapi.yaml` lint and are not related to this change.

## 2. Acceptance criteria

"Real" = the test fails if the behavior is removed.

| Criterion | Covering test(s) | Real? | Verdict |
|---|---|---|---|
| Wrappers: method, path, body; `parent_id` omitted at top, sent for subfolder; `updateFolder` only `name`; `deleteFolder` both counts; `folder_id` only when given (FR-12, FR-16) | `lib/api/folders.test.ts`; `lib/api/bookmarks.test.ts` (`folder_id` rows) | Yes, assert exact method/path/body | Met |
| `buildFolderTree`: empty, flat, 3 levels, orphan, server order, counts, lookups | `lib/folders/buildFolderTree.test.ts` | Yes (order and orphan cases would fail if sorted or dropped) | Met |
| `folderFailureMessage`: every cell, `retryAfter` number/0/null, network error | `lib/folders/folderFailureMessage.test.ts` | Yes | Met |
| Sidebar states: skeleton, tree, empty, failed + working "Try again", 401; links in every state | `FolderSection.test.tsx` (states), `AppShell.test.tsx` | Yes. The links live in `AppShell`, outside the section, so they are always present | Met |
| Expanded by default, chevron + `aria-expanded` + label, indent, count hidden at 0, `title` and one-line CSS | `FolderTree.test.tsx` | Yes. The ellipsis is by CSS, so the test checks the class and `title` only (jsdom has no layout) | Met |
| `aria-current` for All bookmarks, Trash, folder | `AppShell.test.tsx`, `FolderTree.test.tsx` | Yes | Met |
| Row menu order, no "Move to…", "New subfolder" disabled at depth 3 only | `FolderTree.test.tsx`, `ui/Menu.test.tsx` | Yes | Met |
| New folder / subfolder / rename: title, parent line, `parent_id`, prefilled, Save disabled unchanged, enabled for case-only | `FolderFormDialog.test.tsx`, `FolderSection.test.tsx` | Yes | Met |
| Name rules: trim, empty / spaces, no message before typing, 100/101, emoji once, counter | `FolderFormDialog.test.tsx` (`it.each` with 100/101 chars and emoji) | Yes. Asserts no `maxlength` attribute | Met |
| Enter submits; Esc/Cancel discard; second Enter; all disabled and Esc ignored while saving | `FolderFormDialog.test.tsx`, `useCreateFolder.test.tsx` ("second call in flight") | Yes | Met |
| Success closes, refreshes folders and `bookmark-list`, toast; each failure keeps dialog and text; 401; 409 no refresh | `FolderSection.test.tsx`, `useCreateFolder/RenameFolder.test.tsx`, `FolderFormDialog.test.tsx` | Yes | Met |
| Delete text: empty, one subfolder, bookmarks only, both, singulars, counts from the loaded list | `deleteFolderText.test.ts`, `DeleteFolderDialog.test.tsx`, `FolderSection.test.tsx` (parent counts a child's bookmarks) | Yes | Met |
| Delete: once, closes, refreshes folders/lists/`['bookmark']`, toasts 0 / N / 1 | `useDeleteFolder.test.tsx`, `DeleteFolderDialog.test.tsx`, `FolderSection.test.tsx` | Yes | Met |
| Delete navigates to `/` for the folder or a descendant; not for an unrelated one; replace | `FolderSection.test.tsx` (`it.each`, replace test) | Yes (flaky until fixed, see section 1) | Met |
| Delete: Esc/Cancel/backdrop ignored while working; failure keeps dialog; 404 refreshes | `DeleteFolderDialog.test.tsx`, `useDeleteFolder.test.tsx` | Yes | Met |
| Folder page: list requested with route id; two folders do not share cache; paging | `FolderPage.test.tsx`, `useBookmarkList.test.tsx` (separate entries, next cursor keeps `folderId`) | Page test checks only the paging sentinel; real paging is tested in the hook that the page reuses | Met |
| Heading, empty text, unknown folder (list and 404), 401 | `FolderPage.test.tsx` | Yes | Met |
| "All bookmarks" requests no `folder_id`; its tests unchanged | `useBookmarkList.test.tsx` (no `folderId` property), `App.test.tsx` (mock only) | Yes | Met |
| Saving from the folder page sends its id; elsewhere none | `AddUrlForm.test.tsx` (with / without), `FolderPage.test.tsx` | Yes. No page-level test for "All bookmarks" saving, but `BookmarksPage` passes no id | Met |
| `make check`; no `any`/ignore directives; package files and out-of-scope paths untouched; nothing copied except CSS | this run; greps below | Yes | Met (after the test fix) |

Integration tests: none exist for this task and none are relevant (front end only; the server is mocked). No criterion depends only on integration tests. I did not run `make test-integration-local`: nothing in `backend/` changed.

## 3. Plan check

- Every acceptance criterion has a plan item; none is missing.
- Every ticked item has a test that exists and checks the behavior. The one exception is the tick on "`make check` passes": it was flaky (section 1).
- Plan vs diff: the plan matches the diff (file list, `Menu` `disabled`/`title`, shared `useFolderMutation`, `App.test.tsx` mock only, no `.ts`/`.tsx` copied). The plan header names `claude/folder-sidebar-jp4yri`; the working branch is `claude/folder-sidebar-jp4yri-qv4gn6`.
- Judgment calls 1 to 16 are all in the plan. I read the code against the task file, not the plan, and found no conflict, except the directory name (Non-blocking 1).

## 4. Rule checks (by reading the diff)

- Only `handler/` imports `internal/api`, `user_id` filters, `users.version`: not applicable. `git diff origin/main...HEAD` touches nothing under `backend/`.
- `go.mod`, `go.sum`, `package.json`, `package-lock.json`, `openapi.yaml`, Makefile: unchanged. No dependency added.
- Only `components/ui/` imports `@base-ui/react`; icons come only from `lucide-react`; no other UI package.
- Types come from `schema.d.ts` (`Folder`, `CreateFolderRequest`, `UpdateFolderRequest`); no hand-written copy. Rename never sends `parent_id`; create omits it at the top level.
- The tree does not sort; `subtreeCount` is the folder plus its descendants; an orphan goes to the top level; a parent loop does not recurse forever.
- No `setQueryData` / `onMutate` / `setInterval` in the new code. The only `refetchInterval` is the existing bookmark-detail hook.
- No feature imports another feature. `bookmark-list` gained only `folderId`, `empty` and `notFound` props and a `not-found` phase, none folder-specific.
- Query key `['bookmark-list', { trashed, folderId }]` sits under the prefix.
- Delete: navigation only after success, only for the deleted folder or a descendant, using the ids taken when the dialog opened (before the refresh). Esc and the backdrop are ignored while busy (`busy` on `Dialog`).
- Names are rendered as text (test "renders a name as text, never as HTML").
- Compared against `docs/design/ui-reference/src/components`: no shared lines over 40 characters in `FolderTree` or `FolderFormDialog`; only CSS carried over.
- No `any`, `@ts-ignore`, `@ts-expect-error` or `eslint-disable` in the new files.

## 5. Attempts to break it

Read from code and tests; no browser was available.

- 100 and 101 code points, emoji: covered, and correct (the limit is on the trimmed name, code points).
- Spaces only, case-only rename, Enter twice, double-click Create / Save / Delete, Esc while saving: guarded by a ref in the form and by `inFlight` in `useFolderMutation`; the buttons are disabled while pending.
- "New subfolder" on the third level: disabled from the server's `depth`.
- Deleting a parent while viewing a grandchild, deleting an unrelated folder, `/folder/<random uuid>`, a failed folder list then "Try again", an orphan, 429 with and without `Retry-After`: covered.
- 30 folders and a very long name: no test; the markup is a plain list and the name is cut by CSS.
- No concurrent-write problem: all writes go through one in-flight guard per dialog, and only one dialog is open at a time.

## 6. Findings

### Blocking

None.

### Fixed by the verifier (test only)

- `FolderSection.test.tsx`, table "when viewing … leaves you at …": the test now waits for the dialog to close (which happens after the navigation) before reading the location. Before, it failed in 2 of 4 runs. To reproduce the old failure: run `npx vitest run src/features/folder-sidebar/components/FolderSection.test.tsx` several times on the previous commit.

### Non-blocking

1. The feature directory is `features/folder-sidebar/`, while the task's Structure section says `features/folders/`. `ARCHITECTURE.md` ("Naming") requires `folder-sidebar`; the plan flags this. Fine as is.
2. On the folder page, `AddUrlForm` is the same component instance when moving from one folder to another, so a half-typed URL (and a shown failure) stays and would be saved into the new folder. By reading the code only; not run. A `key={id}` on the form would fix it.
3. No test for the delete hook's "second call while in flight". The guard is the shared one tested through `useCreateFolder`, and the Delete button is disabled while working.
4. "Too many requests. Try again in about 0 seconds." for `Retry-After: 0`. This is what the task file's wording gives for a number.
5. The counter and the 100 limit use the trimmed name (plan, judgment call 5). Matches what is sent. If the server counts the raw name, a 100-character name with trailing spaces would be accepted here and could fail there; this can only be checked once the server exists.
