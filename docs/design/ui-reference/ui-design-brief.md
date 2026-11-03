# UI design brief: bookmark manager

Hand-off for a design chat. The product requirements and API are already decided; this file tells you what the UI must do and what data it has. Please design within these constraints rather than around them.

If you can, also attach `requirements.md` and `openapi.yaml` (requirement numbers like FR-16 below refer to `requirements.md`).

## What you are designing

A small web app for saving links ("bookmarks") and finding them again. Built because browser extensions and bookmark sync don't work across the owner's mix of Firefox, Opera and Safari on different devices. Think "a place to dump links", for example tweets with useful information.

- **Users:** a handful of people, each with hundreds of bookmarks (hard cap 1,000). Anyone can sign up.
- **Devices:** desktop and mobile web, one responsive app. Latest Firefox, Opera and Chrome; Safari best-effort.
- **Saved content is text only.** When a link is saved the server fetches the page and stores its extracted text plus the site's favicon. No images or screenshots.
- **Style:** no brand, palette or visual direction has been chosen. Please propose one. Component library is undecided, so keep the design implementable with ordinary patterns (sidebar, list, dialog, toast, menu, form).

## Screens

### 1. Logged-out / login
A minimal screen with a "Log in" action. Login happens on an external identity provider's hosted page (email and password, or SSO), so **do not design sign-up or password forms**. If a session expires, the user is sent through login and returned to where they were.

### 2. App shell and bookmark list (main screen)
- **Sidebar (desktop) / drawer (mobile):** "All bookmarks", the folder tree, "Trash", and an account menu.
  - Folders nest to a **maximum depth of 3** (a top-level folder is depth 1).
  - Each folder has a `bookmark_count` (bookmarks directly inside it, not its subfolders).
  - Folder actions: create (inside root or a folder), rename, move, delete. Creating a subfolder inside a depth-3 folder is not allowed.
- **Top bar:** search field, a scope control (**all bookmarks** or **this folder and its subfolders**), and an **"include notes" toggle (off by default)**. Plus an add field where the user can paste a URL to save it (the second way to add bookmarks; the first is the save popup, screen 5).
- **List:** newest first, infinite scroll (pages of 50). With a search term, results are ranked by relevance instead. The list gives no match snippets or highlighting, so don't rely on them.
- **Each row:** favicon (may be missing), title, site/URL, note indicator or preview, created date, fetch state (see below). Row actions: open the original link, open detail, edit title and note, move to a folder, delete (moves to trash).
- **States to design:** loading, empty library, empty folder, no search results, error, and a "limit reached" message (1,000 bookmarks).

**Fetch state per bookmark (FR-5a):** `pending` (page still being fetched), `ok`, or `failed` (the bookmark is still saved with its URL, just no page text). There is **no retry button**; retrying is out of scope. A pending bookmark may have an empty title until the fetch fills it, so show the site name or URL as a fallback. Page text only becomes searchable once the fetch completes.

### 3. Bookmark detail
Title (editable), URL (with open-link action), favicon, folder (changeable), created date, fetch state, **note (editable, 500 characters max, show a counter)**, and the **extracted page text** shown as plain text. The text can be long (up to about 500 KB), so give it a comfortable reading layout. While `pending` or when `failed`, there is no text, so explain why. Actions: edit, move, delete.

If the bookmark is **in the trash**, show it read-only with a clear "In trash" banner and a Restore action. Nothing else can be done to it.

### 4. Trash
Lists trashed bookmarks, most recently trashed first. Per item: **Restore** (a restored bookmark always goes to the top level, so say so). One page-level action: **Empty trash**, which permanently deletes everything and cannot be undone, so it needs a clear confirmation. Items can be opened read-only. There is no per-item permanent delete and no folder restore (folders are never in the trash).

