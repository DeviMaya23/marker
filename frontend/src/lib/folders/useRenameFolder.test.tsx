import { act, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateFolder } from '../api/folders'
import { folder } from '../../test/builders'
import { hookWrapper } from '../../test/hookWrapper'
import { testClient } from '../../test/wrap'
import { useRenameFolder } from './useRenameFolder'

vi.mock('../api/folders', () => ({ updateFolder: vi.fn() }))
const update = vi.mocked(updateFolder)

beforeEach(() => {
  update.mockReset()
})

describe('useRenameFolder', () => {
  it('sends only the name for that folder, refreshes and toasts', async () => {
    update.mockResolvedValue(folder({ id: 'f1', name: 'New' }))
    const client = testClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useRenameFolder('f1'), { wrapper: hookWrapper(client) })
    await act(async () => { await result.current.rename("New") })
    expect(update).toHaveBeenCalledExactlyOnceWith('f1', { name: 'New' })
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([['folders'], ['bookmark-list']])
    expect(await screen.findByText('Folder renamed.')).toBeInTheDocument()
  })

  it('shows the rename wording for an unexpected failure', async () => {
    update.mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useRenameFolder('f1'), { wrapper: hookWrapper(testClient()) })
    await act(async () => { await result.current.rename("New") })
    expect(result.current.failure).toEqual({ kind: 'dialog', message: "Couldn't rename the folder.", refresh: true })
  })
})
