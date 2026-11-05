import { useRef, useState } from 'react'
import { ArrowLeft, CircleAlert, Clock, ExternalLink, FolderInput, Pencil, Trash2, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { Banner } from '../../../components/ui/Banner'
import { EditBookmarkDialog } from '../../../components/ui/EditBookmarkDialog'
import { MoveBookmarkDialog } from '../../../components/ui/MoveBookmarkDialog'
import { StatePanel } from '../../../components/ui/StatePanel'
import { ApiError, isUnauthorized } from '../../../lib/api/ApiError'
import type { BookmarkDetail } from '../../../lib/api/bookmarks'
import { useDeleteBookmark } from '../../../lib/bookmarks/useDeleteBookmark'
import { useEditBookmark } from '../../../lib/bookmarks/useEditBookmark'
import { useRestoreBookmark } from '../../../lib/bookmarks/useRestoreBookmark'
import { useFolders } from '../../../lib/folders/useFolders'
import { useBookmark } from '../hooks/useBookmark'
import { hostOf } from '../../../lib/hostOf'
import { Favicon } from '../../../components/ui/Favicon'
import { FetchStatusChip } from '../../../components/ui/FetchStatusChip'
import { EditableNote } from './EditableNote'
import { EditableTitle } from './EditableTitle'

/** The bookmark page: fetch state, folder, note and saved page text, with edit, move, delete and restore. */
export function BookmarkView({ id }: { id: string }) {
  const { bookmark, error, isLoading, isFetching, retry } = useBookmark(id)

  // A 404 wins even when a bookmark is already on screen (a later poll found it gone).
  if (error instanceof ApiError && error.status === 404) {
    return (
      <StatePanel
        icon={<TriangleAlert size={28} aria-hidden="true" />}
        title="Bookmark not found"
        action={<Link to="/">Back to your bookmarks</Link>}
      />
    )
  }
  if (bookmark) return <BookmarkDetailBody bookmark={bookmark} isFetching={isFetching} />
  // A 401 is silent: the login redirect is on its way.
  if (isUnauthorized(error)) return <p className="state-panel">Loading…</p>
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

function BookmarkDetailBody({ bookmark, isFetching }: { bookmark: BookmarkDetail; isFetching: boolean }) {
  const trashed = bookmark.deleted_at !== null
  const title = bookmark.title.trim() === '' ? hostOf(bookmark.url) : bookmark.title
  const [editing, setEditing] = useState(false)
  const [moving, setMoving] = useState(false)
  const folders = useFolders()
  const edit = useEditBookmark(bookmark.id)
  const del = useDeleteBookmark(bookmark.id, { undo: false })
  const restore = useRestoreBookmark(bookmark.id)
  const dropTitle = useRef<(() => void) | null>(null)
  const dropNote = useRef<(() => void) | null>(null)

  return (
    <div className="detail-page">
      <Link to="/" className="detail-page__back">
        <ArrowLeft size={14} aria-hidden="true" /> Back
      </Link>

      {trashed && (
        <Banner tone="trashed" role="status">
          <strong>In trash.</strong> This bookmark is read-only. Restore it to edit it.
          <button
            type="button"
            className="btn btn--sm banner__action"
            onClick={() => void restore.restore()}
            disabled={restore.pending}
          >
            Restore
          </button>
        </Banner>
      )}

      <header className="detail-page__header">
        <Favicon url={bookmark.url} faviconUrl={bookmark.favicon_url} size={28} />
        <div className="detail-page__title-block">
          {trashed ? (
            <h1 className="detail-page__title-readonly">{title}</h1>
          ) : (
            <EditableTitle
              id={bookmark.id}
              url={bookmark.url}
              title={bookmark.title}
              isFetching={isFetching}
              dropRef={dropTitle}
            />
          )}
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

      {!trashed && (
        <div className="detail-page__actions">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => {
              // The dialog starts from the stored values: drop drafts that are not being saved.
              dropTitle.current?.()
              dropNote.current?.()
              setEditing(true)
            }}>
            <Pencil size={14} aria-hidden="true" /> Edit
          </button>
          <button
            type="button"
            className="btn btn--danger-outline btn--sm"
            onClick={() => void del.remove()}
            disabled={del.pending}
          >
            <Trash2 size={14} aria-hidden="true" /> Delete
          </button>
        </div>
      )}

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
        {!trashed && (
          <>
            <div className="detail-page__fact">
              <span className="detail-page__fact-label">Folder</span>
              <span className={folders.isPending && bookmark.folder_id !== null ? 'detail-page__fact-quiet' : undefined}>
                {folderText(bookmark.folder_id, folders)}
              </span>
            </div>
            <button type="button" className="btn btn--secondary btn--sm detail-page__move" onClick={() => setMoving(true)}>
              <FolderInput size={14} aria-hidden="true" /> Move
            </button>
          </>
        )}
      </div>

      {!trashed && <EditableNote id={bookmark.id} note={bookmark.note} isFetching={isFetching} dropRef={dropNote} />}
      {trashed && bookmark.note !== null && (
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
      {!trashed && <MoveBookmarkDialog open={moving} bookmark={bookmark} onClose={() => setMoving(false)} />}
      <EditBookmarkDialog
        open={editing}
        title={bookmark.title}
        note={bookmark.note}
        saving={edit.pending}
        failure={edit.failure}
        onSave={edit.save}
        onClose={() => {
          setEditing(false)
          edit.reset()
        }}
      />
    </div>
  )
}

/** Where the bookmark is: a name (as text), "Top level", a placeholder while loading, or unknown. */
function folderText(folderId: string | null, folders: ReturnType<typeof useFolders>): string {
  if (folderId === null) return 'Top level'
  if (folders.isPending) return 'Loading…'
  return folders.data?.find((f) => f.id === folderId)?.name ?? 'Unknown folder'
}