### 5. Save popup (small window, about 420 to 520 px wide)
Opened by a bookmarklet the user installs in their bookmarks bar, so it appears over whatever page they were reading.
- Shows the **URL** (read-only), an **editable title** (prefilled from the page), and a **folder picker** (default: top level). Save and Cancel.
- **Keyboard:** Enter saves, Esc cancels. Focus the Save button on open.
- **On success:** show "Saved" for about a second, then the window closes itself. If the browser won't let it close, say the user can close the tab.
- **On cancel:** closes immediately.
- **Duplicate (FR-24):** stays open with an alert. The message depends on where the existing bookmark is: "already saved", or "this link is in your trash". Nothing else (no restore button).
- **Errors** (invalid URL, limit reached, rate limited) stay open until dismissed (Enter or Esc).
- If the user is logged out when it opens, they log in and come back to the same popup.

### 6. Account and help
- **Log out.** Ends the app session and the identity provider session, then leaves the app.
- **Install the bookmarklet:** a draggable link plus short steps for Chrome, Firefox, Opera and Safari.
- **Delete account:** permanently erases all of the user's bookmarks, notes, folders and trash. There are no backups. The login account at the identity provider is not deleted. Needs a serious, deliberate confirmation.

## Destructive actions and confirmations
- **Delete folder (FR-16):** permanently deletes the folder and every subfolder. Every bookmark inside moves to the trash. **The confirmation must state how many subfolders and bookmarks are affected**, counting the whole subtree. This is the one place a number is required.
- **Delete bookmark:** moves to trash (reversible). Probably no confirmation; your call.
- **Empty trash** and **delete account:** irreversible, so strong confirmation.
- **Moves (bookmarks and folders) cannot be undone.**

## Moving things
A bookmark belongs to exactly one folder (or the top level). Folders and bookmarks can be moved. Give a non-drag way to move ("Move to…" picker), since mobile needs it; drag and drop is optional. A move picker should not offer invalid targets: a folder's own subtree, or anywhere that would make folders deeper than 3 levels.

## Field limits to design for
| Field | Maximum |
|---|---|
| URL | 2,048 characters |
| Title | 300 characters |
| Note | 500 characters |
| Folder name | 100 characters (unique among siblings, case-insensitive) |
| Bookmarks per user | 1,000, trashed ones included |

## Errors the UI has to express
| Situation | Suggested treatment |
|---|---|
| Invalid URL (not http or https) | Inline field error |
| Duplicate (live or in trash) | Alert, as described above |
| 1,000 bookmark limit reached | Message suggesting emptying the trash or deleting bookmarks |
| Folder name already used in that folder | Inline field error |
| Folder would be nested too deeply | Prevent in the UI where possible, error otherwise |
| Too many requests (rate limit) | Message with when to try again |
| Value too long | Inline field error |
| Session expired | Redirect to login, then back |
| Bookmark was trashed from another device while open | Gentle "this bookmark is in the trash" state |

## Behaviour that affects layout
- **Changes from another device appear within about 5 seconds** (the app polls in the background and refreshes the list and folder tree). The list refresh must not jump the user's scroll position or interrupt an edit.
- **Content is always plain text.** Never design for rich or HTML-rendered page content.

## Data available (so you don't design fields that don't exist)
- **Bookmark:** id, url, title, note, folder, favicon, fetch status, created date, trashed date. Detail adds the extracted text and updated date.
- **Folder:** id, name, parent, depth, bookmark count.
- **Not available:** descriptions, thumbnails, tags, read/unread, search match snippets, per-bookmark history.

## Out of scope (please don't design these)
Sharing, tags, import and export, browser extension, saved images or screenshots, retrying failed fetches, undo for moves, auto-deleting the trash, restoring folders, deleting a single bookmark permanently, a bookmark in multiple folders, folder search, editing a bookmark's URL.

## What I'd like back
1. Every screen above at desktop (about 1280 px) and mobile (about 390 px) widths, including the empty, loading, error and confirmation states listed.
2. The save popup at its real size.
3. A short list of the components used and the names you give each screen and state, so the build can refer to them.
4. Any place where a requirement here forced an awkward UI. Flag it rather than working around it silently.
