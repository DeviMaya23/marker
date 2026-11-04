# Verification report: add-form-key-and-trash-footer

Branch: `claude/verify-form-key-trash-footer-h3ks9b` (reset onto builder branch `claude/add-form-key-trash-footer-76y386` at 451902b, plus the verifier commit)

`make check`: passed (exit 0) at the end of verification: 76 test files, 981 tests, with the one test I added.
Integration tests: **not run**. The task is frontend-only and nothing under `backend/` changed. No criterion depends only on integration tests.
No browser: "buttons stay in view on a short screen" is checked by reading that the buttons are passed through `Dialog`'s `footer` prop, so they render in `.modal-footer` after `.modal-body`. I did not see it on a screen.

## Acceptance criteria

| Criterion | Test (file) | Really exercises it? | Verdict |
|---|---|---|---|
| Typed URL gone after f-1 → f-2 via "Travel" link | "clears the add field when moving to another folder" (FolderPage.test) | Yes. Fails with the `key` removed (mutated, saw it fail) | Met |
| Failed save (500) banner gone on f-2 | "drops a shown save failure when moving to another folder" | Yes. Fails without `key` (mutated) | Met |
| Save on f-2 sends `{url, folder_id:'f-2'}` once, never f-1 | "saves into the new folder after moving, never into the old one" | Yes. Fails without `key` (old text would be saved) | Met |
| Same folder, search change keeps text | "keeps the typed text when only the search changes" | Partly meaningful. It asserts the list was called with `q:'soup'` rather than reading the URL, which the criterion names; equivalent in effect. It passes with or without `key` by design (guards against over-keying, e.g. keying on search) | Met |
| In-flight save for f-1: f-2 form not read-only, empty, "Save"; finishing logs no console error | "shows a fresh form on the new folder while a save for the old one is in flight" | Yes. Fails without `key` (mutated). Resolves inside `act`, waits for the refetch, spies `console.error` | Met |
| Cancel/confirm in `.modal-footer`, not in `.modal-body`; field and count text in body | "puts Cancel and confirm in the footer, outside the body…" (EmptyTrash.test) | Yes. Fails when the buttons are put back in the form (mutated) | Met |
| Enter submits on matching phrase, nothing otherwise | "submits on Enter only when the phrase matches" | Yes. Proves the submit guard (wrong phrase: no call; right phrase: one call) | Met |
| While running, Esc keeps dialog and typed text | "disables everything while working, ignores Esc…" with the added field-value assertion | Yes | Met |
| 401 shows signed-out message in dialog | existing 401 test, unchanged | Yes | Met |
| Confirm click submits the form | existing success and failure tests | Yes. They only pass if the `form` attribute matches the form `id` (they failed in my mutation when the wiring was broken) | Met |
| Esc/Cancel then reopen is empty; after successful empty, reopen is empty | existing "closes on Esc and on Cancel…" and new "shows an empty field when reopened after a successful empty" | Yes | Met |
| Other existing tests pass with at most locator changes | whole file passes; plan lists one added assertion, no locator change | Yes (diff shows only additions to tests) | Met |
| `make check` passes | run | n/a | Met |
| Nothing outside allowed paths changed | `git diff --stat` | Only the 4 allowed files and the plan file | Met |

## Plan check

- Every criterion in the task file appears in the plan. No criterion missing.
- Every ticked item has a test and the test checks the behavior. Test-name drift (non-blocking): the plan names three tests differently from the code: "puts the buttons in the dialog footer" (code: "puts Cancel and confirm in the footer, outside the body…"), "shows a fresh form on f-2 while a save for f-1 is in flight" (code: "…on the new folder… old one…") and "saves into the new folder after moving" (code: "…never into the old one").
- The plan says "I did not re-break the EmptyTrash footer test". I did: it fails when the buttons are back in the form.
- The plan's integration line says "not run: frontend-only", which agrees with my run decision.
- Plan vs diff: no other difference. The plan's "judgment calls" match the code (`canConfirm` and `typed` live in `EmptyTrash`).

## Rule checks

- Only `handler/` imports `internal/api`: no backend change; n/a.
- Repository queries filter by `user_id`: no backend change; n/a.
- `users.version` incremented in write transactions: no backend change; n/a.
- `go.mod`, `go.sum`, `package.json` and the lockfile: unchanged. No dependency added.
- Verifier checks from the task file:
  - Diff touches only the four files plus the plan; no `styles/`, `components/ui/`, `AddUrlForm.tsx` or `test/` change. OK.
  - Mutations: removing `key` fails 4 of the 5 new FolderPage tests (the search test is meant to pass either way); putting the buttons back in the form fails the footer test and others. Source was restored afterwards (`git status` clean for source).
  - `EmptyTrash.tsx`: the button's `form={FORM_ID}` equals the form's `id={FORM_ID}` (`'empty-trash-form'`); `typed` is reset in `close()`; no signed-out line or wording changed; `CONFIRM_PHRASE` still exported; no new file.
  - Inputs tried: three moves with text each time (added test, passes, including back to a visited folder); fail, move, come back (covered by `key`: new instance each time); open, type, Esc, reopen (existing test); capitals and spaces (existing test "ignoring case and surrounding spaces"); Enter with the wrong phrase (new test); `429` (existing table row in EmptyTrash.test, unchanged hook).

## Findings

Blocking: none.

Non-blocking:
1. Plan test names differ from the code (see Plan check).
2. The search-keeps-text test checks the list request (`q:'soup'`), not the URL, as the criterion words it. Equivalent in effect.
3. `FolderPage.test.tsx` is not Prettier-formatted as committed (it was not before this task either; `make check` does not enforce it). I did not reformat it, to avoid a 600-line diff.

Test I added: "starts empty on every move, including back to a folder already visited" in `FolderPage.test.tsx`. No source changed.
