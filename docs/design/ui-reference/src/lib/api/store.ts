// In-memory + localStorage-backed data store standing in for the Go/Postgres
// backend described in requirements.md. See DECISIONS.md ("Mock backend") for why
// this exists and what it does and doesn't simulate.
//
// Persisting to localStorage (rather than only an in-memory variable) and
// broadcasting changes across tabs via BroadcastChannel means two browser tabs
// of this app genuinely demonstrate NFR-2 (another device's change appearing
// within a few seconds) instead of only pretending to.
import { v7 as uuidv7 } from "uuid";
import { normalizeUrl, hostOf } from "./normalize";
import { faviconUrlFor } from "./favicon";
import type { FetchStatus } from "./types";

export interface FolderRecord {
  id: string;
  name: string;
  parent_id: string | null;
  depth: number;
  created_at: string;
  updated_at: string;
}

export interface BookmarkRecord {
  id: string;
  url: string;
  normalized_url: string;
  title: string;
  note: string | null;
  folder_id: string | null;
  favicon_url: string | null;
  fetch_status: FetchStatus;
  content: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface StoreShape {
  version: number;
  loggedIn: boolean;
  folders: FolderRecord[];
  bookmarks: BookmarkRecord[];
}

const KEY = "bmk_store_v1";
const CHANNEL = "bmk_sync_v1";

function emptyStore(): StoreShape {
  return { version: 0, loggedIn: false, folders: [], bookmarks: [] };
}

export function loadStore(): StoreShape {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    return JSON.parse(raw) as StoreShape;
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: StoreShape) {
  localStorage.setItem(KEY, JSON.stringify(store));
  try {
    bc?.postMessage({ type: "changed", version: store.version });
  } catch {
    // ignore (BroadcastChannel unsupported)
  }
}

let bc: BroadcastChannel | null = null;
try {
  bc = new BroadcastChannel(CHANNEL);
} catch {
  bc = null;
}

export function onRemoteChange(cb: () => void): () => void {
  const handler = () => cb();
  bc?.addEventListener("message", handler);
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) cb();
  });
  return () => bc?.removeEventListener("message", handler);
}

