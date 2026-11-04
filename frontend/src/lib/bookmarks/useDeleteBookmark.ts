import { useCallback, useRef, useState } from 'react'
import { deleteBookmark, restoreBookmark } from '../api/bookmarks'
import { useBookmarkFeedback } from './useBookmarkFeedback'

export const UNDO_FAILED = "Couldn't undo. It may have been changed elsewhere."

/**
 * Moves one bookmark to the trash. With `undo`, the success toast carries an "Undo" that
 * restores it. A second call while one is in flight does nothing.
 */
export function useDeleteBookmark(id: string, { undo }: { undo: boolean }) {
  const { refresh, toastFailure, toast } = useBookmarkFeedback(id)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)

  const remove = useCallback(async () => {
    if (inFlight.current) return
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
            onClick: () => {
              restoreBookmark(id).then(
                () => {
                  void refresh()
                  toast.show('Restored to the top level.', { tone: 'success' })
                },
                (error: unknown) => toastFailure(error, 'restore', UNDO_FAILED),
              )
            },
          }
        : undefined,
    })
  }, [id, undo, refresh, toastFailure, toast])

  return { remove, pending }
}
