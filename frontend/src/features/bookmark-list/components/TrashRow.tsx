import { Link } from 'react-router'
import { Favicon } from '../../../components/ui/Favicon'
import type { BookmarkSummary } from '../../../lib/api/bookmarks'
import { hostOf } from '../../../lib/hostOf'
import { displayTitle } from '../lib/displayTitle'
import { formatDate } from '../lib/formatDate'

/** One trashed bookmark, read-only: icon, title, host and when it was trashed. */
export function TrashRow({ bookmark }: { bookmark: BookmarkSummary }) {
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
    </div>
  )
}
