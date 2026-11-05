import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import { deleteAccount } from '../../../lib/api/account'
import { describeDeleteAccountFailure } from '../lib/deleteAccountFailure'
import { useDeleteAccount } from './useDeleteAccount'

vi.mock('../../../lib/api/account', () => ({ deleteAccount: vi.fn() }))

beforeEach(() => {
  vi.mocked(deleteAccount).mockReset()
})

describe('useDeleteAccount', () => {
  it('resolves true on success, pending only while it runs, and keeps failure null', async () => {
    let finish: () => void = () => {}
    vi.mocked(deleteAccount).mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    const { result } = renderHook(() => useDeleteAccount())
    expect(result.current.pending).toBe(false)

    let outcome: Promise<boolean> = Promise.resolve(false)
    act(() => {
      outcome = result.current.run()
    })
    expect(result.current.pending).toBe(true)
    await act(async () => {
      finish()
      expect(await outcome).toBe(true)
    })
    expect(result.current.pending).toBe(false)
    expect(result.current.failure).toBeNull()
  })

  it('resolves false on a rejection and keeps what the failure mapping returns', async () => {
    const error = new ApiError(429, null, 7)
    vi.mocked(deleteAccount).mockRejectedValue(error)
    const { result } = renderHook(() => useDeleteAccount())
    let ok = true
    await act(async () => {
      ok = await result.current.run()
    })
    expect(ok).toBe(false)
    expect(result.current.failure).toEqual(describeDeleteAccountFailure(error))
    expect(result.current.pending).toBe(false)
  })

  it('a 401 is silent: no failure, resolves false and is not pending', async () => {
    vi.mocked(deleteAccount).mockRejectedValue(new ApiError(401, null, null))
    const { result } = renderHook(() => useDeleteAccount())
    let ok = true
    await act(async () => {
      ok = await result.current.run()
    })
    expect(ok).toBe(false)
    expect(result.current.failure).toBeNull()
    expect(result.current.pending).toBe(false)
  })

  it('sends no second request while one runs and resolves false for it', async () => {
    let finish: () => void = () => {}
    vi.mocked(deleteAccount).mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    const { result } = renderHook(() => useDeleteAccount())
    let first: Promise<boolean> = Promise.resolve(false)
    act(() => {
      first = result.current.run()
    })
    let second = true
    await act(async () => {
      second = await result.current.run()
    })
    expect(second).toBe(false)
    expect(deleteAccount).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish()
      await first
    })
  })

  it('clears a failure on reset() and at the start of the next run()', async () => {
    vi.mocked(deleteAccount).mockRejectedValueOnce(new ApiError(500, null, null))
    const { result } = renderHook(() => useDeleteAccount())
    await act(async () => {
      await result.current.run()
    })
    expect(result.current.failure).not.toBeNull()
    act(() => result.current.reset())
    expect(result.current.failure).toBeNull()

    vi.mocked(deleteAccount).mockRejectedValueOnce(new ApiError(500, null, null))
    await act(async () => {
      await result.current.run()
    })
    expect(result.current.failure).not.toBeNull()

    let finish: () => void = () => {}
    vi.mocked(deleteAccount).mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)))
    let pendingRun: Promise<boolean> = Promise.resolve(false)
    act(() => {
      pendingRun = result.current.run()
    })
    expect(result.current.failure).toBeNull()
    await act(async () => {
      finish()
      await pendingRun
    })
    await waitFor(() => expect(result.current.pending).toBe(false))
  })
})
