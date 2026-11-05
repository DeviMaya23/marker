# Backlog

What has not been turned into a task yet, and the loose ends from verifier reports that the user chose to track. It holds no status: `bash scripts/status.sh` shows what is drafted, running or merged. The user decides the order and turns an item into a task file (`docs/tasks/TEMPLATE.md`).

**One home per item.** An item leaves this file in the same commit that adds its task file. From then on the task file is the only record, and `bash scripts/status.sh` shows which stage it is at. When a task is split and part of it is left out, this file gets a line for the left-out part that names the task it came from. Fix rounds append non-blocking findings at the bottom, one line each, as `- [<task slug>] finding`. Other findings stay in their task's report; the user decides which to track (`docs/tasks/AUTHORING.md`, Phase 0).

## Backend: operations not built

| Area | Operations | Requirements |
|---|---|---|

## Backend: cross-cutting


## Frontend: screens and features not built

Screen numbers are those of the design brief (`docs/design/ui-reference/ui-design-brief.md`).

- The footer's "Account & help" no longer shows as the current page on `/account`. Split from `logout-menu`: the link became a menu button, which cannot carry `aria-current`. Cosmetic.
- The paste-a-URL field in the top bar next to the search (screen 2). Split from `top-bar-search`: the field stays on the page above the list for now.

## Loose ends from verifier reports

- Check in a real browser: on a tall screen with a short first page, the list may not request page 2, because `IntersectionObserver` fires only when visibility changes (`bookmark-list` report, finding 1). Not reproducible in jsdom.
- `bookmark-list`: a failed refresh with rows on screen says "Couldn't load more."; the wording is slightly off.
- `bookmark-list`: `.page form` in `styles/app.css` gives every form inside `.page` a bottom margin; scope it to the add field.
- `list-bookmarks`: `uuid.UUID` accepts `urn:uuid:…`, `{…}` and 32-hex ids in a cursor. Harmless; tighten only if it matters.
- `list-bookmarks`: the cursor is decoded in the handler and again in the usecase. Documented in the plan; harmless.
- `folders-api`: sibling names compare with `lower()` under the database's default collation; exact for ASCII, collation-dependent for other scripts.
- `folders-api`: the router test no longer lists the folder write routes in its CSRF rows (CSRF is router-wide, and other rows still cover it).
- `bookmark-edit-trash`: the branch where the folder is deleted between the `EXISTS` check and the update in `repository.Update` has no test of its own; nearly unreachable.
- `folder-sidebar`: the name counter and the 100 limit use the trimmed name, which is what is sent. If the server counts the raw name, a 100-character name with trailing spaces could pass here and fail there. Check when the two halves meet.
- `folder-sidebar`: "Too many requests. Try again in about 0 seconds." for `Retry-After: 0`, which is what the task's wording gives.
- `mobile-drawer`: a dialog open inside the drawer (for example a half-filled "New folder") is dropped when the viewport crosses 768px, and its text is lost. Follows the task file; decide whether that is acceptable.
- `mobile-drawer`: the drawer content unmounts on the first closing render, so the 180 ms slide-out may show an empty panel. Check in a real browser.
- `mobile-drawer`: `border-bottom: none` in the 768px block of `.app-shell__sidebar` is a dead rule; the `matchMedia` test stand-in supports only the three queries in use.
- `search-api`: a next-page cursor can pass the 100,000 offset cap and answer `422 cursor invalid` on the following request. Unreachable at the scale of NFR-4.
- `search-api`: `ListBookmarksInput.IsSearch` trims `Query` again after the handler has. Harmless.
- `backend-hardening`: an unauthenticated request with a body over 64 KiB answers `413`, not `401`, because Echo's global body limit runs before the session check; the task file's order text says 401, 403, 413. Decide: move the limit behind authentication, or change the wording.
- `backend-hardening`: the unknown-user answer (not found at the lock) is not tested for the six locked methods. `requireJSON` rewrites the request's `Content-Type` to lower case so Echo accepts `Application/JSON`; it works and is tested, but it mutates the request.
- `folder-moves`: a bookmark move that answers `422` refreshes the list, though the task says a `422` does not. The server has no `422` for a bookmark move, so it cannot happen today.
- `css-lint-cleanup`: `.folder-error` is defined twice in `layout.css` (once in the `.folder-empty, .folder-error` list, once alone). The properties do not overlap, so nothing changes in the cascade; stylelint does not flag it.
- `get-favicon`: `RecordFetchSuccess` overwrites the bytes behind an existing favicon id (`ON CONFLICT (user_id, host) DO UPDATE`), but the contract says the content behind an id never changes. The task follows the contract (a one-year `max-age`), so a browser can show an outdated icon for up to a year. Decide: change the upsert to `DO NOTHING`, or reword the contract.
- `top-bar-search`: after a scope change, Back returns to the folder page with the typed search still applied, not as it was before; the task file does not say which it wants. Decide.
- `sync-version`: `BookmarkRepository.Update` with an empty `BookmarkUpdate{}` increments `users.version`; the "only when something changed" rule is held by `usecase/bookmark_update.go`, not the repository. Unreachable through the API today; matters if a later caller bypasses the usecase.
- `delete-account`: the lock test's `pg_stat_activity` query matches any backend waiting on a lock, not only the `DeleteUser` one. Safe while the package's tests run one at a time; a future `t.Parallel()` in the package could make it pass for the wrong reason.
- Redocly reports 7 tag-description warnings in `openapi.yaml`. Deferred.

