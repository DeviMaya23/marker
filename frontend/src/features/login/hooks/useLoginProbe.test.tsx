import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import { getSyncVersion } from '../../../lib/api/sync'
import { hookWrapper } from '../../../test/hookWrapper'
import { testClient } from '../../../test/wrap'
import { useLoginProbe } from './useLoginProbe'

vi.mock('../../../lib/api/sync', () => ({ getSyncVersion: vi.fn() }))

beforeEach(() => {
  vi.mocked(getSyncVersion).mockReset()
})

function setup() {
  return renderHook(() => useLoginProbe(), { wrapper: hookWrapper(testClient()) })
}

describe('useLoginProbe', () => {
  it('is checking while pending, then signed-in on a 200', async () => {
    vi.mocked(getSyncVersion).mockResolvedValue({ version: 1 } as never)
    const { result } = setup()
    expect(result.current).toBe('checking')
    await waitFor(() => expect(result.current).toBe('signed-in'))
    expect(getSyncVersion).toHaveBeenCalledExactlyOnceWith()
  })

  it.each([
    ['401', new ApiError(401, null, null)],
    ['429', new ApiError(429, null, 3)],
    ['500', new ApiError(500, null, null)],
    ['a network error', new TypeError('Failed to fetch')],
  ])('is signed-out on %s, without a retry', async (_n, error) => {
    vi.mocked(getSyncVersion).mockRejectedValue(error)
    const { result } = setup()
    await waitFor(() => expect(result.current).toBe('signed-out'))
    expect(getSyncVersion).toHaveBeenCalledTimes(1)
  })
})
