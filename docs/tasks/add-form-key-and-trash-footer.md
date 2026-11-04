# Task: Add form key and empty-trash footer

Frontend only. One builder agent on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

Two small fixes that the verifiers of earlier tasks found and the user chose to track:

1. On a folder page, going from one folder to another no longer carries the half-typed URL, or a shown save failure, into the next folder's add field. Today the field is the same instance, so a URL typed for folder A can be saved into folder B.
2. In the "Empty trash?" dialog the Cancel and "Empty trash" buttons sit outside the scrolling body, so on a short screen they stay in view instead of scrolling away with the text. The dialog looks and behaves the same otherwise.

Requirements covered: none are numbered. Both are defects in finished tasks (`folder-sidebar`, `bookmark-actions`).

Out of scope, with the reason for each:
- The same footer problem in `EditBookmarkDialog` (`components/ui/`). It stays in the backlog, because this task must not touch `components/ui/` or `styles/` while `login-screen` runs.
- Scoping `.page form` in `styles/app.css`. Same reason; it stays in the backlog.
- Removing `SignedOutMessage` from `EmptyTrash` and `AddUrlForm`. That is the later "remove the per-screen signed-out UI" task; keep every signed-out line as it is.
- The home page (`/`): its add field has no folder, so nothing carries over.
- Any change to `Dialog.tsx`: it already has the `footer` prop this task uses.

## Role and ownership

Role: Frontend, see `AGENTS.md`.

You may change only:
- `frontend/src/pages/FolderPage.tsx` and `frontend/src/pages/FolderPage.test.tsx`
- `frontend/src/features/bookmark-list/components/EmptyTrash.tsx` and `EmptyTrash.test.tsx`

