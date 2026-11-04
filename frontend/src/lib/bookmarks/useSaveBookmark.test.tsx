import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/ApiError'
import { createBookmark } from '../api/bookmarks'
import { useSaveBookmark } from './useSaveBookmark'

vi.mock('../api/bookmarks', () => ({ createBookmark: vi.fn() }))

const created = { id: 'new-1' } as Awaited<ReturnType<typeof createBookmark>>

describe('useSaveBookmark', () => {
  beforeEach(() => {
    vi.mocked(createBookmark).mockReset()
  })

  it('starts on the form and creates nothing', () => {
    const { result } = renderHook(() => useSaveBookmark())
    expect(result.current.phase).toBe('form')
    expect(createBookmark).not.toHaveBeenCalled()
  })

  it('goes to saved and resolves with the bookmark', async () => {
    vi.mocked(createBookmark).mockResolvedValue(created)
    const { result } = renderHook(() => useSaveBookmark())
    let saved: unknown
    await act(async () => {
      saved = await result.current.save({ url: 'https://a.test' })
    })
    expect(saved).toBe(created)
    expect(result.current.phase).toBe('saved')
    expect(createBookmark).toHaveBeenCalledWith({ url: 'https://a.test' })
  })

  it('ignores a second save while one is in flight', async () => {
    let resolve: (b: typeof created) => void = () => {}
    vi.mocked(createBookmark).mockReturnValue(new Promise((r) => (resolve = r)))
    const { result } = renderHook(() => useSaveBookmark())
    let first: Promise<unknown> = Promise.resolve()
    let second: unknown = 'unset'
    await act(async () => {
      first = result.current.save({ url: 'https://a.test' })
      second = await result.current.save({ url: 'https://a.test' })
    })
    expect(second).toBeNull()
    expect(result.current.phase).toBe('saving')
    await act(async () => {
      resolve(created)
      await first
    })
    expect(createBookmark).toHaveBeenCalledTimes(1)
  })

  it.each([
    [409, 'duplicate_bookmark', 'duplicate'],
    [422, 'invalid_url', 'error'],
  ] as const)('maps a %s %s failure to the %s phase', async (status, code, phase) => {
    vi.mocked(createBookmark).mockRejectedValue(
      new ApiError(status, { type: 'about:blank', title: 't', status, code }, null),
    )
    const { result } = renderHook(() => useSaveBookmark())
    await act(async () => {
      expect(await result.current.save({ url: 'https://a.test' })).toBeNull()
    })
    expect(result.current.phase).toBe(phase)
    expect(result.current.failure).not.toBeNull()
  })

  it('treats a network failure as an error and allows another save', async () => {
    vi.mocked(createBookmark).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useSaveBookmark())
    await act(async () => {
      await result.current.save({ url: 'https://a.test' })
    })
    expect(result.current.phase).toBe('error')
    act(() => result.current.dismiss())
    expect(result.current.phase).toBe('form')
    expect(result.current.failure).toBeNull()

    vi.mocked(createBookmark).mockResolvedValueOnce(created)
    await act(async () => {
      await result.current.save({ url: 'https://a.test' })
    })
    expect(result.current.phase).toBe('saved')
  })

  it('a 401 is silent: no failure, back to the form, and another save is allowed', async () => {
    vi.mocked(createBookmark).mockRejectedValue(
      new ApiError(401, { type: 'about:blank', title: 't', status: 401, code: 'unauthenticated' }, null),
    )
    const { result } = renderHook(() => useSaveBookmark())
    await act(async () => {
      await result.current.save({ url: 'https://a.test' })
    })
    expect(result.current.phase).toBe('form')
    expect(result.current.failure).toBeNull()

    vi.mocked(createBookmark).mockResolvedValueOnce(created)
    await act(async () => {
      await result.current.save({ url: 'https://a.test' })
    })
    expect(result.current.phase).toBe('saved')
  })
})
