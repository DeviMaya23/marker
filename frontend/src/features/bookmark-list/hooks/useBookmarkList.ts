import { useCallback, useMemo, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ApiError } from '../../../lib/api/ApiError'
import { listBookmarks, type BookmarkSummary } from '../../../lib/api/bookmarks'
import { bookmarkListKey } from '../../../lib/bookmarks/queryKeys'

/**
 * What the screen shows: `loading` the first page, `signed-out` after any 401, `error` when the
 * first page failed, `empty` when there is nothing, otherwise `ready` (rows, maybe with a failed
 * later page).
 */
export type ListPhase = 'loading' | 'signed-out' | 'error' | 'empty' | 'ready'

export type BookmarkListState = {
  phase: ListPhase
  rows: BookmarkSummary[]
  hasNextPage: boolean
  isLoadingMore: boolean
  /** Rows are on screen but the last request (a later page or a refresh) failed. */
  loadMoreFailed: boolean
  /** Requests the next page; does nothing with no next page or while a request is in flight. */
  fetchNext: () => void
  retry: () => void
}

/** The live list, or the trash with `{ trashed: true }`, as pages fetched on demand. */
export function useBookmarkList({ trashed }: { trashed: boolean }): BookmarkListState {
  const query = useInfiniteQuery({
    queryKey: bookmarkListKey(trashed),
    queryFn: ({ pageParam }) => listBookmarks({ trashed, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    retry: false,
  })
  const { data, error, hasNextPage, isFetching, fetchNextPage, refetch } = query

  // Two events in one tick both see the same render, so the guard has to be a ref.
  const busy = useRef(false)
  const run = useCallback((request: () => Promise<unknown>) => {
    if (busy.current) return
    busy.current = true
    void request().finally(() => {
      busy.current = false
    })
  }, [])

  const fetchNext = useCallback(() => {
    if (!hasNextPage || isFetching) return
    run(() => fetchNextPage())
  }, [hasNextPage, isFetching, fetchNextPage, run])

  const retry = useCallback(() => {
    run(() => (data && query.isFetchNextPageError ? fetchNextPage() : refetch()))
  }, [data, query.isFetchNextPageError, fetchNextPage, refetch, run])

  // The same bookmark on two pages (it moved while paging) is shown once, where it first appeared.
  const rows = useMemo(() => {
    const seen = new Set<string>()
    return (data?.pages ?? []).flatMap((p) => p.items).filter((b) => !seen.has(b.id) && seen.add(b.id))
  }, [data])

  const signedOut = error instanceof ApiError && error.status === 401
  let phase: ListPhase
  if (signedOut) phase = 'signed-out'
  else if (query.isPending) phase = 'loading'
  else if (!data) phase = 'error'
  else if (rows.length === 0 && !hasNextPage && !error) phase = 'empty'
  else phase = 'ready'

  return {
    phase,
    rows,
    hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMoreFailed: Boolean(data) && error !== null && !signedOut,
    fetchNext,
    retry,
  }
}
