import type { BookmarkSummary } from '../../../lib/api/bookmarks'
import { hostOf } from '../../../lib/hostOf'

/** The title as text, or the host name while the title is empty (or only spaces). */
export function displayTitle(bookmark: Pick<BookmarkSummary, 'title' | 'url'>): string {
  return bookmark.title.trim() === '' ? hostOf(bookmark.url) : bookmark.title
}
