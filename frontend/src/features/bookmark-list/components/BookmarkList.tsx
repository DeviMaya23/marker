import { useState } from 'react'
import { Inbox, Trash2, TriangleAlert } from 'lucide-react'
import { SignedOutMessage } from '../../../components/ui/SignedOutMessage'
import { StatePanel } from '../../../components/ui/StatePanel'
import { useBookmarkList } from '../hooks/useBookmarkList'
import { useVisibleSentinel } from '../hooks/useVisibleSentinel'
import type { BookmarkSummary } from '../../../lib/api/bookmarks'
import { BookmarkEditor } from './BookmarkEditor'
import { BookmarkRow } from './BookmarkRow'
import { ListSkeleton } from './ListSkeleton'
import { TrashRow } from './TrashRow'

/** The live list, or the read-only trash with `trashed`, paged as the user scrolls. */
export function BookmarkList({ trashed = false }: { trashed?: boolean }) {
  const { phase, rows, hasNextPage, isLoadingMore, loadMoreFailed, fetchNext, retry } = useBookmarkList({ trashed })
  const sentinelRef = useVisibleSentinel(fetchNext)
  // The edit dialog lives here, not in a row: a failed save refreshes the list, which may drop the
  // row (gone or trashed), and the dialog with its message must stay. It keeps its own copy.
  const [editing, setEditing] = useState<BookmarkSummary | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  let body
  if (phase === 'signed-out') {
    body = <SignedOutMessage />
  } else if (phase === 'loading') {
    body = (
      <div className="bookmark-list">
        <ListSkeleton rows={6} />
      </div>
    )
  } else if (phase === 'error') {
    body = (
      <StatePanel
        icon={<TriangleAlert size={28} aria-hidden="true" />}
        title="Something went wrong"
        description={trashed ? "Couldn't load the trash." : "Couldn't load your bookmarks."}
        action={
          <button type="button" className="btn" onClick={retry}>
            Try again
          </button>
        }
      />
    )
  } else if (phase === 'empty') {
    body = trashed ? (
      <StatePanel
        icon={<Trash2 size={28} aria-hidden="true" />}
        title="Trash is empty"
        description="Deleted bookmarks show up here."
      />
    ) : (
      <StatePanel
        icon={<Inbox size={28} aria-hidden="true" />}
        title="No bookmarks yet"
        description="Paste a URL above to save your first link."
      />
    )
  } else {
    body = (
      <>
        <div className="bookmark-list">
          {rows.map((bookmark) =>
            trashed ? (
              <TrashRow key={bookmark.id} bookmark={bookmark} />
            ) : (
              <BookmarkRow
                key={bookmark.id}
                bookmark={bookmark}
                onEdit={(b) => {
                  setEditing(b)
                  setEditOpen(true)
                }}
              />
            ),
          )}
          {isLoadingMore && <ListSkeleton rows={2} />}
        </div>
        {loadMoreFailed && (
          <div className="list-error" role="alert">
            <span>Couldn't load more.</span>
            <button type="button" className="btn btn--sm" onClick={retry}>
              Try again
            </button>
          </div>
        )}
        {hasNextPage && !loadMoreFailed && <div ref={sentinelRef} className="list-sentinel" data-testid="list-sentinel" />}
      </>
    )
  }

  return (
    <section aria-label={trashed ? 'Trash' : 'Bookmarks'} aria-busy={phase === 'loading'}>
      {body}
      {editing && <BookmarkEditor key={editing.id} bookmark={editing} open={editOpen} onClose={() => setEditOpen(false)} />}
    </section>
  )
}
