import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../api/ApiError'
import { deleteBookmark, restoreBookmark, updateBookmark } from '../api/bookmarks'
import { goTo } from '../goTo'
import { hookWrapper } from '../../test/hookWrapper'
import { testClient } from '../../test/wrap'
import { RESTORED_BUT_NOT_MOVED, RESTORED_TO_FOLDER, UNDO_FAILED, useDeleteBookmark } from './useDeleteBookmark'

vi.mock('../api/bookmarks', () => ({ deleteBookmark: vi.fn(), restoreBookmark: vi.fn(), updateBookmark: vi.fn() }))
vi.mock('../goTo', () => ({ goTo: vi.fn() }))

const del = vi.mocked(deleteBookmark)
const restore = vi.mocked(restoreBookmark)
const update = vi.mocked(updateBookmark)
const problem = (status: number, code: string) =>
  new ApiError(status, { type: 'x', title: 't', status, code } as ProblemBody, null)

function setup(undo = true, folderId: string | null = null) {
  const client = testClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const hook = renderHook(() => useDeleteBookmark('b-1', { undo, folderId }), { wrapper: hookWrapper(client, '/trash?x=1') })
  return { ...hook, invalidate }
}

const toneOf = (text: string) => screen.getByText(text).closest('.toast')
const KEYS = [['bookmark-list'], ['bookmark', 'b-1'], ['folders']]
const invalidatedKeys = (spy: ReturnType<typeof setup>['invalidate']) => spy.mock.calls.map(([f]) => f?.queryKey)

beforeEach(() => {
  del.mockReset()
  restore.mockReset()
  update.mockReset()
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
    expect(update).not.toHaveBeenCalled()
    expect(toneOf('Restored to the top level.')).toHaveClass('toast--success')
    expect(invalidatedKeys(invalidate)).toEqual(KEYS)
  })

  it('Undo that fails refreshes and says it could not undo', async () => {
    del.mockResolvedValue(undefined)
    restore.mockRejectedValue(problem(409, 'bookmark_not_in_trash'))
    const { result, invalidate } = setup()
    await act(() => result.current.remove())
    invalidate.mockClear()
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByText(UNDO_FAILED)).toBeInTheDocument()
    expect(toneOf(UNDO_FAILED)).toHaveClass('toast--error')
    expect(invalidatedKeys(invalidate)).toEqual(KEYS)
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

  it('401: no toast, no refresh, and not pending', async () => {
    del.mockRejectedValue(new ApiError(401, null, null))
    const { result, invalidate } = setup()
    await act(() => result.current.remove())
    expect(document.querySelector('.toast')).toBeNull()
    expect(invalidate).not.toHaveBeenCalled()
    expect(result.current.pending).toBe(false)
  })
})

async function undoInFolder(folderId: string | null = 'f-1') {
  del.mockResolvedValue(undefined)
  const hook = setup(true, folderId)
  await act(() => hook.result.current.remove())
  hook.invalidate.mockClear()
  fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
  return hook
}

describe('useDeleteBookmark Undo of a bookmark that was in a folder', () => {
  it('restores, then moves it back with a body of folder_id alone, and refreshes once', async () => {
    restore.mockResolvedValue({} as never)
    update.mockResolvedValue({} as never)
    const { invalidate } = await undoInFolder()
    expect(await screen.findByText(RESTORED_TO_FOLDER)).toBeInTheDocument()
    expect(toneOf(RESTORED_TO_FOLDER)).toHaveClass('toast--success')
    expect(screen.queryByText('Restored to the top level.')).not.toBeInTheDocument()
    expect(restore).toHaveBeenCalledExactlyOnceWith('b-1')
    expect(update).toHaveBeenCalledExactlyOnceWith('b-1', { folder_id: 'f-1' })
    expect(restore.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0])
    expect(invalidatedKeys(invalidate)).toEqual(KEYS)
  })

  it('uses the folder of the render whose remove was called', async () => {
    del.mockResolvedValue(undefined)
    restore.mockResolvedValue({} as never)
    update.mockResolvedValue({} as never)
    const client = testClient()
    const hook = renderHook(
      ({ folderId }: { folderId: string }) => useDeleteBookmark('b-1', { undo: true, folderId }),
      { wrapper: hookWrapper(client, '/'), initialProps: { folderId: 'f-1' } },
    )
    const first = hook.result.current
    hook.rerender({ folderId: 'f-2' })
    await act(() => first.remove())
    hook.rerender({ folderId: 'f-3' })
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByText(RESTORED_TO_FOLDER)).toBeInTheDocument()
    expect(update).toHaveBeenCalledExactlyOnceWith('b-1', { folder_id: 'f-1' })
  })

  it.each([
    ['404', problem(404, 'not_found')],
    ['409 not in trash', problem(409, 'bookmark_not_in_trash')],
    ['429', new ApiError(429, null, 3)],
    ['network', new TypeError('Failed to fetch')],
  ])('restore fails with %s: no second call, "could not undo" as an error', async (_n, error) => {
    restore.mockRejectedValue(error)
    await undoInFolder()
    expect(await screen.findByText(UNDO_FAILED)).toBeInTheDocument()
    expect(toneOf(UNDO_FAILED)).toHaveClass('toast--error')
    expect(update).not.toHaveBeenCalled()
  })

  it('restore fails with 401: no toast, no refresh, no second call', async () => {
    restore.mockRejectedValue(new ApiError(401, null, null))
    const { invalidate } = await undoInFolder()
    await waitFor(() => expect(restore).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(UNDO_FAILED)).not.toBeInTheDocument()
    expect(screen.queryByText("You're logged out.")).not.toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
    expect(invalidatedKeys(invalidate)).toEqual([])
  })

  it.each([
    ['404 not_found', problem(404, 'not_found')],
    ['409 in trash', problem(409, 'bookmark_in_trash')],
    ['429', new ApiError(429, null, 3)],
    ['500', problem(500, 'internal_error')],
    ['network', new TypeError('Failed to fetch')],
  ])('move back fails with %s: neutral toast, one refresh', async (_n, error) => {
    restore.mockResolvedValue({} as never)
    update.mockRejectedValue(error)
    const { invalidate } = await undoInFolder()
    expect(await screen.findByText(RESTORED_BUT_NOT_MOVED)).toBeInTheDocument()
    expect(toneOf(RESTORED_BUT_NOT_MOVED)).toHaveClass('toast--neutral')
    expect(screen.queryByText(RESTORED_TO_FOLDER)).not.toBeInTheDocument()
    expect(invalidatedKeys(invalidate)).toEqual(KEYS)
  })

  it('move back fails with 401: no toast and no refresh', async () => {
    restore.mockResolvedValue({} as never)
    update.mockRejectedValue(new ApiError(401, null, null))
    const { invalidate } = await undoInFolder()
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(RESTORED_BUT_NOT_MOVED)).not.toBeInTheDocument()
    expect(screen.queryByText(RESTORED_TO_FOLDER)).not.toBeInTheDocument()
    expect(screen.queryByText("You're logged out.")).not.toBeInTheDocument()
    expect(invalidatedKeys(invalidate)).toEqual([])
  })

  it('with undo: false there is no Undo, whatever the folder', async () => {
    del.mockResolvedValue(undefined)
    const { result } = setup(false, 'f-1')
    await act(() => result.current.remove())
    expect(await screen.findByText('Moved to trash.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })
})