You may not change anything else under `frontend/`, anything in `backend/`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/add-form-key-and-trash-footer.plan.md`, see `AGENTS.md`), `package.json`, or the lockfile. In particular do not touch `components/ui/`, `styles/`, `app-shell/`, `test/setup.ts`, `AddUrlForm.tsx` or `request.ts`.

Shared files and running at the same time: this task shares no file with `login-screen`, which changes `App.tsx`, `request.ts`, `lib/api/loginRedirect.ts`, `useLogout.ts`, `test/setup.ts`, `styles/layout.css`, `lib/loginHref.ts` and new files under `features/login/` and `pages/LoginPage.tsx`. They can run together. It also shares nothing with `undo-restores-folder` or `logout-menu` (both in review). If `login-screen` is merged first, its `test/setup.ts` change applies to your tests automatically; do not edit that file.

## Operations used

None new. The add field already saves with `createBookmark` through `useSaveBookmark`, and the dialog already empties the trash through `useEmptyTrash`. This task changes no request and no hook.

## Behavior

### 1. Add field on a folder page

- `FolderPage` renders `AddUrlForm` with `key={id}` (the route's folder id), so React creates a new form when the id changes.
- On a change from folder `f-1` to folder `f-2` (a click on a folder in the sidebar, Back, Forward, or a link), the field is empty, any shown failure (invalid input, duplicate, error, signed-out) is gone, and a save in progress for `f-1` no longer shows on the new form: its input is not read-only (`AddUrlForm` makes the input `readOnly` while saving) and its button reads "Save", not "Saving…".
- A save already sent for `f-1` is not cancelled: it still completes and refreshes the list and the folder counts as today. Nothing it does after the form is gone may throw or warn in the console.
- The same folder id (a re-render, a sync refetch, a search change in the URL) keeps the typed text.
- `BookmarksPage` and everything else stay as they are.

### 2. Empty-trash dialog buttons

- The dialog's Cancel and "Empty trash" buttons are passed to `Dialog` through its `footer` prop, so they render in `.modal-footer` outside `.modal-body`. The `<form>` stays in the body with the text, the field and the failure banner; `Dialog` and every CSS rule stay as they are.
- The "Empty trash" confirm button is still a submit button for that form, linked to it with `id="empty-trash-form"` on the form and `form="empty-trash-form"` on the button (it is no longer inside the form). Pressing Enter in the field still submits when the phrase matches.
- What the user sees, in the same order and with the same wording, is unchanged: title "Empty trash?", the count text, the label "Type empty trash to confirm", the field, then Cancel and "Empty trash". The one visual difference: the footer now sits below `.modal-body`'s own bottom margin (`var(--space-4)`), so there is a little more space above the buttons. Accept it; do not change CSS.
- The submit handler keeps its guard: it does nothing unless the phrase matches and no request is running. The guard moves up with `typed`. Esc and the backdrop while a request runs do not clear `typed` (`Dialog` does not call `onClose` while `busy`).
- The typed text moves up into `EmptyTrash` (it is needed by both the field and the footer buttons). Closing the dialog by Cancel, Esc or a successful empty clears it, so reopening shows an empty field. This is the same as today, where the form unmounts on close.
- All existing rules hold: the confirm button is enabled only when the trimmed, lower-cased text equals `empty trash`; while the request runs the field, Cancel and confirm are disabled, Esc and the backdrop do nothing and a double click sends once; a failure keeps the dialog open with its text and the banner; a `401` shows the signed-out message in the dialog (unchanged for now).

### Known gaps

- A half-typed URL in a folder's add field is lost when the user leaves the folder and comes back. That is the intended result of the `key`.
- On a very short screen the dialog's text can still scroll inside `.modal-body`; only the buttons stay fixed.
- `EditBookmarkDialog` still has its footer inside the body (see Out of scope).

## Structure

- `FolderPage.tsx`: add the `key`. No other change.
- `EmptyTrash.tsx`: `EmptyTrash` owns the `typed` state and renders `Dialog` with `footer={...}`. `ConfirmForm` keeps the text, the field and the failure banner and loses the two buttons. Keep `CONFIRM_PHRASE` exported and keep the name `EmptyTrash`. Do not create a new file or a new shared component.

## Dependencies

None. Add nothing to `package.json`.

## Acceptance criteria

**`FolderPage` (`FolderPage.test.tsx`)**
- Type a URL into "Link to save" on `/folder/f-1`, go to `/folder/f-2` through the sidebar's "Travel" link, and the field is empty. It fails if the `key` is removed.
- With a failed save on `f-1` (mock `createBookmark` to reject with a 500, so the error banner shows), going to `f-2` shows no banner.
- Saving on `f-2` after the move sends `{ url, folder_id: 'f-2' }` once, and never sends a `folder_id: 'f-1'`.
- On the same folder, a change of the route's search keeps the typed text. Change it the way a user does: type in the "Search bookmarks" box and press Enter (which applies at once, with no timers), then check the URL has `q` and the add field still holds its text.
- A save that is still in flight when you move to `f-2` leaves the new form's input not read-only and empty, its button reading "Save", and finishing the save later does not log a console error. Wait for the "Travel" link with `findByRole` before clicking it. Resolve the mocked `createBookmark` inside `act` (or wait with `waitFor` for the refetch it triggers), spy on `console.error` and assert it was not called.

**`EmptyTrash` (`EmptyTrash.test.tsx`)**
- Cancel and "Empty trash" (confirm) are inside an element with class `modal-footer`, and neither is inside an element with class `modal-body`; the field and the count text are inside `modal-body`. It fails if the buttons go back into the form.
- Pressing Enter in the field submits when the phrase matches, and does nothing when it does not (in jsdom this proves the submit guard, not the disabled button).
- While a request runs, Esc keeps the dialog open and the typed text in the field (the existing "disables everything while working" test may assert the field value; add the assertion if it does not).
- A `401` still shows the signed-out message in the dialog body (the existing test, kept passing).
- Clicking confirm submits the form (the existing success and failure tests keep passing unchanged, except where they only change a locator).
- Closing by Esc or Cancel and reopening shows an empty field; this exists already, keep it passing. After a successful empty, reopening shows an empty field too (new test).
- Every other existing test in that file passes with at most locator changes. Say in the plan which tests you changed and why.

**Repo-wide**
- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

- Diff touches only the four files listed and the plan file. `git diff --stat` must show no `styles/`, `components/ui/`, `AddUrlForm.tsx` or `test/` change.
- For each new test, break the behavior and see it fail, then revert: remove the `key`; put the buttons back inside the form.
- Read `EmptyTrash.tsx` and confirm the submit button's `form` attribute equals the form's `id`, that `typed` is reset in `close()`, and that no signed-out line or wording changed.
- Inputs to try: move between folders three times with text in the field each time; fail a save, move, come back; open the trash dialog, type, press Esc, reopen; type the phrase in capitals with spaces; press Enter with the wrong phrase; a `429` with `Retry-After: 0`.
- The verifier has no browser. The "buttons stay in view on a short screen" outcome is checked by reading that the buttons are in `Dialog`'s `footer` and so render in `.modal-footer` after `.modal-body`; say so in the report instead of claiming it was seen.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, or an edit to a spec file (for example a CSS change to make the footer look right).
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, which test shows each behavior above, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle.
