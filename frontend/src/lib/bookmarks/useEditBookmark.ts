import { useCallback, useRef, useState } from 'react'
import { updateBookmark, type BookmarkChanges } from '../api/bookmarks'
import { ApiError, isUnauthorized } from '../api/ApiError'
import { describeFailure, type FailureDisplay } from './describeFailure'
import { useBookmarkFeedback } from './useBookmarkFeedback'

/**
 * How one save ended: accepted; ignored (a save of this instance was already in flight);
 * unauthorized (a 401, the hook stays silent); or failed, with what to show and the HTTP status
 * (`null` for a network failure).
 */
export type SaveResult =
  | { outcome: 'saved' }
  | { outcome: 'ignored' }
  | { outcome: 'unauthorized' }
  | { outcome: 'failed'; failure: FailureDisplay; status: number | null }

type Options = {
  /** Say "Saved." after a successful save. Default true; the in-place fields turn it off. */
  toastOnSave?: boolean
}

/**
 * Saves edits to one bookmark. A failure is kept for the caller to show (it is not a toast);
 * a second save while one is in flight does nothing.
 */
export function useEditBookmark(id: string, { toastOnSave = true }: Options = {}) {
  const { refresh, toast } = useBookmarkFeedback(id)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<FailureDisplay | null>(null)
  const inFlight = useRef(false)

  /** Resolves how the save ended. */
  const saveChanges = useCallback(
    async (changes: BookmarkChanges): Promise<SaveResult> => {
      if (inFlight.current) return { outcome: 'ignored' }
      inFlight.current = true
      setPending(true)
      setFailure(null)
      try {
        await updateBookmark(id, changes)
      } catch (error) {
        if (isUnauthorized(error)) return { outcome: 'unauthorized' }
        const display = describeFailure(error, 'edit')
        setFailure(display)
        if (display.refresh) void refresh()
        return { outcome: 'failed', failure: display, status: error instanceof ApiError ? error.status : null }
      } finally {
        inFlight.current = false
        setPending(false)
      }
      void refresh()
      if (toastOnSave) toast.show('Saved.', { tone: 'success' })
      return { outcome: 'saved' }
    },
    [id, refresh, toast, toastOnSave],
  )

  /** For the edit dialog: resolves true when the server accepted the changes. */
  const save = useCallback(async (changes: BookmarkChanges): Promise<boolean> => (await saveChanges(changes)).outcome === 'saved', [saveChanges])

  const reset = useCallback(() => setFailure(null), [])

  return { save, saveChanges, pending, failure, reset }
}
