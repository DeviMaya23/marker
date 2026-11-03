import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import * as bookmarks from '../../../lib/api/bookmarks'
import type { BookmarkSummary } from '../../../lib/api/types'
import { useSaveBookmark } from './useSaveBookmark'

vi.mock('../../../lib/api/bookmarks')
const createBookmark = vi.mocked(bookmarks.createBookmark)
const created = { id: 'b1' } as BookmarkSummary

beforeEach(() => {
  createBookmark.mockReset()
})

describe('useSaveBookmark', () => {
  it('starts in the form phase and calls nothing', () => {
    const { result } = renderHook(() => useSaveBookmark())
    expect(result.current.phase).toBe('form')
    expect(createBookmark).not.toHaveBeenCalled()
  })

  it('sends the trimmed title only when it is not empty', async () => {
    createBookmark.mockResolvedValue(created)
    const { result } = renderHook(() => useSaveBookmark())
    await act(() => result.current.save('https://a.test', '  Hello  '))
    await act(() => result.current.save('https://a.test', '   '))
    expect(createBookmark.mock.calls).toEqual([[{ url: 'https://a.test', title: 'Hello' }], [{ url: 'https://a.test' }]])
  })

  it('returns the bookmark and moves to saved', async () => {
    createBookmark.mockResolvedValue(created)
    const { result } = renderHook(() => useSaveBookmark())
    let out: BookmarkSummary | null = null
    await act(async () => {
      out = await result.current.save('https://a.test', '')
    })
    expect(out).toBe(created)
    expect(result.current.phase).toBe('saved')
  })

  it('ignores a second save while one is in flight', async () => {
    let finish: (b: BookmarkSummary) => void = () => {}
    createBookmark.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { result } = renderHook(() => useSaveBookmark())
    let first: Promise<unknown> = Promise.resolve()
    await act(async () => {
      first = result.current.save('https://a.test', '')
      await result.current.save('https://a.test', '')
    })
    expect(result.current.phase).toBe('saving')
    await act(async () => {
      finish(created)
      await first
    })
    expect(createBookmark).toHaveBeenCalledTimes(1)
  })

  it('maps a duplicate to the duplicate phase and dismiss returns to the form', async () => {
    createBookmark.mockRejectedValue(
      new ApiError(409, { type: 'about:blank', code: 'duplicate_bookmark', in_trash: true, existing_bookmark_id: 'b9', title: '', status: 409 }, null),
    )
    const { result } = renderHook(() => useSaveBookmark())
    await act(() => result.current.save('https://a.test', ''))
    expect(result.current.phase).toBe('duplicate')
    expect(result.current.failure).toMatchObject({ message: 'This link is in your trash.', existingBookmarkId: 'b9' })
    act(() => result.current.dismiss())
    expect(result.current.phase).toBe('form')
    expect(result.current.failure).toBeNull()
  })

  it('maps another failure to the error phase', async () => {
    createBookmark.mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useSaveBookmark())
    await act(() => result.current.save('https://a.test', ''))
    expect(result.current.phase).toBe('error')
    expect(result.current.failure?.message).toBe("Couldn't save that link.")
  })

  it('maps a 401 to needs-login', async () => {
    createBookmark.mockRejectedValue(new ApiError(401, null, null))
    const { result } = renderHook(() => useSaveBookmark())
    await act(() => result.current.save('https://a.test', ''))
    expect(result.current.phase).toBe('needs-login')
  })

  it('allows a new save after a failure', async () => {
    createBookmark.mockRejectedValueOnce(new ApiError(500, null, null)).mockResolvedValueOnce(created)
    const { result } = renderHook(() => useSaveBookmark())
    await act(() => result.current.save('https://a.test', ''))
    await act(() => result.current.save('https://a.test', ''))
    expect(result.current.phase).toBe('saved')
  })
})
