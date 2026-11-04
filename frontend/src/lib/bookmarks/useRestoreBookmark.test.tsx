import { act, fireEvent, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../api/ApiError'
import { restoreBookmark } from '../api/bookmarks'
import { goTo } from '../goTo'
import { hookWrapper } from '../../test/hookWrapper'
import { testClient } from '../../test/wrap'
import { useRestoreBookmark } from './useRestoreBookmark'

vi.mock('../api/bookmarks', () => ({ restoreBookmark: vi.fn() }))
vi.mock('../goTo', () => ({ goTo: vi.fn() }))

const restore = vi.mocked(restoreBookmark)
const problem = (status: number, code: string) =>
  new ApiError(status, { type: 'x', title: 't', status, code } as ProblemBody, null)

function setup() {
  const client = testClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const hook = renderHook(() => useRestoreBookmark('b-1'), { wrapper: hookWrapper(client) })
  return { ...hook, invalidate }
}
const keys = (spy: ReturnType<typeof setup>['invalidate']) => spy.mock.calls.map(([f]) => f?.queryKey)

beforeEach(() => {
  restore.mockReset()
  vi.mocked(goTo).mockReset()
})

describe('useRestoreBookmark', () => {
  it('restores once, refreshes and toasts; pending while in flight', async () => {
    let finish: () => void = () => {}
    restore.mockImplementation(() => new Promise((resolve) => (finish = () => resolve({} as never))))
    const { result, invalidate } = setup()
    act(() => {
      void result.current.restore()
      void result.current.restore()
    })
    expect(restore).toHaveBeenCalledTimes(1)
    expect(result.current.pending).toBe(true)
    await act(async () => finish())
    expect(result.current.pending).toBe(false)
    expect(await screen.findByText('Restored to the top level.')).toBeInTheDocument()
    expect(keys(invalidate)).toEqual([['bookmark-list'], ['bookmark', 'b-1'], ['folders']])
  })

  it.each([
    ['409 not in trash', problem(409, 'bookmark_not_in_trash'), 'It was already restored.'],
    ['404', problem(404, 'not_found'), 'That bookmark no longer exists.'],
    ['429', new ApiError(429, null, 9), 'Too many requests. Try again in about 9 seconds.'],
    ['500', problem(500, 'internal_error'), "Couldn't restore it."],
    ['network', new TypeError('x'), "Couldn't restore it."],
  ])('%s: toast and refresh', async (_name, error, message) => {
    restore.mockRejectedValue(error)
    const { result, invalidate } = setup()
    await act(() => result.current.restore())
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(keys(invalidate)).toEqual([['bookmark-list'], ['bookmark', 'b-1'], ['folders']])
  })

  it('401: the logged-out toast with a Log in action', async () => {
    restore.mockRejectedValue(new ApiError(401, null, null))
    const { result } = setup()
    await act(() => result.current.restore())
    expect(await screen.findByText("You're logged out.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(goTo).toHaveBeenCalledTimes(1)
  })
})
