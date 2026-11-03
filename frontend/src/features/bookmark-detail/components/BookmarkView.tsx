import { ArrowLeft, CircleAlert, Clock, ExternalLink, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { Banner } from '../../../components/ui/Banner'
import { SignedOutMessage } from '../../../components/ui/SignedOutMessage'
import { StatePanel } from '../../../components/ui/StatePanel'
import { ApiError } from '../../../lib/api/ApiError'
import type { BookmarkDetail } from '../../../lib/api/bookmarks'
import { useBookmark } from '../hooks/useBookmark'
import { hostOf } from '../../../lib/hostOf'
import { Favicon } from '../../../components/ui/Favicon'
import { FetchStatusChip } from '../../../components/ui/FetchStatusChip'

/** The read-only bookmark page: fetch state, note and saved page text. */
export function BookmarkView({ id }: { id: string }) {
  const { bookmark, error, isLoading, retry } = useBookmark(id)

  // A 401 or 404 wins even when a bookmark is already on screen (a later poll found it gone).
  if (error instanceof ApiError && error.status === 401) return <SignedOutMessage />
  if (error instanceof ApiError && error.status === 404) {
    return (
      <StatePanel
        icon={<TriangleAlert size={28} aria-hidden="true" />}
        title="Bookmark not found"
        action={<Link to="/">Back to your bookmarks</Link>}
      />
    )
  }
  if (bookmark) return <BookmarkDetailBody bookmark={bookmark} />
  if (isLoading) return <p className="state-panel">Loading…</p>
  return (
    <StatePanel
      icon={<TriangleAlert size={28} aria-hidden="true" />}
      title="Something went wrong"
      description="That didn't work. Please try again."
      action={
        <button className="btn btn--secondary" onClick={retry}>
          Try again
        </button>
      }
    />
  )
}

function BookmarkDetailBody({ bookmark }: { bookmark: BookmarkDetail }) {
  const trashed = bookmark.deleted_at !== null
  const title = bookmark.title.trim() === '' ? hostOf(bookmark.url) : bookmark.title

  return (
    <div className="detail-page">
      <Link to="/" className="detail-page__back">
        <ArrowLeft size={14} aria-hidden="true" /> Back
      </Link>

      {trashed && (
        <Banner tone="trashed" role="status">
          <strong>In trash.</strong> This bookmark is read-only.
        </Banner>
      )}

      <header className="detail-page__header">
        <Favicon url={bookmark.url} faviconUrl={bookmark.favicon_url} size={28} />
        <div className="detail-page__title-block">
          <h1 className="detail-page__title-readonly">{title}</h1>
          <div className="detail-page__url-row">
            <a href={bookmark.url} target="_blank" rel="noopener noreferrer" className="detail-page__url">
              {bookmark.url}
            </a>
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              className="icon-btn icon-btn--sm"
              aria-label="Open original link"
            >
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      <div className="detail-page__facts">
        <div className="detail-page__fact">
          <span className="detail-page__fact-label">Saved</span>
          <time dateTime={bookmark.created_at}>
            {new Date(bookmark.created_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </time>
        </div>
        <div className="detail-page__fact">
          <span className="detail-page__fact-label">Fetch status</span>
          <FetchStatusChip status={bookmark.fetch_status} />
        </div>
      </div>

      {bookmark.note !== null && (
        <div className="detail-page__note">
          <h2 className="field__label">Note</h2>
          <p className="detail-page__note-text">{bookmark.note}</p>
        </div>
      )}

      <div className="detail-page__content">
        <h2 className="detail-page__content-heading">Page text</h2>
        {bookmark.fetch_status === 'pending' && (
          <p className="detail-page__content-placeholder">
            <Clock size={14} aria-hidden="true" /> Still fetching this page. The text will appear here
            once it's ready.
          </p>
        )}
        {bookmark.fetch_status === 'failed' && (
          <p className="detail-page__content-placeholder">
            <CircleAlert size={14} aria-hidden="true" /> We couldn't fetch this page's text. The link
            above still works.
          </p>
        )}
        {bookmark.fetch_status === 'ok' && (
          // A text node, never parsed as HTML; white-space: pre-wrap keeps the line breaks.
          <div className="detail-page__content-body">{bookmark.content}</div>
        )}
      </div>
    </div>
  )
}
