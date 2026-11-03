// Mock API client. Function names/shapes mirror the operationIds in openapi.yaml
// (createBookmark, listBookmarks, updateFolder, ...) so this file is the only
// thing that would need replacing with real `fetch` calls against the Go backend.
import { v7 as uuidv7 } from "uuid";
import {
  loadStore,
  saveStore,
  onRemoteChange,
  ensureSeeded,
  resetDemoData,
  type StoreShape,
  type BookmarkRecord,
  type FolderRecord,
} from "./store";
import { normalizeUrl, parseUrlLoose, hostOf } from "./normalize";
import { faviconUrlFor } from "./favicon";
import {
  ApiError,
  FIELD_LIMITS,
  type BookmarkDetail,
  type BookmarkPage,
  type BookmarkSummary,
  type Folder,
  type Problem,
} from "./types";

ensureSeeded();

// ---- debug / demo-only controls (see AccountPage "Demo data controls") ------
let debugNextError: Problem["code"] | null = null;
export function __debugSetNextError(code: Problem["code"] | null) {
  debugNextError = code;
}
export function __debugResetData() {
  resetDemoData();
}
export function __debugFillToCap() {
  const store = loadStore();
  const toAdd = FIELD_LIMITS.bookmarkCap - store.bookmarks.length;
  for (let i = 0; i < toAdd; i++) {
    const id = uuidv7();
    store.bookmarks.push({
      id,
      url: `https://filler.example/at-cap/${store.bookmarks.length + i}`,
      normalized_url: `filler.example/at-cap/${store.bookmarks.length + i}`,
      title: `Filler bookmark ${store.bookmarks.length + i}`,
      note: null,
      folder_id: null,
      favicon_url: faviconUrlFor("filler.example"),
      fetch_status: "ok",
      content: "Filler content.",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    });
  }
  store.version += 1;
  saveStore(store);
}

function throwProblem(code: Problem["code"], detail: string, extra: Partial<Problem> = {}): never {
  const status: Record<Problem["code"], number> = {
    unauthenticated: 401,
    csrf_failed: 403,
    not_found: 404,
    invalid_url: 422,
    duplicate_bookmark: 409,
    bookmark_limit_reached: 409,
    folder_depth_exceeded: 422,
    folder_cycle: 422,
    folder_name_conflict: 409,
    bookmark_in_trash: 409,
    bookmark_not_in_trash: 409,
    validation_error: 422,
    payload_too_large: 413,
    rate_limited: 429,
  };
  throw new ApiError({
    type: `/errors/${code.replace(/_/g, "-")}`,
    title: detail,
    status: status[code],
    detail,
    code,
    ...extra,
  });
}

function consumeDebugError() {
  if (debugNextError) {
    const code = debugNextError;
    debugNextError = null;
    if (code === "rate_limited") {
      throwProblem(code, "You're saving too quickly. Try again in a little while.", { retry_after: 20 });
    }
    throwProblem(code, "Simulated error for review purposes.");
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (base: number) => base + Math.random() * base * 0.6;

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

function descendantIds(folders: FolderRecord[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of folders) {
      if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
        ids.add(f.id);
        changed = true;
      }
    }
  }
  return ids;
}

function subtreeHeight(folders: FolderRecord[], rootId: string): number {
  const children = (id: string) => folders.filter((f) => f.parent_id === id);
  function go(id: string): number {
    const kids = children(id);
    if (kids.length === 0) return 1;
    return 1 + Math.max(...kids.map((k) => go(k.id)));
  }
  return go(rootId);
}

function toFolderDTO(f: FolderRecord, bookmarks: BookmarkRecord[]): Folder {
  const bookmark_count = bookmarks.filter((b) => b.folder_id === f.id && !b.deleted_at).length;
  return {
    id: f.id,
    name: f.name,
    parent_id: f.parent_id,
    depth: f.depth,
    bookmark_count,
    created_at: f.created_at,
    updated_at: f.updated_at,
  };
}

