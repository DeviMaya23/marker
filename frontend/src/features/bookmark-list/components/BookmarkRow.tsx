import { useState } from 'react'
import { ExternalLink, FolderInput, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { Favicon } from '../../../components/ui/Favicon'
import { FetchStatusChip } from '../../../components/ui/FetchStatusChip'
import { Menu } from '../../../components/ui/Menu'
import { MoveBookmarkDialog } from '../../../components/ui/MoveBookmarkDialog'
import type { BookmarkSummary } from '../../../lib/api/bookmarks'
import { useDeleteBookmark } from '../../../lib/bookmarks/useDeleteBookmark'
import { hostOf } from '../../../lib/hostOf'
import { displayTitle } from '../lib/displayTitle'
import { formatDate } from '../lib/formatDate'
import { BookmarkEditor } from './BookmarkEditor'

/**
 * One live bookmark: icon, title, fetch state, and host and date. The whole text area is a
 * link; a button on the right opens the actions (open the original, edit, move, delete).
 *
 * With `onEdit` or `onMove` the owner shows that dialog (the list does, so the dialog outlives
 * the row when a refresh drops it); without it the row shows its own.
 */
export function BookmarkRow({
  bookmark,
  onEdit,
  onMove,
}: {
  bookmark: BookmarkSummary
  onEdit?: (bookmark: BookmarkSummary) => void
  onMove?: (bookmark: BookmarkSummary) => void
}) {
  const [editing, setEditing] = useState(false)
  const [moving, setMoving] = useState(false)
  const del = useDeleteBookmark(bookmark.id, { undo: true, folderId: bookmark.folder_id })
  const title = displayTitle(bookmark)

  return (
    <div className="bookmark-row">
      <Favicon url={bookmark.url} faviconUrl={bookmark.favicon_url} />
      <Link to={`/bookmarks/${bookmark.id}`} className="bookmark-row__main">
        <div className="bookmark-row__title-line">
          <span className="bookmark-row__title">{title}</span>
          {bookmark.fetch_status !== 'ok' && <FetchStatusChip status={bookmark.fetch_status} />}
        </div>
        <div className="bookmark-row__meta-line">
          <span>{hostOf(bookmark.url)}</span>
          <span className="bookmark-row__dot">·</span>
          <span>{formatDate(bookmark.created_at, new Date())}</span>
        </div>
      </Link>
      <div className="bookmark-row__actions">
        <Menu
          label={`Actions for ${title}`}
          disabled={del.pending}
          items={[
            {
              key: 'open',
              label: 'Open original link',
              href: bookmark.url,
              icon: <ExternalLink size={14} aria-hidden="true" />,
            },
            {
              key: 'edit',
              label: 'Edit title & note',
              onSelect: () => (onEdit ? onEdit(bookmark) : setEditing(true)),
              icon: <Pencil size={14} aria-hidden="true" />,
            },
            {
              key: 'move',
              label: 'Move to…',
              onSelect: () => (onMove ? onMove(bookmark) : setMoving(true)),
              icon: <FolderInput size={14} aria-hidden="true" />,
            },
            {
              key: 'delete',
              label: 'Delete',
              danger: true,
              onSelect: () => void del.remove(),
              icon: <Trash2 size={14} aria-hidden="true" />,
            },
          ]}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </Menu>
      </div>
      {!onEdit && <BookmarkEditor bookmark={bookmark} open={editing} onClose={() => setEditing(false)} />}
      {!onMove && <MoveBookmarkDialog bookmark={bookmark} open={moving} onClose={() => setMoving(false)} />}
    </div>
  )
}
