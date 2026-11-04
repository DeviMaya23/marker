import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router'
import { useToast } from '../../components/ui/Toast'
import { goTo } from '../goTo'
import { loginHref } from '../loginHref'
import { describeFailure, type BookmarkAction, type FailureDisplay } from './describeFailure'
import { BOOKMARK_LIST_KEY, bookmarkKey } from './queryKeys'

/**
 * What every bookmark mutation does after it answers: refresh what is on screen (no cache
 * writes, no optimistic rows) and tell the user how a failure went.
 */
export function useBookmarkFeedback(id?: string) {
  const client = useQueryClient()
  const toast = useToast()
  const { pathname, search } = useLocation()

  /** Invalidates both lists and the bookmark page's query. */
  const refresh = useCallback(
    () =>
      Promise.all([
        client.invalidateQueries({ queryKey: BOOKMARK_LIST_KEY }),
        client.invalidateQueries({ queryKey: bookmarkKey(id) }),
      ]),
    [client, id],
  )

  /** A failure as a toast, with a "Log in" action for a 401. Refreshes unless nothing changed. */
  const toastFailure = useCallback(
    (error: unknown, action: BookmarkAction, message?: string): FailureDisplay => {
      const display = describeFailure(error, action)
      if (display.refresh) void refresh()
      if (display.signedOut) {
        toast.show(display.message, {
          tone: 'error',
          action: { label: 'Log in', onClick: () => goTo(loginHref(pathname, search)) },
        })
      } else {
        toast.show(message ?? display.message, { tone: display.tone === 'neutral' && !message ? 'neutral' : 'error' })
      }
      return display
    },
    [refresh, toast, pathname, search],
  )

  return { refresh, toastFailure, toast }
}
