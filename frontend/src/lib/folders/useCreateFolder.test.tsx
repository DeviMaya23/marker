import { act, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../api/ApiError'
import { createFolder } from '../api/folders'
import { folder } from '../../test/builders'
import { hookWrapper } from '../../test/hookWrapper'
import { testClient } from '../../test/wrap'
import { useCreateFolder } from './useCreateFolder'

vi.mock('../api/folders', () => ({ createFolder: vi.fn() }))
const create = vi.mocked(createFolder)

function setup() {
  const client = testClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const hook = renderHook(() => useCreateFolder(), { wrapper: hookWrapper(client) })
  const keys = () => invalidate.mock.calls.map(([f]) => f?.queryKey)
  return { ...hook, keys }
}
const problem = (status: number, code: string, errors?: { field: string; code: string }[]) =>
  new ApiError(status, { type: 'x', title: 't', status, code, errors } as ProblemBody, null)

beforeEach(() => {
  create.mockReset()
})

describe('useCreateFolder', () => {
  it('creates once, refreshes folders and the lists (not the bookmark pages) and toasts', async () => {
    create.mockResolvedValue(folder({ id: 'new' }))
    const { result, keys } = setup()
    let created
    await act(async () => {
      created = await result.current.create({ name: 'Recipes', parentId: 'p' })
    })
    expect(created).toEqual(folder({ id: 'new' }))
    expect(create).toHaveBeenCalledExactlyOnceWith({ name: 'Recipes', parentId: 'p' })
    expect(keys()).toEqual([['folders'], ['bookmark-list']])
    expect(await screen.findByText('Folder created.')).toBeInTheDocument()
  })

  it('sends nothing for a second call while one is in flight', async () => {
    let finish: (f: ReturnType<typeof folder>) => void = () => {}
    create.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const { result } = setup()
    act(() => {
      void result.current.create({ name: 'A' })
      void result.current.create({ name: 'A' })
    })
    expect(create).toHaveBeenCalledTimes(1)
    expect(result.current.pending).toBe(true)
    await act(async () => finish(folder()))
    expect(result.current.pending).toBe(false)
  })

  it('maps a 409 to a field failure, keeps pending off and does not refresh', async () => {
    create.mockRejectedValue(problem(409, 'folder_name_conflict'))
    const { result, keys } = setup()
    await act(async () => {
      expect(await result.current.create({ name: 'A' })).toBeNull()
    })
    expect(result.current.failure).toEqual({
      kind: 'field',
      message: 'A folder with this name already exists here.',
      refresh: false,
    })
    expect(keys()).toEqual([])
    expect(screen.queryByText('Folder created.')).not.toBeInTheDocument()
  })

  it('refreshes after a 404, and reset forgets the failure', async () => {
    create.mockRejectedValue(problem(404, 'not_found'))
    const { result, keys } = setup()
    await act(async () => void (await result.current.create({ name: 'A', parentId: 'gone' })))
    expect(result.current.failure?.message).toBe('This folder no longer exists.')
    expect(keys()).toEqual([['folders'], ['bookmark-list']])
    act(() => result.current.reset())
    expect(result.current.failure).toBeNull()
  })
})
