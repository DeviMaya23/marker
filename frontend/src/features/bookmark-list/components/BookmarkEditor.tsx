import { EditBookmarkDialog } from '../../../components/ui/EditBookmarkDialog'
import type { BookmarkSummary } from '../../../lib/api/bookmarks'
import { useEditBookmark } from '../../../lib/bookmarks/useEditBookmark'

/** The edit dialog for one live bookmark, with its save call and failure. */
export function BookmarkEditor({ bookmark, open, onClose }: { bookmark: BookmarkSummary; open: boolean; onClose: () => void }) {
  const edit = useEditBookmark(bookmark.id)
  return (
    <EditBookmarkDialog
      open={open}
      title={bookmark.title}
      note={bookmark.note}
      saving={edit.pending}
      failure={edit.failure}
      onSave={edit.save}
      onClose={() => {
        edit.reset()
        onClose()
      }}
    />
  )
}
