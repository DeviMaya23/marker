import { useCallback, useRef, useState } from 'react'
import { restoreBookmark } from '../api/bookmarks'
import { useBookmarkFeedback } from './useBookmarkFeedback'

/** Restores one trashed bookmark to the top level. A second call while in flight does nothing. */
export function useRestoreBookmark(id: string) {
  const { refresh, toastFailure, toast } = useBookmarkFeedback(id)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)

  const restore = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    try {
      await restoreBookmark(id)
    } catch (error) {
      toastFailure(error, 'restore')
      return
    } finally {
      inFlight.current = false
      setPending(false)
    }
    void refresh()
    toast.show('Restored to the top level.', { tone: 'success' })
  }, [id, refresh, toastFailure, toast])

  return { restore, pending }
}
