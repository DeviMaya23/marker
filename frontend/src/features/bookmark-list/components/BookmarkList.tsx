import { useState, type ReactNode } from 'react'
import { Inbox, Search, Trash2, TriangleAlert } from 'lucide-react'
import { MoveBookmarkDialog } from '../../../components/ui/MoveBookmarkDialog'
import { StatePanel } from '../../../components/ui/StatePanel'
import { useBookmarkList } from '../hooks/useBookmarkList'
import { useAppliedSearch } from '../hooks/useListSearch'
import { useVisibleSentinel } from '../hooks/useVisibleSentinel'
import type { BookmarkSummary } from '../../../lib/api/bookmarks'
import { BookmarkEditor } from './BookmarkEditor'
import { BookmarkRow } from './BookmarkRow'
import { ListSkeleton } from './ListSkeleton'
import { TrashRow } from './TrashRow'

type Props = {
  trashed?: boolean
  /** Lists this folder's bookmarks (and its subfolders') instead of all of them. */
  folderId?: string
  /** Shown instead of the default "No bookmarks yet" panel when the list is empty. */
  empty?: ReactNode
  /** Shown when the list answers 404 (the folder is gone); without it that is an error. */
  notFound?: ReactNode
}

/** The live list, or the read-only trash with `trashed`, paged as the user scrolls. */
export function BookmarkList({ trashed = false, folderId, empty, notFound }: Props) {
  // The search comes from the URL; the trash is never searched, so it ignores it.
  const applied = useAppliedSearch()
  const search = trashed ? undefined : applied
  const searching = search !== undefined && search.q !== ''
  const { phase, rows, hasNextPage, isLoadingMore, loadMoreFailed, fetchNext, retry } = useBookmarkList({
    trashed,
    folderId,
    search,
  })
  const sentinelRef = useVisibleSentinel(fetchNext)
  // The edit dialog lives here, not in a row: a failed save refreshes the list, which may drop the
  // row (gone or trashed), and the dialog with its message must stay. It keeps its own copy.
  const [editing, setEditing] = useState<BookmarkSummary | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  // The same for the move dialog: a 404 or a 409 refreshes the list and may drop the row.
  const [moving, setMoving] = useState<BookmarkSummary | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)

  let body
  if (phase === 'not-found' && notFound) {
    body = notFound
  } else if (phase === 'loading') {
    body = (
      <div className="bookmark-list">
        <ListSkeleton rows={6} />
      </div>
    )
  } else if (phase === 'error' || phase === 'not-found') {
    body = (
      <StatePanel
        icon={<TriangleAlert size={28} aria-hidden="true" />}
        title="Something went wrong"
        description={
          trashed ? "Couldn't load the trash." : searching ? "Couldn't search your bookmarks." : "Couldn't load your bookmarks."
        }
        action={
          <button type="button" className="btn" onClick={retry}>
            Try again
          </button>
        }
      />
    )
  } else if (phase === 'empty' && searching) {
    body = (
      <StatePanel
        icon={<Search size={28} aria-hidden="true" />}
        title={`No bookmarks match “${search.q}”.`}
        description={`Search matches whole words. Try another word${search.includeNotes ? '.' : ', or include notes.'}`}
      />
    )
  } else if (phase === 'empty' && empty) {
    body = empty
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
                onMove={(b) => {
                  setMoving(b)
                  setMoveOpen(true)
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
    <section aria-label={trashed ? 'Trash' : searching ? 'Search results' : 'Bookmarks'} aria-busy={phase === 'loading'}>
      {body}
      {editing && <BookmarkEditor key={editing.id} bookmark={editing} open={editOpen} onClose={() => setEditOpen(false)} />}
      {moving && <MoveBookmarkDialog key={moving.id} bookmark={moving} open={moveOpen} onClose={() => setMoveOpen(false)} />}
    </section>
  )
}
