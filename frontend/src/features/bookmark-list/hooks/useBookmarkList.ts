import { useCallback, useMemo, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ApiError } from '../../../lib/api/ApiError'
import { listBookmarks, type BookmarkSummary } from '../../../lib/api/bookmarks'
import { bookmarkListKey } from '../../../lib/bookmarks/queryKeys'
import type { ListSearch } from '../lib/listSearch'

/**
 * What the screen shows: `loading` the first page, `signed-out` after any 401, `not-found` when
 * the list itself answered 404 (a folder that does not exist), `error` when the first page
 * failed, `empty` when there is nothing, otherwise `ready` (rows, maybe with a failed later page).
 */
export type ListPhase = 'loading' | 'signed-out' | 'not-found' | 'error' | 'empty' | 'ready'

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

/**
 * The live list, or the trash with `{ trashed: true }`, or one folder's bookmarks (and its
 * subfolders') with a `folderId`, as pages fetched on demand. With a non-empty `search.q` it is a
 * search, in the server's relevance order; the trash is never searched, so `search` is ignored
 * with `trashed`.
 */
export function useBookmarkList({
  trashed,
  folderId,
  search,
}: {
  trashed: boolean
  folderId?: string
  search?: ListSearch
}): BookmarkListState {
  const term = !trashed && search && search.q !== '' ? search : undefined
  const queryKey = bookmarkListKey(trashed, folderId, term)
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      listBookmarks({
        trashed,
        cursor: pageParam,
        ...(folderId !== undefined ? { folderId } : {}),
        ...(term ? { q: term.q, ...(term.includeNotes ? { includeNotes: true } : {}) } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    retry: false,
  })
  const { data, error, hasNextPage, isFetching, fetchNextPage, refetch } = query

  // Two events in one tick both see the same render, so the guard has to be a ref. It is per
  // list: a request still running for an earlier term must not block the current one.
  const listId = JSON.stringify(queryKey)
  const busy = useRef<string | null>(null)
  const run = useCallback(
    (request: () => Promise<unknown>) => {
      if (busy.current === listId) return
      busy.current = listId
      void request().finally(() => {
        if (busy.current === listId) busy.current = null
      })
    },
    [listId],
  )

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
  else if (!data && error instanceof ApiError && error.status === 404) phase = 'not-found'
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
