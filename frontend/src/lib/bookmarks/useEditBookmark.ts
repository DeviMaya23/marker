import { useCallback, useRef, useState } from 'react'
import { updateBookmark, type BookmarkChanges } from '../api/bookmarks'
import { isUnauthorized } from '../api/ApiError'
import { describeFailure, type FailureDisplay } from './describeFailure'
import { useBookmarkFeedback } from './useBookmarkFeedback'

/**
 * Saves edits to one bookmark for the edit dialog. A failure is kept for the dialog to show
 * (it is not a toast); a second `save` while one is in flight does nothing.
 */
export function useEditBookmark(id: string) {
  const { refresh, toast } = useBookmarkFeedback(id)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<FailureDisplay | null>(null)
  const inFlight = useRef(false)

  /** Resolves true when the server accepted the changes. */
  const save = useCallback(
    async (changes: BookmarkChanges): Promise<boolean> => {
      if (inFlight.current) return false
      inFlight.current = true
      setPending(true)
      setFailure(null)
      try {
        await updateBookmark(id, changes)
      } catch (error) {
        if (isUnauthorized(error)) return false
        const display = describeFailure(error, 'edit')
        setFailure(display)
        if (display.refresh) void refresh()
        return false
      } finally {
        inFlight.current = false
        setPending(false)
      }
      void refresh()
      toast.show('Saved.', { tone: 'success' })
      return true
    },
    [id, refresh, toast],
  )

  const reset = useCallback(() => setFailure(null), [])

  return { save, pending, failure, reset }
}