export async function listFolders(): Promise<{ items: Folder[] }> {
  await delay(jitter(120));
  const store = loadStore();
  return { items: store.folders.map((f) => toFolderDTO(f, store.bookmarks)) };
}

function checkSiblingConflict(
  store: StoreShape,
  parentId: string | null,
  name: string,
  excludeId?: string,
) {
  const clash = store.folders.some(
    (f) =>
      f.id !== excludeId &&
      f.parent_id === parentId &&
      f.name.toLowerCase() === name.toLowerCase(),
  );
  if (clash) {
    throwProblem("folder_name_conflict", "A folder with this name already exists here.");
  }
}

export async function createFolder(input: { name: string; parent_id?: string | null }): Promise<Folder> {
  await delay(jitter(200));
  consumeDebugError();
  const name = input.name.trim();
  if (!name) throwProblem("validation_error", "Folder name is required.", {
    errors: [{ field: "name", code: "required" }],
  });
  if (name.length > FIELD_LIMITS.folderName) {
    throwProblem("validation_error", "Folder name is too long.", {
      errors: [{ field: "name", code: "too_long" }],
    });
  }
  const store = loadStore();
  const parentId = input.parent_id ?? null;
  const parent = parentId ? store.folders.find((f) => f.id === parentId) : null;
  if (parentId && !parent) throwProblem("not_found", "No such folder.");
  const depth = parent ? parent.depth + 1 : 1;
  if (depth > FIELD_LIMITS.maxFolderDepth) {
    throwProblem("folder_depth_exceeded", "Folders can only be nested 3 levels deep.");
  }
  checkSiblingConflict(store, parentId, name);
  const record: FolderRecord = {
    id: uuidv7(),
    name,
    parent_id: parentId,
    depth,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.folders.push(record);
  store.version += 1;
  saveStore(store);
  return toFolderDTO(record, store.bookmarks);
}

export async function updateFolder(
  id: string,
  input: { name?: string; parent_id?: string | null },
): Promise<Folder> {
  await delay(jitter(200));
  consumeDebugError();
  const store = loadStore();
  const folder = store.folders.find((f) => f.id === id);
  if (!folder) throwProblem("not_found", "No such folder.");

  const nextName = input.name !== undefined ? input.name.trim() : folder.name;
  if (input.name !== undefined) {
    if (!nextName) throwProblem("validation_error", "Folder name is required.");
    if (nextName.length > FIELD_LIMITS.folderName) {
      throwProblem("validation_error", "Folder name is too long.", {
        errors: [{ field: "name", code: "too_long" }],
      });
    }
  }

  const movingParent = Object.prototype.hasOwnProperty.call(input, "parent_id");
  const nextParentId = movingParent ? input.parent_id ?? null : folder.parent_id;

  if (movingParent) {
    if (nextParentId === folder.id) throwProblem("folder_cycle", "A folder can't be moved into itself.");
    const forbidden = descendantIds(store.folders, folder.id);
    if (nextParentId && forbidden.has(nextParentId)) {
      throwProblem("folder_cycle", "A folder can't be moved into one of its own subfolders.");
    }
    const newParent = nextParentId ? store.folders.find((f) => f.id === nextParentId) : null;
    if (nextParentId && !newParent) throwProblem("not_found", "No such folder.");
    const newDepth = newParent ? newParent.depth + 1 : 1;
    const height = subtreeHeight(store.folders, folder.id);
    if (newDepth + height - 1 > FIELD_LIMITS.maxFolderDepth) {
      throwProblem("folder_depth_exceeded", "That move would nest folders more than 3 levels deep.");
    }
  }

  checkSiblingConflict(store, nextParentId, nextName, folder.id);

  const depthDelta =
    (movingParent
      ? (nextParentId ? store.folders.find((f) => f.id === nextParentId)!.depth + 1 : 1)
      : folder.depth) - folder.depth;

  folder.name = nextName;
  folder.parent_id = nextParentId;
  folder.updated_at = new Date().toISOString();
  if (depthDelta !== 0) {
    const ids = descendantIds(store.folders, folder.id);
    ids.delete(folder.id);
    for (const other of store.folders) {
      if (ids.has(other.id)) other.depth += depthDelta;
    }
    folder.depth += depthDelta;
  }

  store.version += 1;
  saveStore(store);
  return toFolderDTO(folder, store.bookmarks);
}

export async function deleteFolder(id: string): Promise<{ deleted_folders: number; trashed_bookmarks: number }> {
  await delay(jitter(250));
  consumeDebugError();
  const store = loadStore();
  const folder = store.folders.find((f) => f.id === id);
  if (!folder) throwProblem("not_found", "No such folder.");
  const ids = descendantIds(store.folders, id);
  let trashed = 0;
  const now = new Date().toISOString();
  for (const b of store.bookmarks) {
    if (b.folder_id && ids.has(b.folder_id) && !b.deleted_at) {
      b.deleted_at = now;
      trashed += 1;
    }
  }
  store.folders = store.folders.filter((f) => !ids.has(f.id));
  store.version += 1;
  saveStore(store);
  return { deleted_folders: ids.size, trashed_bookmarks: trashed };
}

/** Helper for the UI to preview delete-folder impact before confirming (FR-16). */
export function previewFolderDeleteImpact(
  folders: Folder[],
  bookmarkCountsByFolder: Map<string, number>,
  id: string,
): { subfolders: number; bookmarks: number } {
  const record = folders.find((f) => f.id === id);
  if (!record) return { subfolders: 0, bookmarks: 0 };
  const ids = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of folders) {
      if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
        ids.add(f.id);
        changed = true;
      }
    }
  }
  let bookmarks = 0;
  for (const fid of ids) bookmarks += bookmarkCountsByFolder.get(fid) ?? 0;
  return { subfolders: ids.size - 1, bookmarks };
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

