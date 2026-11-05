# Task: edit the title and note in place on the bookmark page (front end)

> Front end. One frontend agent builds it on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.
>
> `bookmark-actions` (merged) chose to edit on the bookmark page through the same dialog as the list, and recorded that the design reference edits in place. This task adds the in-place editing. The server and the contract do not change.

## Goal

A signed-in user who opens a live bookmark can click its title or its note on the bookmark page, type, and have the change saved when they leave the field (or press Enter in the title), without opening a dialog. A bookmark with no note shows an empty note field, so a note can be added from the page. The "Edit" button and its dialog stay on the page as a second way to edit.

Requirements covered: FR-8 (edit the title and the note; add, change and clear a note, from the page), FR-21a (a trashed bookmark's page stays read-only), NFR-14 (title 300 and note 500 characters, shown to the user as a counter and a message, and never sent over the limit).

Out of scope, and why:

- **Autosave while typing.** The user chose save on blur or Enter. No timers, no debounce.
- **The list row's "Edit title & note" dialog** (`BookmarkRow`, `BookmarkEditor`) and **the dialog itself** (`EditBookmarkDialog`). They keep their behavior, wording and tests.
- **Removing the "Edit" button from the bookmark page.** The user chose to keep it next to the inline fields.
- **Moving** (the "Move" button, `MoveBookmarkDialog`), **Delete**, **Restore** and the trashed view's banner text. Unchanged.
- **The bookmark page following changes made on another device.** The sync poll refreshes lists and folders only, and the page's own query polls only while a fetch is `pending`. This task does not change either.
- **Editing the URL.** Never allowed (the contract has no such field).
- **Warning about unsaved text when the user closes the tab.** A typed value is committed on blur; closing a tab with the cursor still in a field loses it. Not handled.

## Role and ownership

Role: Frontend (see `AGENTS.md`).

You may change `frontend/**` except `package.json`, `package-lock.json`, `README.md` and any stylelint configuration. You may not change `backend/**`, `openapi.yaml`, `docs/**` (except your own plan file, `docs/tasks/detail-inline-edit.plan.md`, see `AGENTS.md`), the Makefile, or `frontend/src/lib/api/schema.d.ts` (generated).

**Shared files.** `worker-proxy` is verified and touches only the Worker and tooling; nothing overlaps. No other front-end task is planned alongside this one. You change:

- `features/bookmark-detail/components/BookmarkView.tsx` and its test.
- `lib/bookmarks/useEditBookmark.ts` and its test. The hook is also used by `BookmarkEditor` (the list row's dialog) and by the bookmark page's dialog; both must behave exactly as before.
- `features/bookmark-detail/hooks/useBookmark.ts` and its test, only to also return `isFetching` (see Structure). Its polling and its other results do not change.
- `lib/bookmarks/editChanges.ts` and its test, only to add what the in-place fields need (see Structure). `EditBookmarkDialog` uses `computeChanges` and `overLimits`; their behavior does not change.
- `styles/layout.css`, only to add rules for the new fields.

You do not change `EditBookmarkDialog`, `BookmarkEditor`, `BookmarkRow`, `describeFailure`, `useBookmarkFeedback`, `app-shell/`, `components/ui/*` or `src/test/setup.ts`. If you think one of them must change, stop and ask.

## Operations used

Real on the server today.

- `getBookmark` (`GET /api/v1/bookmarks/{id}`, `BookmarkDetail`): unchanged. The page still reads it through `useBookmark`.
- `updateBookmark` (`PATCH /api/v1/bookmarks/{id}`, `200` with `BookmarkSummary`): one call per committed field, with only that field in the body (`{ title }` or `{ note }`, never `folder_id`, never both). `note: null` is sent as an explicit `null` and clears the note. The wrapper in `lib/api/bookmarks.ts` already does this. The server answers `404 not_found`, `409 bookmark_in_trash`, `401`, `429` with `Retry-After`, and `422 validation_error` with `too_long` (not reachable when the limits below are enforced first). The contract also lists `403` (CSRF), `413` and `415`; the request layer sends the CSRF token whenever its cookie exists, so a `403` is unlikely, and if any of them arrives it is "anything else" in the failure table.

Types come from `src/lib/api/schema.d.ts`; write no second copy. Mock exactly the answers above in tests.

## Behavior

### What the page shows

**Live bookmark** (`deleted_at` is null). The header and the note section become fields:

- **Title.** An `<input type="text">` inside the page's `<h1>` (so the page keeps its level-1 heading), with the accessible name "Title" given by `aria-label`. It shows the stored title. When the stored title is empty (or only spaces) the field is empty and its placeholder is the host name of the URL (`hostOf`), or the whole URL when it cannot be parsed. That is the same fallback the page shows today for an empty title, and it also covers a pending fetch.
- **Note.** A `<textarea>` with a visible label "Note", always shown, even when the stored note is `null` or `''`. Placeholder "Add a note…". Three rows, as in the design reference.
- **Counters.** The note shows `n/500` under the field at all times. The title shows `n/300` only while the field has focus or is over the limit. A count is in code points of the text as typed, except that the title is counted trimmed (as in the dialog); use `codePointLength`. Over the limit (by `overLimits`), the counter gets the class `field__meta--over`. A note of only spaces is never over the limit: its counter shows the raw count (it can read `600/500`), without `field__meta--over` and without a message, and it is sent as `null`.
- **Status.** Each field has its own polite live region (`role="status"`) next to its counter. It says `Saving…` while that field's save is in flight, and `Saved` for 2 seconds after it succeeds, then it is empty. The timer is cleared on unmount and when a new edit starts.

The "Edit", "Move" and "Delete" buttons, the facts, the page text and everything else on the page stay as they are.

**Trashed bookmark.** Exactly as today: the `<h1>` shows the title as text (host name when empty), no inputs, the note shown as text only when it is not `null` (an empty-string note still shows its section), the "In trash" banner and "Restore". Nothing on the page is editable. If a live bookmark becomes trashed while the page is open (after a refetch), the fields turn into this read-only view and any typed, unsaved text is dropped.

### Editing a field

A field is **touched** from the first change the user types until its text is saved, reverted or dropped. A touched field shows the text as typed; an untouched field shows the stored value from the page's query.

**Commit.** The title commits on blur and on Enter. The note commits on blur only; Enter in the note inserts a line break. A commit:

1. Works out the change with the existing rules (`computeChanges`), against the field's baseline (see below; normally the stored value): the title is trimmed and compared trimmed; a note that is empty or only spaces becomes `null` when the stored note is not `null`; a note equal to the stored one, or empty while the stored note is `null`, changes nothing. Only the field being committed is compared (the other field is treated as unchanged), and only it is sent.
2. If nothing changed: no request. The field stops being touched and shows the stored value (so a title typed as `  Hello ` over a stored `Hello` goes back to `Hello`).
3. If the field is over its limit (title 300 and note 500 code points; a spaces-only note is never over): no request. The field stays touched, shows the message "Title is too long (300 characters at most)." or "Note is too long (500 characters at most)." under the field, and the message goes away as soon as the text is within the limit. This uses `overLimits` and the same texts as the dialog (`TITLE_MAX`, `NOTE_MAX`).
4. Otherwise sends `updateBookmark(id, { <field>: value })`.

Limits at the boundary: a title of exactly 300 code points and a note of exactly 500 are sent; 301 and 501 are not. An emoji counts as 1.

**The baseline.** Each field has a baseline: the text its commits are compared against. Normally it is the stored value from the page's query. After a successful save it is the saved text (as sent: the trimmed title, or the note as sent; a note sent as `null` counts as `''`, since a stored `null` and an empty field are the same), and it stays so until the page's query has finished the fetch that the save started, whether that fetch succeeded or failed; then the baseline goes back to the stored value. The signal is `isFetching`, which `useBookmark` now also returns: the save's refresh starts the fetch (and replaces a poll that was already in flight, so a stale poll cannot slip in), and the field releases the saved text when `isFetching` turns false again after it was true following the save. If no fetch ever started (the query was not active), release at once. Commits (step 1 above), Esc and the "unchanged" check all use the baseline, never the stale stored value.

**While a save is in flight** the field stays editable and shows what was typed. Each field has its own save, so leaving the title and then leaving the note sends two requests, and a slow title save never blocks the note. A second commit of the same field while its first save is in flight does nothing (the hook already ignores it); the user's later text stays touched and is committed by the next blur or Enter.

**On success.** The page refreshes through the hook (`useBookmarkFeedback().refresh`, which invalidates every list, `['bookmark', id]` and the folder list) and shows no toast. The field must never show the old stored value in between (nothing is written to the cache by hand; the baseline above holds the saved text in the component). If the user typed more into the field after the commit that started this save, the field keeps that later text and stays touched (it is compared with the new baseline and committed by the next blur or Enter); if the text is unchanged since the commit, the field stops being touched and shows the baseline. After the refresh the baseline is the stored value again. A cleared note shows an empty field, not a missing one. The status shows `Saved` for 2 seconds.

**On Esc.** Esc in a field reverts it to its baseline, clears its error and its touched state, and leaves the focus where it is. Esc sends no request and does nothing to a save already in flight: during a save the baseline is the previous baseline, and when that save succeeds the baseline becomes the saved text, and an untouched field shows it. (The Esc inside the Edit dialog stays the dialog's own.)

**A refetch while a field is touched.** The page can refetch while the user types: the pending-fetch poll every second (the first 30 seconds) and then every 5 seconds, and the refresh after another field's save. A refetch never replaces the text of a touched field, never moves the cursor, never changes focus, and never clears a field's error. An untouched field follows the refetched value, so a title filled in by the server's page fetch (FR-5b) appears in an untouched title field without a reload. If the user typed into the title while it was empty and the fetch fills it meanwhile, the typed text stays; committing it overwrites the fetched title (last write wins, NFR-2).

**Failures.** The save's failure is described by `describeFailure(error, 'edit')` through the hook. Every message below is final wording and is shown under the field that failed, in `field__error` with `role="alert"`, and it stays until the user changes the text, presses Esc, or the next commit of that field starts. The field stays touched with the typed text, so the next blur or Enter retries it.

| Failure | Shown under the field |
|---|---|
| `422 too_long` on `title` | "Title is too long (300 characters at most)." (under the title) |
| `422 too_long` on `note` | "Note is too long (500 characters at most)." (under the note) |
| `409 bookmark_in_trash` | "This bookmark is in the trash and can't be edited." |
| `404` | "This bookmark no longer exists." |
| `401` | nothing: the login redirect is on its way and the hook is silent |
| `429` | `rateLimitMessage(retryAfter)` as it is today: "Too many requests. Try again in about N seconds." when `Retry-After` is a whole number of seconds (so "about 1 seconds" and "about 0 seconds" read that way; the 0-second case is a `folder-sidebar` line in the backlog), otherwise "Too many requests. Try again in a moment." |
| anything else, including a network failure | "Couldn't save your changes." |

For `404` and `409` the hook refreshes, and the page then becomes "Bookmark not found" or the read-only trashed view, which removes the fields and their messages. So for these two only, the same message is also shown as an error toast (`useToast().show(message, { tone: 'error' })`), so the user is told after the field is gone. For every other failure no toast is shown. The toast is shown once per failed request, by the inline field's commit as soon as `save` resolves with a failed result whose status is `404` or `409` (not from an effect of the field, which may already be unmounted), and a retried request that fails again shows its own toast. The dialog's behavior does not change.

**Order of messages.** A field shows one message at a time: the over-limit message wins over a failure from the hook. The component clears the hook's failure (`reset`) when the text changes, on Esc and when a new commit starts.

**Enter in the title.** Enter commits the title and the focus stays in the field. A blur after that is another commit of the same field: it does nothing while the first save is in flight, and nothing after it (the text then equals the stored value). Shift+Enter in the title does the same as Enter. Enter pressed while an input method is composing text (`isComposing`) does nothing, as in `useListSearch`.

**Edit button.** It opens the existing dialog, prefilled from the stored values, as today. The click blurs the field the user was in, so that field commits first like on any blur. Then, pressing Edit drops the typed text of any field that is still touched and not in flight (an over-limit draft, which sent nothing; "in flight" is judged when the Edit click handler runs, after the blur commit has started): the dialog starts from the stored values. A save already in flight, including one the blur just started, is left to finish. How the dialog reaches the fields to drop their text is the builder's choice. The dialog's own save, messages and "Saved." toast do not change.

### Known gaps

- **Delete or Move right after typing.** Clicking Delete blurs the field first, so the edit is sent and then the delete; the two requests can reach the server in either order. If the delete wins, the edit answers `409` and the user sees the toast above. Not guarded.
- **The dialog after an inline commit.** Typing in the title and pressing Edit sends the inline save and opens the dialog at the same moment. The dialog starts from the stored values, which may still be the old ones until the save is refreshed. If the user then saves the dialog without changing the title, it is not sent (nothing changed against the refreshed props), but if they edit it, last write wins. Not guarded.
- **Two tabs.** An edit in another tab does not appear in this page's untouched fields until something refetches this bookmark (a save here, or the pending poll). That is how the page works today.
- **A title that is only spaces** is sent trimmed, as `''`, as in the dialog. The server stores it as empty, so it shows as the host-name placeholder afterwards, and a page fetch still in progress may fill it (FR-5b fills empty titles).

## Structure

By `ARCHITECTURE.md` and `CONVENTIONS.md`. The in-place fields are feature-local to `bookmark-detail`; nothing is promoted.

- `features/bookmark-detail/components/`: new `EditableTitle.tsx` and `EditableNote.tsx` (one component per field, each owning its typed text, touched state, status and error, and each using its own `useEditBookmark` instance, which is what makes the two saves independent). `BookmarkView.tsx` renders them for a live bookmark and keeps its read-only rendering for a trashed one. Keep `BookmarkView` readable: the fields do not go inline in `BookmarkDetailBody`.
- `features/bookmark-detail/hooks/`: one hook for the shared field behavior, used by both fields (touched text, commit, Esc, the baseline rule, the 2-second `Saved` status), with a colocated test (`CONVENTIONS.md`: one hook per concern). It returns semantic mutators and the values to render (typed text, `onChange`, `commit`, `revert`, status, error), not raw setters. The two components stay thin.
- `lib/bookmarks/useEditBookmark.ts`: two changes, both backward compatible. (1) An option so the in-place fields can save quietly: `useEditBookmark(id, { toastOnSave: false })` skips the "Saved." toast; the default stays `true`. (2) `save` resolves to a result instead of a boolean, with four outcomes: saved; ignored (a save of this instance was already in flight); unauthorized (a `401`, the hook stays silent as today); failed, carrying the `FailureDisplay` and the HTTP status (or `null` for a network failure). `BookmarkEditor` and the dialog on the page treat "saved" as the old `true` and everything else as `false`; their tests pass unchanged. The inline fields use the result: they show the failure under the field and, for a failure whose status is `404` or `409`, show the toast described under Failures. `pending`, `failure` and `reset` stay as they are; each field has its own instance.
- `features/bookmark-detail/hooks/useBookmark.ts`: also returns `isFetching` (the query's own flag). Nothing else changes: not the polling, not the other results.
- `lib/bookmarks/editChanges.ts`: add only what the fields need, for example a helper that compares one field. Do not change what `computeChanges`, `overLimits` and `codePointLength` return. `EditBookmarkDialog` must not change.
- `styles/layout.css`: add `detail-page__title-input` (the reference's rules: 20px, weight 600, transparent background, a bottom border that turns to the accent colour on focus; copy the CSS rules only from `docs/design/ui-reference/src/styles/layout.css`, never a `.tsx` file) and what the note field and the status line need. Reuse `.input`, `.textarea`, `.field__label`, `.field__meta`, `.field__meta--over` and `.field__error`. Use tokens, not literal colours; `make check` runs stylelint.
- The status texts (`Saving…`, `Saved`) and the two over-limit messages are exported constants in the feature (`features/bookmark-detail/lib/`), where tests and components share them. The over-limit messages are built from the existing exported `TITLE_MAX` and `NOTE_MAX` (`lib/bookmarks/describeFailure.ts`). `describeFailure.ts` and `EditBookmarkDialog.tsx` are not changed, so their own copies of those two sentences stay as they are; the texts must read the same.

## Dependencies

None. Nothing is added to `package.json`.

## Acceptance criteria

All tests mock `lib/api/bookmarks` (no network), as `BookmarkView.test.tsx` does, and use its fake-timer helpers. Every test below must fail if the behavior is removed.

**Live page: what is shown (`BookmarkView.test.tsx`)**

- A live bookmark has an input named "Title" holding the stored title and a textarea labelled "Note" holding the stored note. A `null` note and an `''` note both give an empty textarea with the placeholder "Add a note…". The page has an `<h1>` that contains the title input.
- An empty title (and one of only spaces) gives an empty input whose placeholder is the host name; an empty title with an unparseable URL gives the whole URL as the placeholder.
- Markup in the title and the note is the field's value as text: `<i>t</i>` and `<u>n</u>` appear as typed, with no elements created.
- A trashed bookmark has no input and no textarea, its `<h1>` shows the title as text (host name when empty), the note shows only when not `null`, and an empty-string note still shows its section. (These are the current tests for the trashed view; keep them and move the live-view ones to the new rules.)
- The note counter shows `0/500` for an empty note and `n/500` as the user types; the title counter is absent when the title is not focused and not over, shown as `n/300` when focused, and shown with `field__meta--over` when over.

**Committing (`BookmarkView.test.tsx`, with the fake server used by the existing action tests)**

- Title: type a new value and blur: `updateBookmark` is called once with `('b-1', { title: 'New title' })` and nothing else in the body. The same with Enter instead of blur. The page shows the new title after the refresh, and no "Saved." toast is shown.
- Title typed as `  Hello ` over a stored `Hello`, then blur: no request, and the field shows `Hello`.
- Note: type a value and blur: `updateBookmark('b-1', { note: 'text' })` only. Enter in the note inserts a line break and sends nothing. Clearing a stored note and blurring sends `{ note: null }`; a spaces-only note over a stored note sends `{ note: null }`; a spaces-only or empty note over a `null` note sends nothing.
- A note edited and the title left alone sends no `title`; leaving the title then the note sends two calls, each with one field.
- Boundaries: title of 300 code points is sent, 301 is not; note of 500 is sent, 501 is not; 300 emoji count as 300. A 301-character title and a 501-character note show the over-limit messages, send nothing on blur, keep the typed text, and the message disappears when the text is cut to the limit.
- While the first save of a field is in flight, a second blur of that field sends nothing; the other field's save still goes out.

**Status and the old value (`BookmarkView.test.tsx`)**

- `Saving…` shows while the call is pending; after success `Saved` shows, and 2 seconds later (fake timers) it is gone. Each field has its own status. Unmounting the page clears the `Saved` timer (assert it with a spy on `clearTimeout`; advancing timers after unmount proves nothing, because React does not throw on it).
- After a successful save, with `getBookmark` held back (its promise unresolved), the field shows the saved text, never the previous stored value; when `getBookmark` answers, it shows the refreshed stored value. (Fails if the component drops its text on success.)

**Refetch while editing (`BookmarkView.test.tsx`)**

- With a pending bookmark whose poll later answers a different title, an untouched title field shows the new title; a touched title field keeps the typed text, the same for the note, and its error message stays.
- A refetch triggered by the title's save does not replace text typed meanwhile into the note.
- Focus stays in the field being typed in across a refetch.

**Esc and failures (`BookmarkView.test.tsx`)**

- Esc in a touched field restores the baseline text and removes its error; Esc sends no request. Esc then blur sends nothing. Esc while a save is in flight, then the save succeeds: the field shows the saved text and sends nothing more.
- Typing more into a field after the blur that started its save, then the save succeeds: the field keeps the later text and is touched; the next blur sends only the later text, once. Typing the previous stored value back after a successful save (while the refetch is held back) sends a request, because the baseline is the saved text.
- Enter in the title, then blur right after, with the first save pending: one request in total.
- For each row of the failure table: the message is under the right field (`role="alert"`), the typed text is kept, and the next blur sends the request again. `422` on `title` shows under the title only, and on `note` under the note only. A `401` shows nothing under the field and no toast. A `429` with `retryAfter` 5 shows "about 5 seconds"; with none, "in a moment". A network failure (`TypeError`) shows "Couldn't save your changes.".
- `404` and `409 bookmark_in_trash`: the same text is also shown as an error toast, and after the refresh the page is the "Bookmark not found" panel or the read-only trashed view (with the toast still on screen). No other failure shows a toast.
- A live bookmark that becomes trashed in a refetch while the note holds typed text shows the read-only view, with no input and no typed text; the same with typed text in the title.

**Edit button (`BookmarkView.test.tsx`)**

- The existing dialog tests keep passing (prefilled from the stored values, the "Saved." toast, a cleared note disappears; update the assertions that assumed a missing Note section: a cleared note now leaves an empty textarea).
- With 501 characters typed in the note (over the limit, so blur sent nothing), pressing Edit opens the dialog with the stored note, and the inline field is no longer touched.
- With a note whose save failed (for example `500`) and is touched, pressing Edit sends the same save again (the blur is a commit), and the dialog still opens.

**`useEditBookmark` (`useEditBookmark.test.tsx`)**

- `toastOnSave: false` shows no "Saved." toast on success, and still refreshes; the default still shows it. All other behavior (failures kept, 401 silent, one call in flight) is unchanged and its existing tests pass.
- `save` resolves to saved on success, ignored for a second call while one is in flight, unauthorized on a `401`, and failed with the display and the status for a `404`, a `409` and a network error (status `null`).

**`useBookmark` (`useBookmark.test.tsx`)**

- `isFetching` is true while a fetch is in flight and false when it is done; the existing polling tests pass unchanged.

**`editChanges` (`editChanges.test.ts`)**

- Any new helper has table tests for the cases in "Committing" step 1 (trimmed title, note to `null`, equal values, spaces-only). The existing tests are unchanged and pass.

**Unchanged behavior, still pinned by the existing tests**

- `BookmarkEditor` and `EditBookmarkDialog` tests pass untouched.

**Existing tests in `BookmarkView.test.tsx` that change.** A live title now sits in an input's value, not in text, and the live page always has a "Note" label. These existing tests are rewritten, not left alone:
- Every `getByText('An example')` / `queryByText('An example')` on a live bookmark (the "later polls" tests, the failed-Delete test): read the title through the "Title" input's value (`getByRole('textbox', { name: 'Title' })`). A `queryByText('An example')` that is meant to prove the page is gone becomes a check that the "Bookmark not found" panel shows and the input is absent.
- Every `heading level 1 toHaveTextContent(title)` on a live bookmark (the title tests, the markup test, the edit test): read the input's value. The trashed view's heading assertions stay.
- The tests built on `queryByText('Note')` / `getByText('Note')` (null note, empty-string note, cleared note after an edit): rewritten to the new rules (an empty textarea, never a missing section, for a live bookmark).
- The edit-dialog test uses `getByLabelText('Title')` and `getByLabelText('Note')`, which the inline fields now share: scope those queries to `getByRole('dialog', { name: 'Edit bookmark' })`. Likewise scope any `Saved` and status query: the facts row has a "Saved" label and the toast region is also `role="status"`.
- "shows the note only when it is not null" (`getByText('remember this')`) and the markup test's `getByText('<u>n</u>')`: a textarea's value is not text, so read the textarea's value.
- The two title tests that expect the host name in the heading for an empty title (host name, and the whole URL for an unparseable one): the live input's value is `''` and the host is its `placeholder`, so assert `toHaveAttribute('placeholder', …)`. The trashed view still shows the host name as heading text.
Every other test in the file (Delete, Move, Restore, fetch states, errors, trashed view) keeps its assertions, apart from the title and note reads above.

**Test mechanics.** These files use fake timers, so use `fireEvent` (`TESTING.md`). `fireEvent.click` on a button does not blur the focused field in jsdom: fire `blur` (and call `.focus()` where a test needs focus, such as the title counter or focus staying across a refetch) explicitly.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

- Read the diff: `EditBookmarkDialog`, `BookmarkEditor`, `BookmarkRow` and `describeFailure` are untouched; `useEditBookmark` differs only by `toastOnSave` and the result of `save`, and its default behavior for the two dialog callers is the same; `useBookmark` differs only by returning `isFetching`; `editChanges` differs only by additions.
- Each field has its own `useEditBookmark` instance (two instances, not one shared). Confirm a slow title save cannot make the note's commit a no-op.
- The body of every inline call has exactly one key (`title` or `note`). `folder_id` is never sent from the fields.
- In the new code, no timers other than the 2-second `Saved` status, which is cleared in the effect's cleanup. No debounce, no interval (the page's existing poll in `useBookmark` is not part of this).
- Nothing writes the query cache by hand (`setQueryData`, `setQueriesData`): the "old value never shows" rule is held in component state.
- No `dangerouslySetInnerHTML`; the title and note go in as values.
- The touched rule: find, in the code, the place that decides whether a field shows typed text or the stored value, and confirm a refetch cannot replace typed text. The refetch tests pin it.
- Confirm the tests discriminate: in a scratch copy, (a) send both fields in one call, (b) drop the typed text on success, (c) let a refetch overwrite a touched field, (d) skip the over-limit check, (e) show the toast for a `422`, (f) stop clearing the `Saved` timer; each must turn a test red. Revert them.
- Check by reading that the field's blur handler and the Esc handler cannot both send a request (Esc then blur sends nothing, because the text equals the stored value).
- Inputs to try to break it with: a title of 300 and 301 multi-byte characters; a note of 500 and 501; a title of only spaces; a note of only spaces over a stored note; Enter in the title then blur right after (one request, not two); Esc then blur; blur while the first save of the same field is pending; type during the pending-fetch poll; `404` and `409` on the first and on a retried save; `401` on save; `429` with and without `Retry-After`; a network failure; Edit pressed with a touched field; the bookmark trashed from another device while a field holds text; unmount while a save is in flight (no thrown error, no unhandled rejection).

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, or an edit to a spec file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for, or the "never show the old value" rule cannot be held without writing the cache by hand.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `npm ci` in `frontend/` first on a fresh checkout, run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (with the test that shows each), the known gaps, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle. Run each test file that uses timers or navigation several times before ticking it, so a flaky test is found by you rather than by the verifier.
