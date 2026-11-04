import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router'
import { Favicon } from '../../../components/ui/Favicon'
import type { BookmarkSummary } from '../../../lib/api/bookmarks'
import { useRestoreBookmark } from '../../../lib/bookmarks/useRestoreBookmark'
import { hostOf } from '../../../lib/hostOf'
import { displayTitle } from '../lib/displayTitle'
import { formatDate } from '../lib/formatDate'

/** One trashed bookmark: icon, title, host and when it was trashed, with Open original link and Restore. */
export function TrashRow({ bookmark }: { bookmark: BookmarkSummary }) {
  const { restore, pending } = useRestoreBookmark(bookmark.id)
  return (
    <div className="bookmark-row">
      <Favicon url={bookmark.url} faviconUrl={bookmark.favicon_url} />
      <Link to={`/bookmarks/${bookmark.id}`} className="bookmark-row__main">
        <div className="bookmark-row__title-line">
          <span className="bookmark-row__title">{displayTitle(bookmark)}</span>
        </div>
        <div className="bookmark-row__meta-line">
          <span>{hostOf(bookmark.url)}</span>
          {bookmark.deleted_at && (
            <>
              <span className="bookmark-row__dot">·</span>
              <span>trashed {formatDate(bookmark.deleted_at, new Date())}</span>
            </>
          )}
        </div>
      </Link>
      <div className="bookmark-row__actions">
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="icon-btn"
          aria-label="Open original link"
        >
          <ExternalLink size={16} aria-hidden="true" />
        </a>
        <button type="button" className="btn btn--sm" onClick={() => void restore()} disabled={pending}>
          Restore
        </button>
      </div>
    </div>
  )
}
