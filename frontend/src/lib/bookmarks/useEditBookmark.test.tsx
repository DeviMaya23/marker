import { act, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../api/ApiError'
import { updateBookmark } from '../api/bookmarks'
import { hookWrapper } from '../../test/hookWrapper'
import { testClient } from '../../test/wrap'
import { useEditBookmark } from './useEditBookmark'

vi.mock('../api/bookmarks', () => ({ updateBookmark: vi.fn() }))

const update = vi.mocked(updateBookmark)

function setup() {
  const client = testClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const hook = renderHook(() => useEditBookmark('b-1'), { wrapper: hookWrapper(client) })
  return { ...hook, invalidate }
}
const keys = (spy: ReturnType<typeof setup>['invalidate']) => spy.mock.calls.map(([f]) => f?.queryKey)

beforeEach(() => {
  update.mockReset()
})

describe('useEditBookmark', () => {
  it('passes the changes through untouched, refreshes and says Saved.', async () => {
    update.mockResolvedValue({} as never)
    const { result, invalidate } = setup()
    let ok = false
    await act(async () => {
      ok = await result.current.save({ note: null })
    })
    expect(ok).toBe(true)
    expect(update).toHaveBeenCalledExactlyOnceWith('b-1', { note: null })
    expect(keys(invalidate)).toEqual([['bookmark-list'], ['bookmark', 'b-1'], ['folders']])
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(result.current.failure).toBeNull()
  })

  it('a second save while one is in flight sends nothing', async () => {
    let finish: () => void = () => {}
    update.mockImplementation(() => new Promise((resolve) => (finish = () => resolve({} as never))))
    const { result } = setup()
    act(() => {
      void result.current.save({ title: 'a' })
      void result.current.save({ title: 'a' })
    })
    expect(update).toHaveBeenCalledTimes(1)
    expect(result.current.pending).toBe(true)
    await act(async () => finish())
    expect(result.current.pending).toBe(false)
  })

  it('keeps a failure for the dialog and refreshes, except for a 422', async () => {
    const { result, invalidate } = setup()
    update.mockRejectedValue(new ApiError(409, { type: 'x', title: 't', status: 409, code: 'bookmark_in_trash' } as ProblemBody, null))
    let ok = true
    await act(async () => {
      ok = await result.current.save({ title: 'a' })
    })
    expect(ok).toBe(false)
    expect(result.current.failure?.message).toBe("This bookmark is in the trash and can't be edited.")
    expect(keys(invalidate)).toEqual([['bookmark-list'], ['bookmark', 'b-1'], ['folders']])
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument()

    invalidate.mockClear()
    update.mockRejectedValue(
      new ApiError(422, { type: 'x', title: 't', status: 422, code: 'validation_error', errors: [{ field: 'note', code: 'too_long' }] } as ProblemBody, null),
    )
    await act(async () => {
      await result.current.save({ note: 'x' })
    })
    expect(result.current.failure?.fields.note).toBe('Note is too long (500 characters at most).')
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('clears the failure on a new save and on reset', async () => {
    const { result } = setup()
    update.mockRejectedValueOnce(new TypeError('x')).mockResolvedValue({} as never)
    await act(async () => void (await result.current.save({ title: 'a' })))
    expect(result.current.failure?.message).toBe("Couldn't save your changes.")
    act(() => result.current.reset())
    expect(result.current.failure).toBeNull()
    update.mockRejectedValueOnce(new TypeError('x'))
    await act(async () => void (await result.current.save({ title: 'a' })))
    await act(async () => void (await result.current.save({ title: 'a' })))
    expect(result.current.failure).toBeNull()
  })

  it('a 401 is marked signed out', async () => {
    update.mockRejectedValue(new ApiError(401, null, null))
    const { result } = setup()
    await act(async () => void (await result.current.save({ title: 'a' })))
    expect(result.current.failure?.signedOut).toBe(true)
  })
})
