import { Link } from 'react-router'
import { Favicon } from '../../../components/ui/Favicon'
import { FetchStatusChip } from '../../../components/ui/FetchStatusChip'
import type { BookmarkSummary } from '../../../lib/api/bookmarks'
import { hostOf } from '../../../lib/hostOf'
import { displayTitle } from '../lib/displayTitle'
import { formatDate } from '../lib/formatDate'

/** One live bookmark: icon, title, fetch state, and host and date. The whole text area is a link. */
export function BookmarkRow({ bookmark }: { bookmark: BookmarkSummary }) {
  return (
    <div className="bookmark-row">
      <Favicon url={bookmark.url} faviconUrl={bookmark.favicon_url} />
      <Link to={`/bookmarks/${bookmark.id}`} className="bookmark-row__main">
        <div className="bookmark-row__title-line">
          <span className="bookmark-row__title">{displayTitle(bookmark)}</span>
          {bookmark.fetch_status !== 'ok' && <FetchStatusChip status={bookmark.fetch_status} />}
        </div>
        <div className="bookmark-row__meta-line">
          <span>{hostOf(bookmark.url)}</span>
          <span className="bookmark-row__dot">·</span>
          <span>{formatDate(bookmark.created_at, new Date())}</span>
        </div>
      </Link>
    </div>
  )
}
