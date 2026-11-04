import type { BookmarkSummary } from '../../lib/api/bookmarks'
import { useMoveBookmark } from '../../lib/bookmarks/useMoveBookmark'
import { useFolders } from '../../lib/folders/useFolders'
import { hostOf } from '../../lib/hostOf'
import { MoveDialog } from './MoveDialog'

type Props = {
  open: boolean
  bookmark: Pick<BookmarkSummary, 'id' | 'title' | 'url' | 'folder_id'>
  onClose: () => void
}

/** The move dialog for one live bookmark, with the folder list and the move call wired in. */
export function MoveBookmarkDialog({ open, bookmark, onClose }: Props) {
  const folders = useFolders()
  const move = useMoveBookmark(bookmark.id)
  const name = bookmark.title.trim() === '' ? hostOf(bookmark.url) : bookmark.title

  return (
    <MoveDialog
      open={open}
      itemName={name}
      currentLocation={bookmark.folder_id}
      folders={{
        items: folders.data,
        pending: folders.isPending,
        error: folders.error,
        retry: () => void folders.refetch(),
      }}
      working={move.pending}
      failure={move.failure}
      onConfirm={move.move}
      onClose={() => {
        move.reset()
        onClose()
      }}
    />
  )
}
