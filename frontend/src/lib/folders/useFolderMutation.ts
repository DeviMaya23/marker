import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../components/ui/useToast'
import { BOOKMARK_LIST_KEY, bookmarkKey } from '../bookmarks/queryKeys'
import { FOLDERS_KEY } from './queryKeys'
import { folderFailureMessage, type FolderAction, type FolderFailure } from './folderFailureMessage'

type Options<A extends unknown[], R> = {
  action: FolderAction
  call: (...args: A) => Promise<R>
  /** The success toast, from the server's answer. */
  successMessage: (result: R) => string
  /** A delete also changes the bookmark pages (their bookmarks went to the trash). */
  refreshBookmarkPages?: boolean
}

/**
 * What every folder call does: one call at a time, the failure mapped for the dialog, and a
 * refresh after it answers (no cache writes, nothing optimistic). A 422 or 409 changed nothing,
 * so it does not refresh.
 */
export function useFolderMutation<A extends unknown[], R>({
  action,
  call,
  successMessage,
  refreshBookmarkPages = false,
}: Options<A, R>) {
  const client = useQueryClient()
  const toast = useToast()
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<FolderFailure | null>(null)
  const inFlight = useRef(false)

  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: FOLDERS_KEY })
    void client.invalidateQueries({ queryKey: BOOKMARK_LIST_KEY })
    if (refreshBookmarkPages) void client.invalidateQueries({ queryKey: bookmarkKey() })
  }, [client, refreshBookmarkPages])

  /** Runs the call once; resolves with the server's answer, or null on a failure or a repeat. */
  const run = useCallback(
    async (...args: A): Promise<R | null> => {
      if (inFlight.current) return null
      inFlight.current = true
      setFailure(null)
      setPending(true)
      try {
        const result = await call(...args)
        refresh()
        toast.show(successMessage(result), { tone: 'success' })
        return result
      } catch (error) {
        const described = folderFailureMessage(action, error)
        if (described.refresh) refresh()
        setFailure(described)
        return null
      } finally {
        inFlight.current = false
        setPending(false)
      }
    },
    [action, call, refresh, successMessage, toast],
  )

  /** Forgets a shown failure (the user changed the field, or closed the dialog). */
  const reset = useCallback(() => setFailure(null), [])

  return { run, pending, failure, reset }
}
