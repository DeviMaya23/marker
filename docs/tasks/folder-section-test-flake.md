# Task: fix the flaky folder-delete navigation test (front end, test only)

> One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> **Prerequisite:** none beyond the current `main`.

## Goal

`make check` no longer fails intermittently on `FolderSection.test.tsx`. The test that reads the location after a folder delete waits for the location to settle, instead of assuming the navigation has already rendered. No behavior of the app changes.

Requirements covered: none (tooling). The acceptance criteria below are the specification.

Out of scope, and why:

- Any change to `FolderSection.tsx`, `DeleteFolderDialog.tsx` or any other non-test file: the source is correct. The delete handler calls `onDeleted()` (which calls `navigate('/', { replace: true })`) right after the server answers, then closes the dialog; the test reads the location too early. The `folder-sidebar` verifier reached the same conclusion for an earlier flake in the same test.
- Other flaky tests, and a general retry or timeout change in the Vitest configuration. If you find another flaky test, name it in your report and do not edit the backlog; the user decides what to track.
- Changing what the test checks. Every row of the table, and the assertions that the dialog closes and the location ends where it should, stay.

## Role and ownership

Role: Frontend (see `AGENTS.md`).

You may change `frontend/src/features/folder-sidebar/components/FolderSection.test.tsx` and nothing else, apart from your plan file. You may not change any other file under `frontend/`, `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/folder-section-test-flake.plan.md`, see `AGENTS.md`), or the Makefile.

**Shared files.** None. `top-bar-search` runs at the same time and changes `pages/`, `features/bookmark-list/`, `components/ui/` and the shared styles; this task touches none of them. `get-favicon` is backend only.

## The problem

In `FolderSection.test.tsx`, the `it.each` block "when viewing %s, deleting %s %s leaves you at %s" does, in order: clicks "Delete folder"; waits for the "Folder deleted." toast; waits for the "Delete folder?" dialog to disappear; then reads the location once with `where()` and compares it to the expected path.

The location is rendered by a `<Where />` component inside the router. The navigation is started before the dialog closes, but React Router renders the new location in a later update, and under load (a full `make check` runs many test files at once) the single read can happen first. It has failed twice that way: `expected '/folder/a' to be '/'` (found by the `folder-sidebar` verifier, then fixed once by waiting for the dialog) and `Expected '/', received '/folder/c'` (reported by the `css-lint` verifier at line 204, after that fix). Waiting for the dialog proves the click was handled, not that the location rendered.

## Behavior

### The fix

1. In the `it.each` block, replace the single read of the location with a wait that retries until the location equals the expected path: `await waitFor(() => expect(where()).toBe(expected))`. Keep the existing wait for the dialog to disappear, before it: it still proves the delete finished and the dialog closed, which the test also checks.
2. The rows where the user should stay (`an unrelated folder`, `its parent, while deleting the child`, `the all-bookmarks page`) go through the same assertion, so one code path serves all six rows. For them the wait passes on its first try. Do not add a fixed delay (`setTimeout`, `vi.advanceTimersByTime` or a sleep) anywhere.
3. Update the comment above the wait so it says what is true: the toast and the dialog closing can render before the new location does, so the test waits for the location.
4. Look at the other places in the file that read `where()` after an asynchronous action. When this file was written none needed a change: the create test (`/` unchanged), the failed-delete test (`/folder/a` unchanged) and the move test (`/folder/b` unchanged) assert that the location does **not** change, and the history-replace test already uses `waitFor`. Change another one only if you find it asserting a location that **changes** because of the action without waiting for it, and name it in your report.

### Known gaps

- A wait that retries cannot show that the location stays put after a wrong late navigation: for the three "stay" rows a navigation that arrives after the read would pass unseen. The `leaveIfGone` source decides whether to navigate once, synchronously, from `pathnameRef`, so a late navigation cannot occur; the test does not try to prove otherwise.
- The default `waitFor` timeout (1,000 ms) is left as it is.

## Structure

One file changes: `FolderSection.test.tsx`. Add no helper, no new file and no shared test utility. `waitFor` is already imported in that file.

## Dependencies

None.

## Acceptance criteria

**Test file**
- The `it.each` block ends with `await waitFor(() => expect(where()).toBe(expected))` (or an equivalent single retrying assertion), after the dialog-closed wait. There is no bare `expect(where())` on the line after the dialog wait.
- The block still has all six rows, with the same names and expected paths.
- No other test in the file changes unless item 4 of the fix applies to it, and the report names each one that did.
- The file passes 20 times in a row on its own (`npx vitest run src/features/folder-sidebar/components/FolderSection.test.tsx`, repeated), passes 10 times while the full suite runs in a second shell, and passes in a full `make check`. Report how many repeats you ran and any failure. If a run fails, including a later `make check`, report the failure text and stop (see "Stop and ask when"); do not rerun until it passes.

**Repo-wide**
- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

- The diff is limited to `FolderSection.test.tsx` and the plan file. `git diff` shows no change to a non-test file.
- To confirm the test still discriminates (break the behavior, see it fail, revert): in `FolderSection.tsx`, remove the `navigate('/', { replace: true })` call and check that the three navigating rows (deleted folder, child, grandchild) fail. Revert it; the tree must be clean afterwards. Do not use "navigate for every folder" as a required check: the all-bookmarks row cannot fail that way (it is already at `/`), and the other two "stay" rows can pass a late navigation unseen (see "Known gaps"). You may try it and report what happened, but a pass there is not a defect.
- To confirm the fix removes the race: run the file 20 times in a row alone, then 10 times while the full suite (`npx vitest run` in `frontend/`) runs in a second shell, and report both pass counts. Compare with `main` if you can reproduce a failure there; if you cannot, say so and do not claim the fix is proven, only that the assertion no longer depends on timing. Any failure in these runs is reported with its text, not hidden.
- There is no fixed sleep, no raised timeout and no `retry` option added.

## An unrelated test fails

If `make check` fails in a test file other than `FolderSection.test.tsx`, do not fix it. Run that file alone once. If it passes alone, name the file, the test and the failure text in your report as a possible flake, and hand back; it does not block this task. If it fails alone too, stop and ask.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement or this file conflict with each other.
- You think you need to change a non-test file to make the test stable. That would mean the source has a real timing problem; report it and do not change it.
- The test still fails intermittently after the fix. Report the failure text and the run count.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, the repeat-run count and result, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
