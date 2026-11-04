# Plan: add form key and empty-trash footer

## FolderPage (`frontend/src/pages/FolderPage.tsx`, tests in `FolderPage.test.tsx`)
- [x] Typed URL is gone after moving f-1 → f-2 via the sidebar "Travel" link. Test: `FolderPage.test.tsx` "clears the add field when moving to another folder"
- [x] A shown save failure (500 banner) is gone on f-2. Test: `FolderPage.test.tsx` "drops a shown save failure when moving to another folder"
- [x] Save on f-2 after the move sends `{ url, folder_id: 'f-2' }` once, never `f-1`. Test: `FolderPage.test.tsx` "saves into the new folder after moving"
- [x] Same folder, search change in URL keeps typed text. Test: `FolderPage.test.tsx` "keeps the typed text when only the search changes"
- [x] In-flight save on f-1: f-2 form not read-only, empty, button "Save"; finishing logs no console error. Test: `FolderPage.test.tsx` "shows a fresh form on f-2 while a save for f-1 is in flight"

## EmptyTrash (`frontend/src/features/bookmark-list/components/EmptyTrash.tsx`, tests in `EmptyTrash.test.tsx`)
- [x] Cancel and confirm are in `.modal-footer`, not in `.modal-body`; field and count text in `.modal-body`. Test: `EmptyTrash.test.tsx` "puts the buttons in the dialog footer"
- [x] Enter submits when phrase matches, does nothing otherwise. Test: `EmptyTrash.test.tsx` "submits on Enter only when the phrase matches"
- [x] While a request runs, Esc keeps dialog and typed text. Test: existing "disables everything while working…" gets a field-value assertion
- [x] 401 shows signed-out message. Test: existing "401: shows the signed-out message in the dialog", unchanged
- [x] Confirm click submits the form (form id/`form` attribute). Tests: existing success/failure tests
- [x] Esc/Cancel then reopen shows empty field (existing "closes on Esc and on Cancel…"); after a successful empty, reopen is empty. Test: `EmptyTrash.test.tsx` "shows an empty field when reopened after a successful empty"
- [x] Other existing tests pass with at most locator changes. Tests changed: none changed except one added assertion: "disables everything while working…" now also asserts the field keeps `empty trash` after Esc. No locators changed (the buttons are found by role/name, which still works in the footer).

## Repo-wide
- [x] `make check` passes (exit 0)
- [x] Only allowed paths changed
- [x] `make test-integration-local`: not run: frontend-only task, nothing under `backend/` touched

## Judgment calls
- The sidebar link is found with `{ name: /Travel/ }` because it may include a count in its accessible name.
- FolderPage tests render a route table with only `/folder/:id`, since the moves go through the sidebar.
- Checked by hand that removing the `key` fails four of the five new FolderPage tests (the search-keeps-text test is meant to pass either way). I did not re-break the EmptyTrash footer test.
- `canConfirm` lives in `EmptyTrash` (with `typed`); the submit handler's guard is inside `EmptyTrash`'s `onSubmit` callback.
- No browser: the footer staying in view on a short screen is not seen, only inferred from the buttons rendering in `.modal-footer`.
