import { act, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/ApiError'
import { emptyTrash } from '../api/bookmarks'
import { hookWrapper } from '../../test/hookWrapper'
import { testClient } from '../../test/wrap'
import { emptiedMessage, useEmptyTrash } from './useEmptyTrash'

vi.mock('../api/bookmarks', () => ({ emptyTrash: vi.fn() }))

const empty = vi.mocked(emptyTrash)

function setup() {
  const client = testClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const hook = renderHook(() => useEmptyTrash(), { wrapper: hookWrapper(client) })
  return { ...hook, invalidate }
}

beforeEach(() => {
  empty.mockReset()
})

describe('emptiedMessage', () => {
  it.each([
    [0, 'The trash was already empty.'],
    [1, 'Permanently deleted 1 bookmark.'],
    [2, 'Permanently deleted 2 bookmarks.'],
    [37, 'Permanently deleted 37 bookmarks.'],
  ])('%i', (n, message) => expect(emptiedMessage(n)).toBe(message))
})

describe('useEmptyTrash', () => {
  it('empties once, refreshes and toasts the number the server returned', async () => {
    let finish: (n: number) => void = () => {}
    empty.mockImplementation(() => new Promise((resolve) => (finish = (deleted) => resolve({ deleted }))))
    const { result, invalidate } = setup()
    act(() => {
      void result.current.run()
      void result.current.run()
    })
    expect(empty).toHaveBeenCalledTimes(1)
    expect(result.current.pending).toBe(true)
    await act(async () => finish(4))
    expect(result.current.pending).toBe(false)
    expect(await screen.findByText('Permanently deleted 4 bookmarks.')).toBeInTheDocument()
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([['bookmark-list'], ['bookmark'], ['folders']])
  })

  it.each([
    ['429', new ApiError(429, null, 2), 'Too many requests. Try again in about 2 seconds.'],
    ['500', new ApiError(500, null, null), "Couldn't empty the trash."],
    ['network', new TypeError('x'), "Couldn't empty the trash."],
  ])('%s: keeps the message for the dialog and refreshes, with no toast', async (_name, error, message) => {
    empty.mockRejectedValue(error)
    const { result, invalidate } = setup()
    let ok = true
    await act(async () => {
      ok = await result.current.run()
    })
    expect(ok).toBe(false)
    expect(result.current.failure?.message).toBe(message)
    expect(invalidate).toHaveBeenCalled()
    expect(screen.queryByRole('status')?.textContent ?? '').toBe('')
  })

  it('401 is marked signed out; reset clears the failure', async () => {
    empty.mockRejectedValue(new ApiError(401, null, null))
    const { result } = setup()
    await act(async () => void (await result.current.run()))
    expect(result.current.failure?.signedOut).toBe(true)
    act(() => result.current.reset())
    expect(result.current.failure).toBeNull()
  })
})
