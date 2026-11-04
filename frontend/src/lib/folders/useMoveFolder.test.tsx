import { act, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../api/ApiError'
import { updateFolder } from '../api/folders'
import { folder } from '../../test/builders'
import { hookWrapper } from '../../test/hookWrapper'
import { testClient } from '../../test/wrap'
import { useMoveFolder } from './useMoveFolder'

vi.mock('../api/folders', () => ({ updateFolder: vi.fn() }))
const update = vi.mocked(updateFolder)

function setup() {
  const client = testClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const hook = renderHook(() => useMoveFolder('f1'), { wrapper: hookWrapper(client) })
  return { ...hook, invalidate }
}
const keys = (spy: ReturnType<typeof setup>['invalidate']) => spy.mock.calls.map(([f]) => f?.queryKey)
const problem = (status: number, code: string) => new ApiError(status, { type: 'x', title: 't', status, code } as ProblemBody, null)

beforeEach(() => {
  update.mockReset()
})

describe('useMoveFolder', () => {
  it('sends only parent_id, refreshes the folders and the lists, and toasts the target name', async () => {
    update.mockResolvedValue(folder({ id: 'f1' }))
    const { result, invalidate } = setup()
    let moved: unknown = null
    await act(async () => {
      moved = await result.current.move({ id: 'p-1', name: 'Work' })
    })
    expect(moved).not.toBeNull()
    expect(update).toHaveBeenCalledExactlyOnceWith('f1', { parentId: 'p-1' })
    expect(keys(invalidate)).toEqual([['folders'], ['bookmark-list']])
    expect(await screen.findByText('Folder moved to “Work”.')).toBeInTheDocument()
  })

  it('moves to the top level with an explicit null; the answer is not null even then', async () => {
    update.mockResolvedValue(folder({ id: 'f1' }))
    const { result } = setup()
    let moved: unknown = null
    await act(async () => {
      moved = await result.current.move(null)
    })
    expect(moved).not.toBeNull()
    expect(update).toHaveBeenCalledExactlyOnceWith('f1', { parentId: null })
    expect(await screen.findByText('Folder moved to the top level.')).toBeInTheDocument()
  })

  it.each([
    ['409 folder_name_conflict', problem(409, 'folder_name_conflict'), 'A folder with this name already exists there.'],
    ['422 folder_depth_exceeded', problem(422, 'folder_depth_exceeded'), 'Folders can only be nested 3 levels deep.'],
    ['422 folder_cycle', problem(422, 'folder_cycle'), "A folder can't be moved into itself or one of its own subfolders."],
  ])('%s shows in the dialog and does not refresh', async (_name, error, message) => {
    update.mockRejectedValue(error)
    const { result, invalidate } = setup()
    await act(async () => {
      expect(await result.current.move({ id: 'p-1', name: 'Work' })).toBeNull()
    })
    expect(result.current.failure).toEqual({ kind: 'dialog', message, refresh: false })
    expect(invalidate).not.toHaveBeenCalled()
    expect(screen.queryByText(/^Folder moved/)).not.toBeInTheDocument()
  })

  it('a 404 refreshes', async () => {
    update.mockRejectedValue(problem(404, 'not_found'))
    const { result, invalidate } = setup()
    await act(async () => {
      await result.current.move(null)
    })
    expect(result.current.failure?.message).toBe('That folder no longer exists.')
    expect(keys(invalidate)).toEqual([['folders'], ['bookmark-list']])
  })

  it('sends once when called twice in a row', async () => {
    let finish: () => void = () => {}
    update.mockImplementation(() => new Promise((resolve) => (finish = () => resolve(folder()))))
    const { result } = setup()
    act(() => {
      void result.current.move(null)
      void result.current.move(null)
    })
    expect(update).toHaveBeenCalledTimes(1)
    await act(async () => finish())
  })
})
