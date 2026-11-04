import { useCallback, useRef, useState } from 'react'
import { isUnauthorized } from '../api/ApiError'
import { deleteBookmark, restoreBookmark, updateBookmark } from '../api/bookmarks'
import { useBookmarkFeedback } from './useBookmarkFeedback'

export const UNDO_FAILED = "Couldn't undo. It may have been changed elsewhere."
export const RESTORED_TO_FOLDER = 'Restored to its folder.'
export const RESTORED_BUT_NOT_MOVED = "Restored to the top level. Couldn't move it back to its folder."

/**
 * Moves one bookmark to the trash. With `undo`, the success toast carries an "Undo" that
 * restores it. A second call while one is in flight does nothing.
 */
export function useDeleteBookmark(
  id: string,
  { undo, folderId = null }: { undo: boolean; folderId?: string | null },
) {
  const { refresh, toastFailure, toast } = useBookmarkFeedback(id)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)

  /** Restores (the server puts it at the top level), then moves it back into its folder. */
  const undoDelete = useCallback(
    async (folder: string | null) => {
      try {
        await restoreBookmark(id)
      } catch (error) {
        toastFailure(error, 'restore', UNDO_FAILED)
        return
      }
      if (folder === null) {
        void refresh()
        toast.show('Restored to the top level.', { tone: 'success' })
        return
      }
      try {
        await updateBookmark(id, { folder_id: folder })
      } catch (error) {
        if (isUnauthorized(error)) return
        void refresh()
        toast.show(RESTORED_BUT_NOT_MOVED, { tone: 'neutral' })
        return
      }
      void refresh()
      toast.show(RESTORED_TO_FOLDER, { tone: 'success' })
    },
    [id, refresh, toastFailure, toast],
  )

  const remove = useCallback(async () => {
    if (inFlight.current) return
    // Read now: the row has left the list, and may re-render, by the time Undo is pressed.
    const folderAtDelete = folderId
    inFlight.current = true
    setPending(true)
    try {
      await deleteBookmark(id)
    } catch (error) {
      toastFailure(error, 'delete')
      return
    } finally {
      inFlight.current = false
      setPending(false)
    }
    void refresh()
    toast.show('Moved to trash.', {
      action: undo
        ? {
            label: 'Undo',
            onClick: () => void undoDelete(folderAtDelete),
          }
        : undefined,
    })
  }, [id, undo, folderId, undoDelete, refresh, toastFailure, toast])

  return { remove, pending }
}
