import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../components/ui/useToast'
import { isUnauthorized } from '../api/ApiError'
import { describeFailure, type BookmarkAction } from './describeFailure'
import { FOLDERS_KEY } from '../folders/queryKeys'
import { BOOKMARK_LIST_KEY, bookmarkKey } from './queryKeys'

/**
 * What every bookmark mutation does after it answers: refresh what is on screen (no cache
 * writes, no optimistic rows) and tell the user how a failure went.
 */
export function useBookmarkFeedback(id?: string) {
  const client = useQueryClient()
  const toast = useToast()

  /**
   * Invalidates every list, the bookmark page's query and the folder list (the sidebar's counts
   * change with every bookmark change).
   */
  const refresh = useCallback(
    () =>
      Promise.all([
        client.invalidateQueries({ queryKey: BOOKMARK_LIST_KEY }),
        client.invalidateQueries({ queryKey: bookmarkKey(id) }),
        client.invalidateQueries({ queryKey: FOLDERS_KEY }),
      ]),
    [client, id],
  )

  /** A failure as a toast. Refreshes unless nothing changed. A 401 is silent: the login redirect is on its way. */
  const toastFailure = useCallback(
    (error: unknown, action: BookmarkAction, message?: string): void => {
      if (isUnauthorized(error)) return
      const display = describeFailure(error, action)
      if (display.refresh) void refresh()
      toast.show(message ?? display.message, { tone: display.tone === 'neutral' && !message ? 'neutral' : 'error' })
    },
    [refresh, toast],
  )

  return { refresh, toastFailure, toast }
}
