import { useState } from 'react'
import { ExternalLink, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { EditBookmarkDialog } from '../../../components/ui/EditBookmarkDialog'
import { Favicon } from '../../../components/ui/Favicon'
import { FetchStatusChip } from '../../../components/ui/FetchStatusChip'
import { Menu } from '../../../components/ui/Menu'
import type { BookmarkSummary } from '../../../lib/api/bookmarks'
import { useDeleteBookmark } from '../../../lib/bookmarks/useDeleteBookmark'
import { useEditBookmark } from '../../../lib/bookmarks/useEditBookmark'
import { hostOf } from '../../../lib/hostOf'
import { displayTitle } from '../lib/displayTitle'
import { formatDate } from '../lib/formatDate'

/**
 * One live bookmark: icon, title, fetch state, and host and date. The whole text area is a
 * link; a button on the right opens the actions (open the original, edit, delete).
 */
export function BookmarkRow({ bookmark }: { bookmark: BookmarkSummary }) {
  const [editing, setEditing] = useState(false)
  const edit = useEditBookmark(bookmark.id)
  const del = useDeleteBookmark(bookmark.id, { undo: true })
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
              onSelect: () => setEditing(true),
              icon: <Pencil size={14} aria-hidden="true" />,
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
