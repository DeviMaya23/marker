import { useCallback, useRef, useState } from 'react'
import { emptyTrash } from '../api/bookmarks'
import { describeFailure, type FailureDisplay } from './describeFailure'
import { useBookmarkFeedback } from './useBookmarkFeedback'

/** The success toast for the number the server deleted. */
export function emptiedMessage(deleted: number): string {
  if (deleted === 0) return 'The trash was already empty.'
  return `Permanently deleted ${deleted} ${deleted === 1 ? 'bookmark' : 'bookmarks'}.`
}

/** Empties the trash. A failure is kept for the confirmation dialog to show. */
export function useEmptyTrash() {
  const { refresh, toast } = useBookmarkFeedback()
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<FailureDisplay | null>(null)
  const inFlight = useRef(false)

  /** Resolves true when the trash was emptied. */
  const run = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false
    inFlight.current = true
    setPending(true)
    setFailure(null)
    let deleted: number
    try {
      ;({ deleted } = await emptyTrash())
    } catch (error) {
      const display = describeFailure(error, 'empty')
      setFailure(display)
      if (display.refresh) void refresh()
      return false
    } finally {
      inFlight.current = false
      setPending(false)
    }
    void refresh()
    toast.show(emptiedMessage(deleted), { tone: 'success' })
    return true
  }, [refresh, toast])

  const reset = useCallback(() => setFailure(null), [])

  return { run, pending, failure, reset }
}
