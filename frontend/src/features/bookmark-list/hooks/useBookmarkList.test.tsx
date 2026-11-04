import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import { listBookmarks } from '../../../lib/api/bookmarks'
import { bookmark, page } from '../../../test/builders'
import { useBookmarkList } from './useBookmarkList'

vi.mock('../../../lib/api/bookmarks', () => ({ listBookmarks: vi.fn() }))

const list = vi.mocked(listBookmarks)

function setup(
  trashed = false,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  folderId?: string,
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useBookmarkList({ trashed, folderId }), { wrapper })
}

const cursors = () => list.mock.calls.map(([args]) => args?.cursor)

describe('useBookmarkList', () => {
  beforeEach(() => {
    list.mockReset()
  })

  it('requests the first page with no cursor and maps it to rows', async () => {
    list.mockResolvedValue(page([bookmark({ id: 'a' }), bookmark({ id: 'b' })], 'c1'))
    const { result } = setup()
    expect(result.current.phase).toBe('loading')
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    expect(result.current.rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(result.current.hasNextPage).toBe(true)
    expect(list).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledWith({ trashed: false, cursor: undefined })
    expect(list.mock.calls[0][0]).not.toHaveProperty('limit')
  })

  it('pages with the previous next_cursor and stops when it is null', async () => {
    list
      .mockResolvedValueOnce(page([bookmark({ id: 'a' })], 'c1'))
      .mockResolvedValueOnce(page([bookmark({ id: 'b' })], 'c2'))
      .mockResolvedValueOnce(page([bookmark({ id: 'c' })], null))
    const { result } = setup()
    await waitFor(() => expect(result.current.phase).toBe('ready'))

    act(() => result.current.fetchNext())
    await waitFor(() => expect(result.current.rows).toHaveLength(2))
    act(() => result.current.fetchNext())
    await waitFor(() => expect(result.current.rows).toHaveLength(3))
    expect(cursors()).toEqual([undefined, 'c1', 'c2'])
    expect(result.current.hasNextPage).toBe(false)

    act(() => result.current.fetchNext())
    expect(list).toHaveBeenCalledTimes(3)
  })

  it('makes one request when asked three times while one is in flight', async () => {
    let resolve: (p: ReturnType<typeof page>) => void = () => {}
    list.mockResolvedValueOnce(page([bookmark({ id: 'a' })], 'c1'))
    list.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    const { result } = setup()
    await waitFor(() => expect(result.current.phase).toBe('ready'))

    act(() => {
      result.current.fetchNext()
      result.current.fetchNext()
      result.current.fetchNext()
    })
    await waitFor(() => expect(result.current.isLoadingMore).toBe(true))
    act(() => result.current.fetchNext())
    expect(list).toHaveBeenCalledTimes(2)

    await act(async () => resolve(page([bookmark({ id: 'b' })])))
    await waitFor(() => expect(result.current.rows).toHaveLength(2))
  })

  it('shows empty for an empty page, but keeps paging when a cursor is still set', async () => {
    list.mockResolvedValueOnce(page([]))
    const empty = setup()
    await waitFor(() => expect(empty.result.current.phase).toBe('empty'))

    list.mockReset()
    list.mockResolvedValueOnce(page([], 'c1')).mockResolvedValueOnce(page([bookmark({ id: 'a' })]))
    const { result } = setup()
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    act(() => result.current.fetchNext())
    await waitFor(() => expect(result.current.rows).toHaveLength(1))
  })

  it('shows a bookmark that appears on two pages once', async () => {
    list
      .mockResolvedValueOnce(page([bookmark({ id: 'a' }), bookmark({ id: 'b' })], 'c1'))
      .mockResolvedValueOnce(page([bookmark({ id: 'b' }), bookmark({ id: 'c' })]))
    const { result } = setup()
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    act(() => result.current.fetchNext())
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(['a', 'b', 'c']))
  })

  it('reports a first-page error, and retry requests the first page again', async () => {
    list.mockRejectedValueOnce(new ApiError(500, null, null))
    list.mockResolvedValueOnce(page([bookmark({ id: 'a' })]))
    const { result } = setup()
    await waitFor(() => expect(result.current.phase).toBe('error'))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    expect(cursors()).toEqual([undefined, undefined])
  })

  it('treats a 429 like any other error', async () => {
    list.mockRejectedValueOnce(new ApiError(429, null, 3))
    const { result } = setup()
    await waitFor(() => expect(result.current.phase).toBe('error'))
  })

  it('keeps the rows on a later-page error, and retry asks for the same cursor', async () => {
    list
      .mockResolvedValueOnce(page([bookmark({ id: 'a' })], 'c1'))
      .mockRejectedValueOnce(new ApiError(500, null, null))
      .mockResolvedValueOnce(page([bookmark({ id: 'b' })]))
    const { result } = setup()
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    act(() => result.current.fetchNext())
    await waitFor(() => expect(result.current.loadMoreFailed).toBe(true))
    expect(result.current.phase).toBe('ready')
    expect(result.current.rows.map((r) => r.id)).toEqual(['a'])

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(['a', 'b']))
    expect(result.current.loadMoreFailed).toBe(false)
    expect(cursors()).toEqual([undefined, 'c1', 'c1'])
  })

  it.each([
    ['first', false],
    ['later', true],
  ])('reports signed-out for a 401 on the %s page', async (_name, later) => {
    if (later) {
      list.mockResolvedValueOnce(page([bookmark({ id: 'a' })], 'c1'))
      list.mockRejectedValueOnce(new ApiError(401, null, null))
    } else {
      list.mockRejectedValueOnce(new ApiError(401, null, null))
    }
    const { result } = setup()
    if (later) {
      await waitFor(() => expect(result.current.phase).toBe('ready'))
      act(() => result.current.fetchNext())
    }
    await waitFor(() => expect(result.current.phase).toBe('signed-out'))
  })

  it('survives a refresh (as after a save) while the next page is in flight', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    list.mockResolvedValueOnce(page([bookmark({ id: 'a' })], 'c1'))
    const { result } = setup(false, client)
    await waitFor(() => expect(result.current.phase).toBe('ready'))

    list.mockReturnValueOnce(new Promise(() => {}))
    act(() => result.current.fetchNext())
    await waitFor(() => expect(result.current.isLoadingMore).toBe(true))
    list.mockResolvedValue(page([bookmark({ id: 'n' }), bookmark({ id: 'a' })], 'c1'))
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['bookmark-list'] })
    })
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(['n', 'a']))
    expect(result.current.phase).toBe('ready')
  })

  it('keeps the live list and the trash in separate caches', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    list.mockResolvedValueOnce(page([bookmark({ id: 'live' })]))
    const live = setup(false, client)
    await waitFor(() => expect(live.result.current.phase).toBe('ready'))

    list.mockReturnValueOnce(new Promise(() => {}))
    const trash = setup(true, client)
    expect(trash.result.current.phase).toBe('loading')
    expect(trash.result.current.rows).toEqual([])
    expect(list).toHaveBeenLastCalledWith({ trashed: true, cursor: undefined })
  })

  describe('with a folder id', () => {
    it('requests that folder, and sends no folder id without one', async () => {
      list.mockResolvedValue(page([bookmark({ id: 'a' })]))
      const { result } = setup(false, undefined, 'f-1')
      await waitFor(() => expect(result.current.phase).toBe('ready'))
      expect(list).toHaveBeenCalledWith({ trashed: false, cursor: undefined, folderId: 'f-1' })

      list.mockClear()
      const plain = setup()
      await waitFor(() => expect(plain.result.current.phase).toBe('ready'))
      expect(list.mock.calls[0][0]).not.toHaveProperty('folderId')
    })

    it('keeps two folders in separate cache entries under the bookmark-list prefix', async () => {
      list.mockImplementation(({ folderId } = {}) => Promise.resolve(page([bookmark({ id: `in-${folderId}` })])))
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const one = setup(false, client, 'f-1')
      const two = setup(false, client, 'f-2')
      await waitFor(() => expect(two.result.current.phase).toBe('ready'))
      await waitFor(() => expect(one.result.current.phase).toBe('ready'))
      expect(one.result.current.rows.map((r) => r.id)).toEqual(['in-f-1'])
      expect(two.result.current.rows.map((r) => r.id)).toEqual(['in-f-2'])
      expect(list).toHaveBeenCalledTimes(2)
      const keys = client.getQueryCache().findAll({ queryKey: ['bookmark-list'] })
      expect(keys).toHaveLength(2)
    })

    it('pages with the next cursor, keeping the folder', async () => {
      list.mockResolvedValueOnce(page([bookmark({ id: 'a' })], 'c1')).mockResolvedValueOnce(page([bookmark({ id: 'b' })]))
      const { result } = setup(false, undefined, 'f-1')
      await waitFor(() => expect(result.current.hasNextPage).toBe(true))
      act(() => result.current.fetchNext())
      await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(['a', 'b']))
      expect(list).toHaveBeenLastCalledWith({ trashed: false, cursor: 'c1', folderId: 'f-1' })
    })

    it('has the not-found phase on a 404 of the first page, and error on other failures', async () => {
      list.mockRejectedValue(new ApiError(404, null, null))
      const missing = setup(false, undefined, 'gone')
      await waitFor(() => expect(missing.result.current.phase).toBe('not-found'))

      list.mockRejectedValue(new ApiError(500, null, null))
      const broken = setup(false, undefined, 'f-1')
      await waitFor(() => expect(broken.result.current.phase).toBe('error'))
    })
  })
})
