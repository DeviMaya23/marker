import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../api/ApiError'
import { deleteBookmark, restoreBookmark } from '../api/bookmarks'
import { goTo } from '../goTo'
import { hookWrapper } from '../../test/hookWrapper'
import { testClient } from '../../test/wrap'
import { useDeleteBookmark } from './useDeleteBookmark'

vi.mock('../api/bookmarks', () => ({ deleteBookmark: vi.fn(), restoreBookmark: vi.fn() }))
vi.mock('../goTo', () => ({ goTo: vi.fn() }))

const del = vi.mocked(deleteBookmark)
const restore = vi.mocked(restoreBookmark)
const problem = (status: number, code: string) =>
  new ApiError(status, { type: 'x', title: 't', status, code } as ProblemBody, null)

function setup(undo = true) {
  const client = testClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const hook = renderHook(() => useDeleteBookmark('b-1', { undo }), { wrapper: hookWrapper(client, '/trash?x=1') })
  return { ...hook, invalidate }
}

const invalidatedKeys = (spy: ReturnType<typeof setup>['invalidate']) => spy.mock.calls.map(([f]) => f?.queryKey)

beforeEach(() => {
  del.mockReset()
  restore.mockReset()
  vi.mocked(goTo).mockReset()
})

describe('useDeleteBookmark', () => {
  it('deletes once, refreshes both lists and the page, and offers Undo', async () => {
    del.mockResolvedValue(undefined)
    const { result, invalidate } = setup()
    await act(() => result.current.remove())
    expect(del).toHaveBeenCalledExactlyOnceWith('b-1')
    expect(invalidatedKeys(invalidate)).toEqual([['bookmark-list'], ['bookmark', 'b-1'], ['folders']])
    expect(await screen.findByText('Moved to trash.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('has no Undo when asked for none', async () => {
    del.mockResolvedValue(undefined)
    const { result } = setup(false)
    await act(() => result.current.remove())
    expect(await screen.findByText('Moved to trash.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('is pending while in flight, and a second call sends nothing', async () => {
    let finish: () => void = () => {}
    del.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))
    const { result } = setup()
    act(() => {
      void result.current.remove()
      void result.current.remove()
    })
    expect(del).toHaveBeenCalledTimes(1)
    expect(result.current.pending).toBe(true)
    await act(async () => finish())
    expect(result.current.pending).toBe(false)
  })

  it('Undo restores, refreshes and says so', async () => {
    del.mockResolvedValue(undefined)
    restore.mockResolvedValue({} as never)
    const { result, invalidate } = setup()
    await act(() => result.current.remove())
    invalidate.mockClear()
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Restored to the top level.')).toBeInTheDocument()
    expect(restore).toHaveBeenCalledExactlyOnceWith('b-1')
    expect(invalidatedKeys(invalidate)).toEqual([['bookmark-list'], ['bookmark', 'b-1'], ['folders']])
  })

  it('Undo that fails refreshes and says it could not undo', async () => {
    del.mockResolvedValue(undefined)
    restore.mockRejectedValue(problem(409, 'bookmark_not_in_trash'))
    const { result, invalidate } = setup()
    await act(() => result.current.remove())
    invalidate.mockClear()
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByText("Couldn't undo. It may have been changed elsewhere.")).toBeInTheDocument()
    expect(invalidatedKeys(invalidate)).toEqual([['bookmark-list'], ['bookmark', 'b-1'], ['folders']])
  })

  it.each([
    ['409 in trash', problem(409, 'bookmark_in_trash'), 'It was already in the trash.'],
    ['404', problem(404, 'not_found'), 'That bookmark no longer exists.'],
    ['429 with Retry-After', new ApiError(429, null, 3), 'Too many requests. Try again in about 3 seconds.'],
    ['429 without', new ApiError(429, null, null), 'Too many requests. Try again in a moment.'],
    ['500', problem(500, 'internal_error'), "Couldn't move it to the trash."],
    ['network', new TypeError('Failed to fetch'), "Couldn't move it to the trash."],
  ])('%s: shows the toast and refreshes', async (_name, error, message) => {
    del.mockRejectedValue(error)
    const { result, invalidate } = setup()
    await act(() => result.current.remove())
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(invalidatedKeys(invalidate)).toEqual([['bookmark-list'], ['bookmark', 'b-1'], ['folders']])
    expect(result.current.pending).toBe(false)
  })

  it('401: an error toast whose "Log in" action goes to the login link', async () => {
    del.mockRejectedValue(new ApiError(401, null, null))
    const { result } = setup()
    await act(() => result.current.remove())
    expect(await screen.findByText("You're logged out.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledTimes(1))
    expect(vi.mocked(goTo).mock.calls[0][0]).toContain('return_to=%2Ftrash%3Fx%3D1')
  })
})
