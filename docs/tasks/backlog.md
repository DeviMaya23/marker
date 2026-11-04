# Backlog

What is not built yet, and loose ends from verifier reports. The user decides the order and turns an item into a task file (`docs/tasks/TEMPLATE.md`).

**One home per item.** An item leaves this file in the same commit that adds its task file. From then on the task file is the only record, and `bash scripts/status.sh` shows which stage it is at. When a task is split and part of it is left out, this file gets a line for the left-out part that names the task it came from. Fix rounds append non-blocking findings at the bottom, one line each, as `- [<task slug>] finding`.

State as of `main` at `82b9c17`: 11 of the 17 operations are real (bookmarks: create, get, list with the folder filter, update, delete, restore, empty trash; folders: list, create, update, delete). The other 6 are 501 stubs, and search (`q`) on `listBookmarks` still answers 501.

## Backend: operations not built

| Area | Operations | Requirements |
|---|---|---|
| Search | `q` and `include_notes` on `listBookmarks` (they answer 501 now) | FR-9, 10, 11, NFR-10 |
| Sync | `getSyncVersion` | NFR-2 |
| Favicons | `getFavicon` (icons are fetched and stored but never served) | FR-5 |
| Auth | `authLogin`, `authCallback`, `authLogout` (real Kinde login; only dev-login works) | FR-1, 2 |
| Account | `deleteAccount` | FR-25, NFR-3 |

## Backend: cross-cutting

- Rate limiting: 30 saves per minute per user, login routes per IP, a generous ceiling elsewhere, sync poll exempt (NFR-16). Not built at all.
- Error answers outside the contract: `internal_error` is missing from the contract's error codes, and a `POST` or `PATCH` on bookmarks without a JSON `Content-Type` answers `500 internal_error` where it should be `415` (Echo's binder error has no mapping in `handler/problem.go`; `bookmark-edit-trash` report, N1).
- Update `CONVENTIONS.md` rule 2 with the exception for the fetch job's lookup by bookmark id (no `user_id`).
- Kinde "Phase B": needs the Kinde domain, client ID and registered URLs. The client secret goes in a gitignored `.env`, never in chat or the repo.

## Frontend: screens and features not built

Screen numbers are those of the design brief (`docs/design/ui-reference/ui-design-brief.md`).

- Login screen (screen 1), and a way to learn you are signed out without waiting for a 401 (FR-3c, needs a who-am-I endpoint, which does not exist).
- **Moving, the second half of the folder work** (split from `folder-sidebar`; the server side exists): "Move to…" for a bookmark (row action and the folder field on the bookmark page), "Move to…" for a folder with the invalid targets disabled (itself, its descendants, anything that would exceed depth 3), the folder picker in the save popup, and the mobile drawer for the sidebar. Needs a task file (FE-B).
- Top bar search (screen 2): search field, scope control (all or this folder), "include notes" toggle. Needs the backend search first.
- Account area (screen 6): account menu, log out, bookmarklet install page, delete account.
- Background sync: the 5-second poll that refreshes the list and folders without moving the scroll position.
- The "1,000 bookmark limit reached" message on the list.

## Loose ends from verifier reports

- Check in a real browser: on a tall screen with a short first page, the list may not request page 2, because `IntersectionObserver` fires only when visibility changes (`bookmark-list` report, finding 1). Not reproducible in jsdom.
- `bookmark-list`: a failed refresh with rows on screen says "Couldn't load more."; the wording is slightly off.
- `bookmark-list`: `.page form` in `styles/app.css` gives every form inside `.page` a bottom margin; scope it to the add field.
- `list-bookmarks`: `uuid.UUID` accepts `urn:uuid:…`, `{…}` and 32-hex ids in a cursor. Harmless; tighten only if it matters.
- `list-bookmarks`: the cursor is decoded in the handler and again in the usecase. Documented in the plan; harmless.
- `folders-api`: folder writes lock the `users` row first and then touch bookmark rows, while bookmark update and trash touch the bookmark row first and bump `users.version` last. A bookmark edit overlapping a folder delete on the same bookmark could deadlock, and Postgres would abort one with a 500. Not reproduced. Fix by taking the same lock first in the bookmark writes.
- `folders-api`: sibling names compare with `lower()` under the database's default collation; exact for ASCII, collation-dependent for other scripts.
- `folders-api`: the router test no longer lists the folder write routes in its CSRF rows (CSRF is router-wide, and other rows still cover it).
- `bookmark-edit-trash`: the branch where the folder is deleted between the `EXISTS` check and the update in `repository.Update` has no test of its own; nearly unreachable.
- `folder-sidebar`: on the folder page the add field is the same instance when you go from one folder to another, so a half-typed URL (and a shown failure) carries over and would be saved into the new folder. A `key` on the form fixes it. Read from code, not run.
- `folder-sidebar`: the name counter and the 100 limit use the trimmed name, which is what is sent. If the server counts the raw name, a 100-character name with trailing spaces could pass here and fail there. Check when the two halves meet.
- `folder-sidebar`: "Too many requests. Try again in about 0 seconds." for `Retry-After: 0`, which is what the task's wording gives.
- Redocly reports 7 tag-description warnings in `openapi.yaml`. Deferred.

## Process and tooling

- Verifiers open the PR when they find nothing Blocking (`docs/tasks/prompts.md`). Check that this works from a cloud session; if not, the agent gives the title and body in its final message.
- `css-lint-cleanup`: fix what the first run of `css-lint` reports, then put `lint-css` into `make check`. Draft it after `css-lint` is merged and its report lists the findings.
- Try chaining builder to first verifier, with the builder stopping and asking when blocked (a `Status: done|blocked` line in the plan file).
- Mock-versus-contract check: a front-end test that validates the mocked responses against `openapi.yaml`, so drift shows up before the two halves meet.
- Fill in the timing table in `docs/retro/trial-1.md` and add a section for the parallel trial.
- A flaky test got through a builder's `make check` (`folder-sidebar`, found by its verifier): consider asking builders to run a test file that uses timers or navigation several times before they tick it.

## Non-blocking findings from fix rounds

<!-- Fix rounds append here: `- [<task slug>] finding` -->
- [bookmark-actions] `EditBookmarkDialog` puts `.modal-footer` inside `.modal-body` (`max-height: 50vh; overflow-y: auto`), so on a short screen Save scrolls with the fields; `Dialog` has an unused `footer` prop for this. Same for the empty-trash dialog.
- [bookmark-actions] A stored title with surrounding spaces enables Save on open, because the trimmed value differs from the stored one. Only matters if the server ever stores untrimmed titles.
- [bookmark-actions] Base UI gives each toast `role="dialog"` inside the `role="status"` region (plan call 12); screen readers may announce toasts unevenly. Check in a real browser.
- [bookmark-actions] Base UI pauses a toast's timer on hover and focus, so "disappears after 3.5 s" holds only while the pointer and focus are elsewhere.
