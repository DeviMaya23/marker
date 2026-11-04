import type { BookmarkPage, BookmarkSummary } from '../lib/api/bookmarks'
import type { Folder } from '../lib/api/folders'

/** A `BookmarkSummary` with sensible defaults; override what the test cares about. */
export function bookmark(overrides: Partial<BookmarkSummary> = {}): BookmarkSummary {
  const id = overrides.id ?? 'b-1'
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Title ${id}`,
    note: null,
    folder_id: null,
    favicon_url: null,
    fetch_status: 'ok',
    created_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

/** A `BookmarkPage`; `next_cursor` defaults to the last page. */
export function page(items: BookmarkSummary[], next_cursor: string | null = null): BookmarkPage {
  return { items, next_cursor }
}

/** A `Folder` with sensible defaults; override what the test cares about. */
export function folder(overrides: Partial<Folder> = {}): Folder {
  const id = overrides.id ?? 'f-1'
  return {
    id,
    name: `Folder ${id}`,
    parent_id: null,
    depth: 1,
    bookmark_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}
