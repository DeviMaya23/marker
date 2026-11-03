import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import * as bookmarks from '../../../lib/api/bookmarks'
import type { BookmarkDetail } from '../../../lib/api/types'
import { useBookmark } from './useBookmark'

vi.mock('../../../lib/api/bookmarks')
const getBookmark = vi.mocked(bookmarks.getBookmark)

function detail(fetch_status: BookmarkDetail['fetch_status']): BookmarkDetail {
  return { id: 'b1', fetch_status } as BookmarkDetail
}

function mount() {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => useBookmark('b1'), { wrapper })
}

async function elapse(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  vi.useFakeTimers()
  getBookmark.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useBookmark polling', () => {
  it('refetches every second while pending', async () => {
    getBookmark.mockResolvedValue(detail('pending'))
    mount()
    await elapse(0)
    expect(getBookmark).toHaveBeenCalledTimes(1)
    await elapse(1000)
    expect(getBookmark).toHaveBeenCalledTimes(2)
    await elapse(3000)
    expect(getBookmark).toHaveBeenCalledTimes(5)
  })

  it('moves to every 5 seconds after 30 seconds', async () => {
    getBookmark.mockResolvedValue(detail('pending'))
    mount()
    await elapse(31_000)
    const before = getBookmark.mock.calls.length
    expect(before).toBeGreaterThanOrEqual(30)
    await elapse(10_000)
    expect(getBookmark.mock.calls.length - before).toBe(2)
  })

  it.each(['ok', 'failed'] as const)('stops once the status becomes %s', async (final) => {
    getBookmark.mockResolvedValueOnce(detail('pending')).mockResolvedValue(detail(final))
    const { result } = mount()
    await elapse(0)
    await elapse(1000)
    await elapse(10)
    expect(result.current.bookmark?.fetch_status).toBe(final)
    const calls = getBookmark.mock.calls.length
    await elapse(60_000)
    expect(getBookmark).toHaveBeenCalledTimes(calls)
  })

  it('does not poll a bookmark that is already complete', async () => {
    getBookmark.mockResolvedValue(detail('ok'))
    mount()
    await elapse(30_000)
    expect(getBookmark).toHaveBeenCalledTimes(1)
  })

  it.each([404, 401])('stops on a %i', async (status) => {
    getBookmark.mockResolvedValueOnce(detail('pending')).mockRejectedValue(new ApiError(status, null, null))
    const { result } = mount()
    await elapse(0)
    await elapse(1000)
    await elapse(10)
    expect(result.current.error).toBeInstanceOf(ApiError)
    const calls = getBookmark.mock.calls.length
    await elapse(60_000)
    expect(getBookmark).toHaveBeenCalledTimes(calls)
  })

  it('does not poll a first load that failed with a 404', async () => {
    getBookmark.mockRejectedValue(new ApiError(404, null, null))
    mount()
    await elapse(30_000)
    expect(getBookmark).toHaveBeenCalledTimes(1)
  })

  it('stops after the page unmounts', async () => {
    getBookmark.mockResolvedValue(detail('pending'))
    const { unmount } = mount()
    await elapse(2000)
    unmount()
    const calls = getBookmark.mock.calls.length
    await elapse(60_000)
    expect(getBookmark).toHaveBeenCalledTimes(calls)
  })

  it('keeps polling through a transient failure while the bookmark is still pending', async () => {
    getBookmark.mockResolvedValueOnce(detail('pending')).mockRejectedValueOnce(new ApiError(503, null, null)).mockResolvedValue(detail('ok'))
    const { result } = mount()
    await elapse(3000)
    expect(result.current.bookmark?.fetch_status).toBe('ok')
  })
})