function toSummary(b: BookmarkRecord): BookmarkSummary {
  return {
    id: b.id,
    url: b.url,
    title: b.title,
    note: b.note,
    folder_id: b.folder_id,
    favicon_url: b.favicon_url,
    fetch_status: b.fetch_status,
    created_at: b.created_at,
    deleted_at: b.deleted_at,
  };
}

function matchScore(b: BookmarkRecord, q: string, includeNotes: boolean): number {
  const needle = q.toLowerCase();
  let score = 0;
  if (b.title.toLowerCase().includes(needle)) score += 3;
  if (b.url.toLowerCase().includes(needle)) score += 2;
  if (b.content?.toLowerCase().includes(needle)) score += 1;
  if (includeNotes && b.note?.toLowerCase().includes(needle)) score += 1;
  return score;
}

export async function listBookmarks(params: {
  q?: string;
  include_notes?: boolean;
  folder_id?: string;
  trashed?: boolean;
  cursor?: string | null;
  limit?: number;
}): Promise<BookmarkPage> {
  await delay(jitter(250));
  consumeDebugError();
  const store = loadStore();
  const limit = params.limit ?? 50;
  let items = store.bookmarks.slice();

  if (params.trashed) {
    items = items.filter((b) => b.deleted_at);
    items.sort((a, b) => (b.deleted_at! > a.deleted_at! ? 1 : -1));
  } else {
    items = items.filter((b) => !b.deleted_at);
    if (params.folder_id) {
      const ids = descendantIds(store.folders, params.folder_id);
      items = items.filter((b) => b.folder_id && ids.has(b.folder_id));
    }
    if (params.q && params.q.trim()) {
      const q = params.q.trim();
      items = items
        .map((b) => ({ b, score: matchScore(b, q, !!params.include_notes) }))
        .filter((x) => x.score > 0)
        .sort((x, y) => y.score - x.score || (y.b.created_at > x.b.created_at ? 1 : -1))
        .map((x) => x.b);
    } else {
      items.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
    }
  }

  const offset = params.cursor ? parseInt(params.cursor, 10) || 0 : 0;
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  const next_cursor = nextOffset < items.length ? String(nextOffset) : null;
  return { items: page.map(toSummary), next_cursor };
}

