# Plan: add form key and empty-trash footer

## FolderPage (`frontend/src/pages/FolderPage.tsx`, tests in `FolderPage.test.tsx`)
- [ ] Typed URL is gone after moving f-1 → f-2 via the sidebar "Travel" link. Test: `FolderPage.test.tsx` "clears the add field when moving to another folder"
- [ ] A shown save failure (500 banner) is gone on f-2. Test: `FolderPage.test.tsx` "drops a shown save failure when moving to another folder"
- [ ] Save on f-2 after the move sends `{ url, folder_id: 'f-2' }` once, never `f-1`. Test: `FolderPage.test.tsx` "saves into the new folder after moving"
- [ ] Same folder, search change in URL keeps typed text. Test: `FolderPage.test.tsx` "keeps the typed text when only the search changes"
- [ ] In-flight save on f-1: f-2 form not read-only, empty, button "Save"; finishing logs no console error. Test: `FolderPage.test.tsx` "shows a fresh form on f-2 while a save for f-1 is in flight"

## EmptyTrash (`frontend/src/features/bookmark-list/components/EmptyTrash.tsx`, tests in `EmptyTrash.test.tsx`)
- [ ] Cancel and confirm are in `.modal-footer`, not in `.modal-body`; field and count text in `.modal-body`. Test: `EmptyTrash.test.tsx` "puts the buttons in the dialog footer"
- [ ] Enter submits when phrase matches, does nothing otherwise. Test: `EmptyTrash.test.tsx` "submits on Enter only when the phrase matches"
- [ ] While a request runs, Esc keeps dialog and typed text. Test: existing "disables everything while working…" gets a field-value assertion
- [ ] 401 shows signed-out message. Test: existing "401: shows the signed-out message in the dialog", unchanged
- [ ] Confirm click submits the form (form id/`form` attribute). Tests: existing success/failure tests
- [ ] Esc/Cancel then reopen shows empty field (existing "closes on Esc and on Cancel…"); after a successful empty, reopen is empty. Test: `EmptyTrash.test.tsx` "shows an empty field when reopened after a successful empty"
- [ ] Other existing tests pass with at most locator changes. Tests changed: (filled in below)

## Repo-wide
- [ ] `make check` passes
- [ ] Only allowed paths changed
- [ ] `make test-integration-local`: not run: frontend-only task, nothing under `backend/` touched
