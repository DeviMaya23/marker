import { useCallback, useRef, useState } from 'react'
import { updateBookmark } from '../api/bookmarks'
import type { Folder } from '../api/folders'
import { isUnauthorized } from '../api/ApiError'
import { describeFailure, type FailureDisplay } from './describeFailure'
import { useBookmarkFeedback } from './useBookmarkFeedback'

/** The toast for a finished move, with the target's name as it was when the user confirmed. */
export function movedMessage(target: Pick<Folder, 'name'> | null): string {
  return target ? `Moved to “${target.name}”.` : 'Moved to the top level.'
}

/**
 * Moves one bookmark into a folder, or to the top level with `null`. A failure is kept for the
 * dialog to show; a second `move` while one is in flight does nothing. A 404 or a 409 (the
 * bookmark is in the trash) still refreshes, since the screen is out of date.
 */
export function useMoveBookmark(id: string) {
  const { refresh, toast } = useBookmarkFeedback(id)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<FailureDisplay | null>(null)
  const inFlight = useRef(false)

  /** Resolves true when the server moved it. Only `folder_id` is sent. */
  const move = useCallback(
    async (target: Pick<Folder, 'id' | 'name'> | null): Promise<boolean> => {
      if (inFlight.current) return false
      inFlight.current = true
      setPending(true)
      setFailure(null)
      try {
        await updateBookmark(id, { folder_id: target ? target.id : null })
      } catch (error) {
        if (isUnauthorized(error)) return false
        const display = describeFailure(error, 'move')
        setFailure(display)
        if (display.refresh) void refresh()
        return false
      } finally {
        inFlight.current = false
        setPending(false)
      }
      void refresh()
      toast.show(movedMessage(target), { tone: 'success' })
      return true
    },
    [id, refresh, toast],
  )

  const reset = useCallback(() => setFailure(null), [])

  return { move, pending, failure, reset }
}
