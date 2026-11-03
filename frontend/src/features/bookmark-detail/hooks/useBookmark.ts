import { useQuery } from '@tanstack/react-query'
import type { Query } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '../../../lib/api/ApiError'
import { getBookmark } from '../../../lib/api/bookmarks'
import type { BookmarkDetail } from '../../../lib/api/types'

const FAST_POLL_MS = 1000
const SLOW_POLL_MS = 5000
const FAST_POLL_WINDOW_MS = 30_000

/**
 * Reads one bookmark. While its page fetch is `pending` it refetches every second for
 * the first 30 seconds, then every 5 seconds. It stops when the status is `ok` or
 * `failed`, on a 404 or 401, and when the page using it unmounts.
 */
export function useBookmark(id: string) {
  const [startedAt] = useState(() => Date.now())

  const query = useQuery<BookmarkDetail, Error>({
    queryKey: ['bookmark', id],
    queryFn: () => getBookmark(id),
    retry: false,
    refetchInterval: (q: Query<BookmarkDetail, Error>) => {
      const err = q.state.error
      if (err instanceof ApiError && (err.status === 404 || err.status === 401)) return false
      if (q.state.data?.fetch_status !== 'pending') return false
      return Date.now() - startedAt < FAST_POLL_WINDOW_MS ? FAST_POLL_MS : SLOW_POLL_MS
    },
  })

  return {
    bookmark: query.data,
    error: query.error,
    isLoading: query.isPending,
    retry: () => void query.refetch(),
  }
}
