import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import { getBookmark, type BookmarkDetail } from '../../../lib/api/bookmarks'
import { useBookmark } from './useBookmark'

vi.mock('../../../lib/api/bookmarks', () => ({ getBookmark: vi.fn() }))

function bookmark(fetch_status: BookmarkDetail['fetch_status']): BookmarkDetail {
  return { id: 'b-1', url: 'https://a.test', fetch_status } as BookmarkDetail
}

function failure(status: number) {
  return new ApiError(status, null, null)
}

function render() {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useBookmark('b-1'), { wrapper })
}

/** Moves the fake clock forward, letting each timer's promises settle. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
    // TanStack Query hands results to React on a 0 ms timer; let that run too.
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
  })
}

const calls = () => vi.mocked(getBookmark).mock.calls.length

describe('useBookmark polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // By default TanStack Query hands results to React on a 0 ms timer, which would shift
    // the fake clock the polling assertions count on. Deliver them as a microtask instead.
    notifyManager.setScheduler((callback) => queueMicrotask(callback))
    vi.mocked(getBookmark).mockReset()
  })

  afterEach(() => {
    notifyManager.setScheduler((callback) => setTimeout(callback, 0))
    vi.useRealTimers()
  })

  it('loads the bookmark once and does not poll when it is already finished', async () => {
    vi.mocked(getBookmark).mockResolvedValue(bookmark('ok'))
    const { result } = render()
    await advance(0)
    expect(result.current.bookmark?.fetch_status).toBe('ok')
    await advance(60_000)
    expect(calls()).toBe(1)
  })

  it('reports isFetching while a fetch is in flight and not after', async () => {
    let finish: (b: BookmarkDetail) => void = () => {}
    vi.mocked(getBookmark).mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const { result } = render()
    await advance(0)
    expect(result.current.isFetching).toBe(true)
    await act(async () => finish(bookmark('ok')))
    await advance(0)
    expect(result.current.isFetching).toBe(false)
  })

  it('refetches every second while pending', async () => {
    vi.mocked(getBookmark).mockResolvedValue(bookmark('pending'))
    render()
    await advance(0)
    expect(calls()).toBe(1)
    await advance(1000)
    expect(calls()).toBe(2)
    await advance(1000)
    expect(calls()).toBe(3)
    await advance(999)
    expect(calls()).toBe(3)
  })

  it('moves to every 5 seconds after 30 seconds', async () => {
    vi.mocked(getBookmark).mockResolvedValue(bookmark('pending'))
    render()
    await advance(0)
    await advance(30_000)
    const atThirty = calls()
    expect(atThirty).toBe(31)
    await advance(4999)
    expect(calls()).toBe(atThirty)
    await advance(1)
    expect(calls()).toBe(atThirty + 1)
    await advance(5000)
    expect(calls()).toBe(atThirty + 2)
  })

  it.each(['ok', 'failed'] as const)('stops once the status is %s', async (final) => {
    vi.mocked(getBookmark)
      .mockResolvedValueOnce(bookmark('pending'))
      .mockResolvedValueOnce(bookmark('pending'))
      .mockResolvedValue(bookmark(final))
    const { result } = render()
    await advance(0)
    await advance(2000)
    expect(result.current.bookmark?.fetch_status).toBe(final)
    expect(calls()).toBe(3)
    await advance(60_000)
    expect(calls()).toBe(3)
  })

  it.each([404, 401])('stops on a %s', async (status) => {
    vi.mocked(getBookmark)
      .mockResolvedValueOnce(bookmark('pending'))
      .mockRejectedValue(failure(status))
    const { result } = render()
    await advance(0)
    await advance(1000)
    expect(calls()).toBe(2)
    expect((result.current.error as ApiError).status).toBe(status)
    // The bookmark from the earlier poll is still held; the screen decides to hide it.
    expect(result.current.bookmark).toBeDefined()
    await advance(60_000)
    expect(calls()).toBe(2)
  })

  it('keeps the data and keeps polling after any other failure on a later poll', async () => {
    vi.mocked(getBookmark)
      .mockResolvedValueOnce(bookmark('pending'))
      .mockRejectedValueOnce(failure(500))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(bookmark('ok'))
    const { result } = render()
    await advance(0)
    await advance(1000)
    expect(result.current.bookmark?.fetch_status).toBe('pending')
    expect(result.current.error).not.toBeNull()
    await advance(1000)
    expect(result.current.bookmark?.fetch_status).toBe('pending')
    await advance(1000)
    expect(result.current.bookmark?.fetch_status).toBe('ok')
    expect(result.current.error).toBeNull()
    expect(calls()).toBe(4)
  })

  it('does not poll after a failed first load, and retry loads again', async () => {
    vi.mocked(getBookmark).mockRejectedValueOnce(failure(500)).mockResolvedValue(bookmark('ok'))
    const { result } = render()
    await advance(0)
    expect(result.current.bookmark).toBeUndefined()
    await advance(10_000)
    expect(calls()).toBe(1)
    act(() => result.current.retry())
    await advance(0)
    expect(result.current.bookmark?.fetch_status).toBe('ok')
  })

  it('stops polling when the page is left', async () => {
    vi.mocked(getBookmark).mockResolvedValue(bookmark('pending'))
    const { unmount } = render()
    await advance(0)
    await advance(1000)
    expect(calls()).toBe(2)
    unmount()
    await advance(60_000)
    expect(calls()).toBe(2)
  })

  it('stops polling when the page is left while a poll is in flight', async () => {
    let finish: (b: BookmarkDetail) => void = () => {}
    vi.mocked(getBookmark)
      .mockResolvedValueOnce(bookmark('pending'))
      .mockReturnValueOnce(new Promise((r) => (finish = r)))
    const { unmount } = render()
    await advance(0)
    await advance(1000)
    expect(calls()).toBe(2)
    unmount()
    await act(async () => finish(bookmark('pending')))
    await advance(60_000)
    expect(calls()).toBe(2)
  })
})
