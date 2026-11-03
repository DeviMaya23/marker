# Backlog

Non-blocking findings from `docs/tasks/save-form.report.md`, not yet fixed.

- **N1.** A 429 without `Retry-After` reads "Try again in a moment."; the task table says "a moment" for N. Decide whether the wording stands.
- **N2.** A 404 during a poll (bookmark deleted meanwhile) leaves the stale page instead of "Bookmark not found".
- **N3.** `Retry-After` edge values: an empty header gives "about 0 seconds", a negative one "about -5 seconds".
- **N4.** A malformed `csrf_token` cookie makes `decodeURIComponent` throw a `URIError` before the request is sent.
- **N5.** URL length is not checked on the client; the server decides (`too_long`). Matches the task file; recorded only.
- **N6.** `Favicon` keeps its `broken` flag if `faviconUrl` changes on a mounted component. Cannot happen today.
