import { Link } from 'react-router'
import { ApiError } from '../../../lib/api/ApiError'
import type { BookmarkDetail } from '../../../lib/api/types'
import { SignedOut } from '../../auth/components/SignedOut'
import { useBookmark } from '../hooks/useBookmark'
import { Favicon } from './Favicon'
import { FetchStatusChip } from './FetchStatusChip'

const savedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function titleOf(b: BookmarkDetail): string {
  if (b.title !== '') return b.title
  return b.fetch_status === 'pending' ? 'Fetching a title…' : 'Untitled'
}

function PageText({ bookmark }: { bookmark: BookmarkDetail }) {
  if (bookmark.fetch_status === 'pending') {
    return <p className="detail-page__content-placeholder">Still fetching this page. The text will appear here once it's ready.</p>
  }
  if (bookmark.fetch_status === 'failed') {
    return <p className="detail-page__content-placeholder">We couldn't fetch this page's text. The link above still works.</p>
  }
  if (bookmark.content === null) {
    return <p className="detail-page__content-placeholder">No text was saved for this page.</p>
  }
  // A text node, never HTML. Line breaks are kept by white-space: pre-wrap.
  return <div className="detail-page__content-body">{bookmark.content}</div>
}

function Message({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="state-panel">
      <h1 className="state-panel__title">{title}</h1>
      {description && <p className="state-panel__desc">{description}</p>}
      {children && <div className="state-panel__action">{children}</div>}
    </div>
  )
}

/** The read-only bookmark page (part of brief screen 3). */
export function BookmarkView({ id }: { id: string }) {
  const { bookmark, error, isLoading, retry } = useBookmark(id)

  // A 401 on a later poll leaves the old data in place; the signed-out state still wins.
  if (error instanceof ApiError && error.status === 401) return <SignedOut />

  if (!bookmark) {
    if (isLoading) return <p role="status">Loading…</p>
    if (error instanceof ApiError && error.status === 404) {
      return (
        <Message title="Bookmark not found">
          <Link to="/">Back to home</Link>
        </Message>
      )
    }
    return (
      <Message title="Something went wrong" description="That didn't work. Please try again.">
        <button type="button" className="btn btn--secondary" onClick={retry}>
          Try again
        </button>
      </Message>
    )
  }

  return (
    <div className="detail-page">
      <Link to="/" className="detail-page__back">
        ← Back
      </Link>

      {bookmark.deleted_at && (
        <div className="banner banner--trashed" role="status">
          <strong>In trash.</strong> This bookmark is read-only.
        </div>
      )}

      <header className="detail-page__header">
        <Favicon url={bookmark.url} faviconUrl={bookmark.favicon_url} />
        <div className="detail-page__title-block">
          <h1 className="detail-page__title-readonly">{titleOf(bookmark)}</h1>
          <div className="detail-page__url-row">
            <a href={bookmark.url} target="_blank" rel="noopener noreferrer" className="detail-page__url">
              {bookmark.url}
            </a>
          </div>
        </div>
      </header>

      <div className="detail-page__facts">
        <div className="detail-page__fact">
          <span className="detail-page__fact-label">Saved</span>
          <time dateTime={bookmark.created_at}>{savedFormat.format(new Date(bookmark.created_at))}</time>
        </div>
        <div className="detail-page__fact">
          <span className="detail-page__fact-label">Fetch status</span>
          <FetchStatusChip status={bookmark.fetch_status} />
        </div>
      </div>

      {bookmark.note !== null && (
        <div className="detail-page__note">
          <h2 className="detail-page__content-heading">Note</h2>
          <p className="detail-page__note-text">{bookmark.note}</p>
        </div>
      )}

      <div className="detail-page__content">
        <h2 className="detail-page__content-heading">Page text</h2>
        <PageText bookmark={bookmark} />
      </div>
    </div>
  )
}