export async function getBookmark(id: string): Promise<BookmarkDetail> {
  await delay(jitter(180));
  const store = loadStore();
  const b = store.bookmarks.find((x) => x.id === id);
  if (!b) throwProblem("not_found", "No such bookmark.");
  return { ...toSummary(b), content: b.content, updated_at: b.updated_at };
}

function scheduleFetchResolution(id: string) {
  const forceFail = Math.random() < 0.12;
  setTimeout(() => {
    const store = loadStore();
    const b = store.bookmarks.find((x) => x.id === id);
    if (!b || b.deleted_at) return; // discarded per FR-5c if gone
    if (forceFail) {
      b.fetch_status = "failed";
    } else {
      b.fetch_status = "ok";
      if (!b.title) b.title = titleGuess(b.url);
      b.content = `Extracted text for ${hostOf(b.url)}. Placeholder article body (see DECISIONS.md).`;
      if (!b.favicon_url) b.favicon_url = faviconUrlFor(hostOf(b.url));
    }
    b.updated_at = new Date().toISOString();
    store.version += 1;
    saveStore(store);
  }, jitter(3500));
}

function titleGuess(url: string): string {
  const host = hostOf(url);
  return host.charAt(0).toUpperCase() + host.slice(1);
}

export async function createBookmark(input: {
  url: string;
  title?: string;
  folder_id?: string | null;
}): Promise<BookmarkSummary> {
  await delay(jitter(220));
  consumeDebugError();

  if (input.url.length > FIELD_LIMITS.url) {
    throwProblem("validation_error", "That URL is too long.", { errors: [{ field: "url", code: "too_long" }] });
  }
  if (input.title && input.title.length > FIELD_LIMITS.title) {
    throwProblem("validation_error", "That title is too long.", { errors: [{ field: "title", code: "too_long" }] });
  }
  const parsed = parseUrlLoose(input.url);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    throwProblem("invalid_url", "Only http and https links can be saved.");
  }

  const store = loadStore();
  const normalized = normalizeUrl(input.url);
  const dup = store.bookmarks.find((b) => b.normalized_url === normalized);
  if (dup) {
    throwProblem(
      "duplicate_bookmark",
      dup.deleted_at ? "This URL is already in your trash." : "This URL is already saved.",
      { existing_bookmark_id: dup.id, in_trash: !!dup.deleted_at },
    );
  }
  if (store.bookmarks.length >= FIELD_LIMITS.bookmarkCap) {
    throwProblem(
      "bookmark_limit_reached",
      `You can hold at most ${FIELD_LIMITS.bookmarkCap} bookmarks, including trashed ones.`,
    );
  }
  if (input.folder_id) {
    const f = store.folders.find((x) => x.id === input.folder_id);
    if (!f) throwProblem("not_found", "No such folder.");
  }

  const record: BookmarkRecord = {
    id: uuidv7(),
    url: input.url,
    normalized_url: normalized,
    title: input.title?.trim() ?? "",
    note: null,
    folder_id: input.folder_id ?? null,
    favicon_url: null,
    fetch_status: "pending",
    content: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };
  store.bookmarks.push(record);
  store.version += 1;
  saveStore(store);
  scheduleFetchResolution(record.id);
  return toSummary(record);
}