export function bumpVersion(store: StoreShape) {
  store.version += 1;
  store.bookmarks.forEach(() => {});
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const now = () => new Date().toISOString();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const SAMPLE_LINKS: Array<{ title: string; url: string; note?: string }> = [
  { title: "Understanding the Go scheduler", url: "https://go.dev/blog/scheduler" },
  { title: "", url: "https://news.ycombinator.com/item?post=38211" },
  { title: "A tweet about SSRF defenses", url: "https://twitter.com/example/status/1721?utm_source=share" },
  { title: "PostgreSQL full text search tutorial", url: "https://www.postgresql.org/docs/current/textsearch.html" },
  { title: "", url: "https://old-blog.example/posts/redirect-loops" },
  { title: "React 19 release notes", url: "https://react.dev/blog/react-19" },
  { title: "Designing APIs with OpenAPI", url: "https://openapi-tutorial.example/guide" },
  { title: "Readability algorithm explained", url: "https://go-readability.example/how-it-works" },
  { title: "", url: "https://personal-wiki.example/notes/csrf" },
  { title: "A thread on last-write-wins CRDTs", url: "https://twitter.com/example/status/1902" },
  { title: "Kinde OIDC quickstart", url: "https://kinde.com/docs/quickstart" },
  { title: "TanStack Query infinite queries", url: "https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries" },
  { title: "Rate limiting strategies", url: "https://smith.dev/articles/rate-limiting" },
  { title: "Nested set vs adjacency list", url: "https://dba.example/trees-in-sql" },
  { title: "Why SKIP LOCKED is great for queues", url: "https://brandur.org/skip-locked" },
  { title: "A recipe I keep losing", url: "https://cooking.example/recipes/weeknight-pasta", note: "Use half the chili flakes next time." },
  { title: "Flight deal thread", url: "https://twitter.com/example/status/2041", note: "Check again closer to December." },
  { title: "Go context cancellation patterns", url: "https://go.dev/blog/context" },
  { title: "Bubble tea shop list", url: "https://maps.example/list/bubble-tea" },
  { title: "Professional ethics reading list", url: "https://uni.example/ethics/readings" },
];

function makeFolder(
  folders: FolderRecord[],
  name: string,
  parent: FolderRecord | null,
  ageMinutes: number,
): FolderRecord {
  const f: FolderRecord = {
    id: uuidv7(),
    name,
    parent_id: parent ? parent.id : null,
    depth: parent ? parent.depth + 1 : 1,
    created_at: minutesAgo(ageMinutes),
    updated_at: minutesAgo(ageMinutes),
  };
  folders.push(f);
  return f;
}

function makeBookmark(
  bookmarks: BookmarkRecord[],
  seed: { title: string; url: string; note?: string },
  opts: { folder_id?: string | null; fetch_status?: FetchStatus; ageMinutes: number; deleted?: boolean },
): BookmarkRecord {
  const host = hostOf(seed.url);
  const status = opts.fetch_status ?? "ok";
  const b: BookmarkRecord = {
    id: uuidv7(),
    url: seed.url,
    normalized_url: normalizeUrl(seed.url),
    title: seed.title || (status === "ok" ? titleFromUrl(seed.url) : ""),
    note: seed.note ?? null,
    folder_id: opts.folder_id ?? null,
    favicon_url: faviconUrlFor(host),
    fetch_status: status,
    content: status === "ok" ? sampleContentFor(seed.url) : null,
    created_at: minutesAgo(opts.ageMinutes),
    updated_at: minutesAgo(opts.ageMinutes),
    deleted_at: opts.deleted ? minutesAgo(Math.max(1, opts.ageMinutes - 5)) : null,
  };
  bookmarks.push(b);
  return b;
}

function titleFromUrl(url: string): string {
  const host = hostOf(url);
  return host.charAt(0).toUpperCase() + host.slice(1);
}

function sampleContentFor(url: string): string {
  const host = hostOf(url);
  return (
    `Extracted text for ${host}. This is placeholder body copy standing in for the ` +
    `readability-extracted main text of the page (see FR-5, go-readability). In the real ` +
    `backend this would be the article or thread text, capped at 500 KB, with markup stripped.\n\n` +
    `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ` +
    `ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ` +
    `ullamco laboris nisi ut aliquip ex ea commodo consequat.\n\n` +
    `Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat ` +
    `nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui ` +
    `officia deserunt mollit anim id est laborum.`
  );
}

export function seed(): StoreShape {
  const store = emptyStore();
  store.loggedIn = true;
  const { folders, bookmarks } = store;

  const reading = makeFolder(folders, "Reading list", null, 6000);
  const work = makeFolder(folders, "Work", null, 5000);
  const workApi = makeFolder(folders, "API design", work, 4800);
  const workApiDeep = makeFolder(folders, "Archive", workApi, 4700); // depth 3, can't nest further
  const recipes = makeFolder(folders, "Recipes", null, 4000);
  const empty = makeFolder(folders, "Someday", null, 3000); // intentionally left empty

  let age = 2;
  // Root-level bookmarks
  makeBookmark(bookmarks, SAMPLE_LINKS[1], { ageMinutes: age++ });
  makeBookmark(bookmarks, SAMPLE_LINKS[9], { ageMinutes: age++ });
  makeBookmark(bookmarks, SAMPLE_LINKS[18], { ageMinutes: age++ });

  // Reading list: mix of statuses
  makeBookmark(bookmarks, SAMPLE_LINKS[0], { folder_id: reading.id, ageMinutes: age++ });
  makeBookmark(bookmarks, SAMPLE_LINKS[5], { folder_id: reading.id, ageMinutes: age++ });
  makeBookmark(bookmarks, SAMPLE_LINKS[4], { folder_id: reading.id, fetch_status: "failed", ageMinutes: age++ });
  makeBookmark(bookmarks, SAMPLE_LINKS[8], { folder_id: reading.id, fetch_status: "pending", ageMinutes: age++ });

  // Work / API design
  makeBookmark(bookmarks, SAMPLE_LINKS[6], { folder_id: workApi.id, ageMinutes: age++ });
  makeBookmark(bookmarks, SAMPLE_LINKS[7], { folder_id: workApi.id, ageMinutes: age++ });
  makeBookmark(bookmarks, SAMPLE_LINKS[13], { folder_id: workApi.id, ageMinutes: age++ });
  makeBookmark(bookmarks, SAMPLE_LINKS[14], { folder_id: workApi.id, ageMinutes: age++ });
  makeBookmark(bookmarks, SAMPLE_LINKS[10], { folder_id: work.id, ageMinutes: age++ });
  makeBookmark(bookmarks, SAMPLE_LINKS[11], { folder_id: work.id, fetch_status: "pending", ageMinutes: age++ });
  makeBookmark(bookmarks, SAMPLE_LINKS[12], { folder_id: work.id, ageMinutes: age++ });
  makeBookmark(bookmarks, SAMPLE_LINKS[17], { folder_id: workApiDeep.id, ageMinutes: age++ });

  // Recipes (with notes)
  makeBookmark(bookmarks, SAMPLE_LINKS[15], { folder_id: recipes.id, ageMinutes: age++ });
  makeBookmark(bookmarks, SAMPLE_LINKS[16], { folder_id: recipes.id, ageMinutes: age++ });

  // Trashed items (for the Trash screen)
  makeBookmark(bookmarks, { title: "Expired coupon roundup", url: "https://deals.example/expired-2026" }, {
    ageMinutes: 300,
    deleted: true,
  });
  makeBookmark(bookmarks, { title: "Old job posting", url: "https://jobs.example/posting/8841" }, {
    folder_id: null,
    ageMinutes: 250,
    deleted: true,
  });
  makeBookmark(bookmarks, SAMPLE_LINKS[19], { ageMinutes: 200, deleted: true });

  // Bulk filler so "All bookmarks" has enough rows to demonstrate infinite
  // scroll (pages of 50, per openapi.yaml `Limit`).
  const fillerDomains = [
    "articles.example", "longreads.example", "docs.example", "changelog.example",
    "weekly.example", "digest.example", "forum.example", "gist.example",
  ];
  for (let i = 0; i < 70; i++) {
    const domain = fillerDomains[i % fillerDomains.length];
    makeBookmark(
      bookmarks,
      { title: `Saved link #${i + 1} from ${domain}`, url: `https://${domain}/entry/${1000 + i}` },
      { ageMinutes: age++, fetch_status: i % 11 === 0 ? "pending" : i % 17 === 0 ? "failed" : "ok" },
    );
  }

  return store;
}

export function ensureSeeded(): StoreShape {
  const existing = localStorage.getItem(KEY);
  if (existing) {
    try {
      return JSON.parse(existing) as StoreShape;
    } catch {
      // fall through to reseed
    }
  }
  const fresh = seed();
  saveStore(fresh);
  return fresh;
}

export function resetDemoData() {
  const fresh = seed();
  saveStore(fresh);
}
