import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listFolders } from '../api/folders'
import { hookWrapper } from '../../test/hookWrapper'
import { folder } from '../../test/builders'
import { testClient } from '../../test/wrap'
import { useFolders } from './useFolders'

vi.mock('../api/folders', () => ({ listFolders: vi.fn() }))

beforeEach(() => {
  vi.mocked(listFolders).mockReset()
})

describe('useFolders', () => {
  it('returns the items under the key ["folders"]', async () => {
    const items = [folder({ id: 'a' }), folder({ id: 'b' })]
    vi.mocked(listFolders).mockResolvedValue({ items })
    const client = testClient()
    const { result } = renderHook(() => useFolders(), { wrapper: hookWrapper(client) })
    await waitFor(() => expect(result.current.data).toEqual(items))
    expect(client.getQueryData(['folders'])).toEqual({ items })
  })

  it('does not retry a failure', async () => {
    vi.mocked(listFolders).mockRejectedValue(new Error('down'))
    const client = testClient()
    client.setDefaultOptions({ queries: { retry: 3, retryDelay: 0 } })
    const { result } = renderHook(() => useFolders(), { wrapper: hookWrapper(client) })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(listFolders).toHaveBeenCalledTimes(1)
  })
})