export async function updateBookmark(
  id: string,
  input: { title?: string; note?: string | null; folder_id?: string | null },
): Promise<BookmarkSummary> {
  await delay(jitter(200));
  consumeDebugError();
  const store = loadStore();
  const b = store.bookmarks.find((x) => x.id === id);
  if (!b) throwProblem("not_found", "No such bookmark.");
  if (b.deleted_at) throwProblem("bookmark_in_trash", "Restore this bookmark before changing it.");

  if (input.title !== undefined) {
    if (input.title.length > FIELD_LIMITS.title) {
      throwProblem("validation_error", "That title is too long.", { errors: [{ field: "title", code: "too_long" }] });
    }
    b.title = input.title;
  }
  if (input.note !== undefined) {
    if (input.note !== null && input.note.length > FIELD_LIMITS.note) {
      throwProblem("validation_error", "That note is too long.", { errors: [{ field: "note", code: "too_long" }] });
    }
    b.note = input.note;
  }
  if (input.folder_id !== undefined) {
    if (input.folder_id) {
      const f = store.folders.find((x) => x.id === input.folder_id);
      if (!f) throwProblem("not_found", "No such folder.");
    }
    b.folder_id = input.folder_id;
  }
  b.updated_at = new Date().toISOString();
  store.version += 1;
  saveStore(store);
  return toSummary(b);
}

export async function deleteBookmark(id: string): Promise<void> {
  await delay(jitter(180));
  consumeDebugError();
  const store = loadStore();
  const b = store.bookmarks.find((x) => x.id === id);
  if (!b) throwProblem("not_found", "No such bookmark.");
  if (b.deleted_at) throwProblem("bookmark_in_trash", "This bookmark is already in the trash.");
  b.deleted_at = new Date().toISOString();
  store.version += 1;
  saveStore(store);
}

export async function restoreBookmark(id: string): Promise<BookmarkSummary> {
  await delay(jitter(180));
  consumeDebugError();
  const store = loadStore();
  const b = store.bookmarks.find((x) => x.id === id);
  if (!b) throwProblem("not_found", "No such bookmark.");
  if (!b.deleted_at) throwProblem("bookmark_not_in_trash", "Only trashed bookmarks can be restored.");
  b.deleted_at = null;
  b.folder_id = null;
  b.updated_at = new Date().toISOString();
  store.version += 1;
  saveStore(store);
  return toSummary(b);
}

export async function emptyTrash(): Promise<{ deleted: number }> {
  await delay(jitter(250));
  consumeDebugError();
  const store = loadStore();
  const before = store.bookmarks.length;
  store.bookmarks = store.bookmarks.filter((b) => !b.deleted_at);
  store.version += 1;
  saveStore(store);
  return { deleted: before - store.bookmarks.length };
}

// ---------------------------------------------------------------------------
// Sync, auth, account
// ---------------------------------------------------------------------------

/**
 * Not a real endpoint in openapi.yaml -- there's no count route there. This is a
 * small mock-only convenience so the UI can show a "you're at the cap" banner
 * without re-deriving it from however many pages happen to be loaded. A real
 * client could get the same signal from the 409 `bookmark_limit_reached` it gets
 * back from createBookmark, which is what actually enforces the cap (NFR-17).
 */
export async function __debugBookmarkCount(): Promise<number> {
  return loadStore().bookmarks.length;
}

export async function getSyncVersion(): Promise<{ version: number }> {
  const store = loadStore();
  return { version: store.version };
}

export { onRemoteChange };

export async function isLoggedIn(): Promise<boolean> {
  return loadStore().loggedIn;
}

export async function login(): Promise<void> {
  await delay(400);
  const store = loadStore();
  store.loggedIn = true;
  saveStore(store);
}

export async function logout(): Promise<{ logout_url: string }> {
  await delay(jitter(150));
  const store = loadStore();
  store.loggedIn = false;
  saveStore(store);
  return { logout_url: "about:blank?loggedOutOfIdp=1" };
}

export async function deleteAccount(): Promise<void> {
  await delay(jitter(300));
  const store = loadStore();
  store.folders = [];
  store.bookmarks = [];
  store.loggedIn = false;
  store.version += 1;
  saveStore(store);
}