## Later, after the app is finished



## Process and tooling

- Hook the Worker's test into `make check` (`node --test deploy/`, run from the repository root). Split from `worker-proxy`, which could not change the `Makefile`.
- Verifiers open the PR when they find nothing Blocking (`docs/tasks/prompts.md`). Check that this works from a cloud session; if not, the agent gives the title and body in its final message.
- Try chaining builder to first verifier, with the builder stopping and asking when blocked (a `Status: done|blocked` line in the plan file).
- Mock-versus-contract check: a front-end test that validates the mocked responses against `openapi.yaml`, so drift shows up before the two halves meet.
- Fill in the timing table in `docs/retro/trial-1.md` and add a section for the parallel trial.
- A flaky test got through a builder's `make check` (`folder-sidebar`, found by its verifier): consider asking builders to run a test file that uses timers or navigation several times before they tick it.

## Non-blocking findings from fix rounds

<!-- Fix rounds append here: `- [<task slug>] finding` -->
- [bookmark-actions] `EditBookmarkDialog` puts `.modal-footer` inside `.modal-body` (`max-height: 50vh; overflow-y: auto`), so on a short screen Save scrolls with the fields; `Dialog` has an unused `footer` prop for this. Split from `add-form-key-and-trash-footer`, which fixed the empty-trash dialog and left this one because it changes `components/ui/` (and maybe `styles/`) while `login-screen` runs.
- [bookmark-actions] A stored title with surrounding spaces enables Save on open, because the trimmed value differs from the stored one. Only matters if the server ever stores untrimmed titles.
- [bookmark-actions] Base UI gives each toast `role="dialog"` inside the `role="status"` region (plan call 12); screen readers may announce toasts unevenly. Check in a real browser.
- [bookmark-actions] Base UI pauses a toast's timer on hover and focus, so "disappears after 3.5 s" holds only while the pointer and focus are elsewhere.
- [worker-proxy] N1: no test guards the "concatenate, don't `new URL(path, origin)`" design choice; the variant differs only for paths starting `//`, which the path check already answers 404, so the `/api//x` test passes either way.
- [worker-proxy] N2: the plan file's header still says `node --test deploy/`, and its test names are paraphrases of the real ones.
- [worker-proxy] N3: the README says the Worker tests run with the glob (`node --test "deploy/*.test.mjs"`) while the task file's Structure and Handing back say `node --test deploy/`; settle together with B1 (the backlog line about hooking the test into `make check` uses the directory form too).
