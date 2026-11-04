import { act, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../api/ApiError'
import { updateBookmark } from '../api/bookmarks'
import { hookWrapper } from '../../test/hookWrapper'
import { testClient } from '../../test/wrap'
import { useMoveBookmark } from './useMoveBookmark'

vi.mock('../api/bookmarks', () => ({ updateBookmark: vi.fn() }))
const update = vi.mocked(updateBookmark)

function setup() {
  const client = testClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const setData = vi.spyOn(client, 'setQueryData')
  const hook = renderHook(() => useMoveBookmark('b-1'), { wrapper: hookWrapper(client) })
  return { ...hook, invalidate, setData }
}
const keys = (spy: ReturnType<typeof setup>['invalidate']) => spy.mock.calls.map(([f]) => f?.queryKey)
const problem = (status: number, code: string) => new ApiError(status, { type: 'x', title: 't', status, code } as ProblemBody, null)

beforeEach(() => {
  update.mockReset()
})

describe('useMoveBookmark', () => {
  it('sends folder_id once, refreshes the lists, the page and the folders, and toasts the folder name', async () => {
    update.mockResolvedValue({} as never)
    const { result, invalidate, setData } = setup()
    let ok = false
    await act(async () => {
      ok = await result.current.move({ id: 'f-1', name: 'Recipes' })
    })
    expect(ok).toBe(true)
    expect(update).toHaveBeenCalledExactlyOnceWith('b-1', { folder_id: 'f-1' })
    expect(keys(invalidate)).toEqual([['bookmark-list'], ['bookmark', 'b-1'], ['folders']])
    expect(setData).not.toHaveBeenCalled()
    expect(await screen.findByText('Moved to “Recipes”.')).toBeInTheDocument()
    expect(result.current.failure).toBeNull()
  })

  it('sends an explicit null for the top level and says so', async () => {
    update.mockResolvedValue({} as never)
    const { result } = setup()
    await act(async () => {
      await result.current.move(null)
    })
    expect(update).toHaveBeenCalledExactlyOnceWith('b-1', { folder_id: null })
    expect(await screen.findByText('Moved to the top level.')).toBeInTheDocument()
  })

  it('a second move while one is in flight sends nothing', async () => {
    let finish: () => void = () => {}
    update.mockImplementation(() => new Promise((resolve) => (finish = () => resolve({} as never))))
    const { result } = setup()
    act(() => {
      void result.current.move(null)
      void result.current.move(null)
    })
    expect(update).toHaveBeenCalledTimes(1)
    expect(result.current.pending).toBe(true)
    await act(async () => finish())
    expect(result.current.pending).toBe(false)
  })

  it.each([
    ['404', problem(404, 'not_found'), 'That bookmark or folder no longer exists.'],
    ['409 bookmark_in_trash', problem(409, 'bookmark_in_trash'), "This bookmark is in the trash and can't be moved."],
  ])('keeps the %s failure for the dialog, refreshes and shows no toast', async (_name, error, message) => {
    update.mockRejectedValue(error)
    const { result, invalidate } = setup()
    let ok = true
    await act(async () => {
      ok = await result.current.move({ id: 'f-1', name: 'X' })
    })
    expect(ok).toBe(false)
    expect(result.current.failure?.message).toBe(message)
    expect(keys(invalidate)).toEqual([['bookmark-list'], ['bookmark', 'b-1'], ['folders']])
    expect(screen.queryByText(/^Moved to/)).not.toBeInTheDocument()
  })

  it('a 401 is a signed-out failure and still refreshes', async () => {
    update.mockRejectedValue(new ApiError(401, null, null))
    const { result, invalidate } = setup()
    await act(async () => {
      await result.current.move(null)
    })
    expect(result.current.failure?.signedOut).toBe(true)
    expect(invalidate).toHaveBeenCalled()
  })

  it('a network failure says it could not move the bookmark; reset forgets it', async () => {
    update.mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = setup()
    await act(async () => {
      await result.current.move(null)
    })
    expect(result.current.failure?.message).toBe("Couldn't move the bookmark.")
    act(() => result.current.reset())
    expect(result.current.failure).toBeNull()
  })
})
