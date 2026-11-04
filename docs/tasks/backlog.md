# Backlog

What is not built yet, and loose ends from verifier reports. The user decides the order and turns an item into a task file (`docs/tasks/TEMPLATE.md`). Fix rounds append non-blocking findings at the bottom, one line each, as `- [<task slug>] finding`.

State as of `main` at `fa33b97`: three of the 17 operations are real (`createBookmark`, `getBookmark`, `listBookmarks` for the live list and trash). The other 14 are 501 stubs.

## Backend: operations not built

| Area | Operations | Requirements |
|---|---|---|
| Edit and trash | `updateBookmark` (title, note, move to a folder), `deleteBookmark`, `restoreBookmark`, `emptyTrash` | FR-8, 15, 17, 19, 20 |
| Folders | `listFolders`, `createFolder`, `updateFolder` (rename, move), `deleteFolder` | FR-12 to 16, 26 |
| Search | `q`, `include_notes` and `folder_id` on `listBookmarks` (they answer 501 now) | FR-9, 10, 11, NFR-10 |
| Sync | `getSyncVersion` | NFR-2 |
| Favicons | `getFavicon` (icons are fetched and stored but never served) | FR-5 |
| Auth | `authLogin`, `authCallback`, `authLogout` (real Kinde login; only dev-login works) | FR-1, 2 |
| Account | `deleteAccount` | FR-25, NFR-3 |

## Backend: cross-cutting

- Rate limiting: 30 saves per minute per user, login routes per IP, a generous ceiling elsewhere, sync poll exempt (NFR-16). Not built at all.
- `internal_error` is missing from the contract's error codes.
- Update `CONVENTIONS.md` rule 2 with the exception for the fetch job's lookup by bookmark id (no `user_id`).
- Kinde "Phase B": needs the Kinde domain, client ID and registered URLs. The client secret goes in a gitignored `.env`, never in chat or the repo.

## Frontend: screens and features not built

Numbered as in the design brief (`docs/design/ui-reference/ui-design-brief.md`).

1. Login screen (screen 1), and a way to learn you are signed out without waiting for a 401 (FR-3c, needs a who-am-I endpoint, which does not exist).
2. Sidebar and folders (screen 2): folder tree, create, rename, move, delete with the counted confirmation (FR-16), the mobile drawer.
3. Top bar search: search field, scope control (all or this folder), "include notes" toggle.
4. Row actions: open link, edit title and note, move, delete.
5. Bookmark page editing (screen 3): editable title, note with the 500-character counter, folder change, delete.
6. Trash actions (screen 4): Restore (goes to the top level) and Empty trash with its strong confirmation.
7. Account area (screen 6): account menu, log out, bookmarklet install page, delete account.
8. Background sync: the 5-second poll that refreshes the list and folders without moving the scroll position.
9. The "1,000 bookmark limit reached" message on the list.

## Loose ends from verifier reports

- Check in a real browser: on a tall screen with a short first page, the list may not request page 2, because `IntersectionObserver` fires only when visibility changes (`bookmark-list` report, finding 1). Not reproducible in jsdom.
- `bookmark-list`: a failed refresh with rows on screen says "Couldn't load more."; the wording is slightly off.
- `bookmark-list`: `.page form` in `styles/app.css` gives every form inside `.page` a bottom margin; scope it to the add field.
- `list-bookmarks`: `uuid.UUID` accepts `urn:uuid:…`, `{…}` and 32-hex ids in a cursor. Harmless; tighten only if it matters.
- `list-bookmarks`: the cursor is decoded in the handler and again in the usecase. Documented in the plan; harmless.
- Redocly reports 7 tag-description warnings in `openapi.yaml`. Deferred.

## Process and tooling

- Verifiers open the PR when they find nothing Blocking (`docs/tasks/prompts.md`). Check that this works from a cloud session on the first run; if not, the agent gives the title and body in its final message.
- Put the PR template in `.github/pull_request_template.md`.
- Try chaining builder to first verifier, with the builder stopping and asking when blocked (a `Status: done|blocked` line in the plan file).
- Try pushing under named branches (`claude/<task>-build`) so later stages can compute the name.
- Mock-versus-contract check: a front-end test that validates the mocked responses against `openapi.yaml`, so drift shows up before the two halves meet.
- Fill in the timing table in `docs/retro/trial-1.md` and add a section for the parallel trial.

## Non-blocking findings from fix rounds

<!-- Fix rounds append here: `- [<task slug>] finding` -->
- [bookmark-actions] `EditBookmarkDialog` puts `.modal-footer` inside `.modal-body` (`max-height: 50vh; overflow-y: auto`), so on a short screen Save scrolls with the fields; `Dialog` has an unused `footer` prop for this. Same for the empty-trash dialog.
- [bookmark-actions] A stored title with surrounding spaces enables Save on open, because the trimmed value differs from the stored one. Only matters if the server ever stores untrimmed titles.
- [bookmark-actions] Base UI gives each toast `role="dialog"` inside the `role="status"` region (plan call 12); screen readers may announce toasts unevenly. Check in a real browser.
- [bookmark-actions] Base UI pauses a toast's timer on hover and focus, so "disappears after 3.5 s" holds only while the pointer and focus are elsewhere.
