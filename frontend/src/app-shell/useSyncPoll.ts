import { useEffect, useId, useRef } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ApiError } from '../lib/api/ApiError'
import { getSyncVersion } from '../lib/api/sync'
import { BOOKMARK_LIST_KEY } from '../lib/bookmarks/queryKeys'
import { FOLDERS_KEY } from '../lib/folders/queryKeys'

/** The wait between the end of one poll and the start of the next. */
export const SYNC_POLL_MS = 2500

const SYNC_VERSION_KEY = 'sync-version'

/**
 * Polls the server's sync version while the shell is mounted and, when it changes (or the
 * server answers 401), invalidates the folder list and every bookmark list so what is on
 * screen refetches in the background. The first answer is only remembered.
 */
export function useSyncPoll(): void {
  const queryClient = useQueryClient()
  // One token per mounted shell, so a new shell never reads an old number or an old 401.
  const mountToken = useId()
  const remembered = useRef<number | null>(null)
  const refreshedOnStop = useRef(false)

  const query = useQuery({
    queryKey: [SYNC_VERSION_KEY, mountToken],
    queryFn: () => getSyncVersion(),
    // Stopped is derived from the query's own error: signed out, so stop asking.
    enabled: (q) => !isSignedOut(q.state.error),
    retry: false,
    gcTime: 0,
    refetchInterval: (q) => (isSignedOut(q.state.error) ? false : SYNC_POLL_MS),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
  const stopped = isSignedOut(query.error)

  const version = query.data?.version
  useEffect(() => {
    if (version === undefined) return
    const previous = remembered.current
    remembered.current = version
    if (previous === null || previous === version) return
    refreshViews(queryClient)
  }, [version, queryClient])

  useEffect(() => {
    if (!stopped || refreshedOnStop.current) return
    refreshedOnStop.current = true
    refreshViews(queryClient)
  }, [stopped, queryClient])
}

/** Marks the folder list and every bookmark list stale; the ones on screen refetch at once. */
function refreshViews(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: FOLDERS_KEY })
  void queryClient.invalidateQueries({ queryKey: BOOKMARK_LIST_KEY })
}

function isSignedOut(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}
