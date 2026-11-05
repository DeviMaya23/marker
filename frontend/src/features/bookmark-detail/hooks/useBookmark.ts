import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../../lib/api/ApiError'
import { getBookmark } from '../../../lib/api/bookmarks'

export const POLL_FAST_MS = 1000
export const POLL_SLOW_MS = 5000
export const FAST_POLL_WINDOW_MS = 30_000

/** Reads one bookmark and, while its page fetch is pending, polls until it finishes. */
export function useBookmark(id: string) {
  // When this page started waiting: the first 30 seconds poll fast, the rest slowly.
  const startedAt = useRef(0)
  useEffect(() => {
    startedAt.current = Date.now()
  }, [id])

  const query = useQuery({
    queryKey: ['bookmark', id],
    queryFn: () => getBookmark(id),
    retry: false,
    refetchInterval: (q) => {
      const error = q.state.error
      if (error instanceof ApiError && (error.status === 401 || error.status === 404)) return false
      // Stop when finished. With no data at all, the screen offers a retry instead.
      if (q.state.data?.fetch_status !== 'pending') return false
      return Date.now() - startedAt.current < FAST_POLL_WINDOW_MS ? POLL_FAST_MS : POLL_SLOW_MS
    },
  })

  return {
    bookmark: query.data,
    error: query.error,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    retry: () => void query.refetch(),
  }
}
