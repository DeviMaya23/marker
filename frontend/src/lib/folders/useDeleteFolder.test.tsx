import { act, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../api/ApiError'
import { deleteFolder } from '../api/folders'
import { hookWrapper } from '../../test/hookWrapper'
import { testClient } from '../../test/wrap'
import { useDeleteFolder } from './useDeleteFolder'

vi.mock('../api/folders', () => ({ deleteFolder: vi.fn() }))
const del = vi.mocked(deleteFolder)

function setup() {
  const client = testClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const hook = renderHook(() => useDeleteFolder('f1'), { wrapper: hookWrapper(client) })
  return { ...hook, keys: () => invalidate.mock.calls.map(([f]) => f?.queryKey) }
}

beforeEach(() => {
  del.mockReset()
})

describe('useDeleteFolder', () => {
  it.each([
    [0, 'Folder deleted.'],
    [1, 'Folder deleted. 1 bookmark moved to the trash.'],
    [5, 'Folder deleted. 5 bookmarks moved to the trash.'],
  ])('toasts from the server numbers: %i trashed', async (trashed, text) => {
    del.mockResolvedValue({ deleted_folders: 2, trashed_bookmarks: trashed })
    const { result } = setup()
    await act(async () => void (await result.current.remove()))
    expect(await screen.findByText(text)).toBeInTheDocument()
  })

  it('deletes once and refreshes folders, lists and every bookmark page', async () => {
    del.mockResolvedValue({ deleted_folders: 1, trashed_bookmarks: 0 })
    const { result, keys } = setup()
    await act(async () => {
      void result.current.remove()
      void result.current.remove()
    })
    expect(del).toHaveBeenCalledExactlyOnceWith('f1')
    expect(keys()).toEqual([['folders'], ['bookmark-list'], ['bookmark']])
  })

  it('refreshes after a 404 and keeps the message', async () => {
    del.mockRejectedValue(new ApiError(404, { type: 'x', title: 't', status: 404, code: 'not_found' } as ProblemBody, null))
    const { result, keys } = setup()
    await act(async () => void (await result.current.remove()))
    expect(result.current.failure).toEqual({ kind: 'dialog', message: 'This folder no longer exists.', refresh: true })
    expect(keys()).toEqual([['folders'], ['bookmark-list'], ['bookmark']])
  })

  it('does not toast a failure as a success', async () => {
    del.mockRejectedValue(new TypeError('offline'))
    const { result } = setup()
    await act(async () => void (await result.current.remove()))
    expect(result.current.failure?.message).toBe("Couldn't delete the folder.")
    expect(screen.queryByText(/Folder deleted/)).not.toBeInTheDocument()
  })
})
