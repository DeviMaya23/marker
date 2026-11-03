import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCloseWindow } from './useCloseWindow'

let closeSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers()
  closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  closeSpy.mockRestore()
})

describe('useCloseWindow', () => {
  it('closes at once and does not claim failure yet', () => {
    const { result } = renderHook(() => useCloseWindow())
    act(() => result.current.close())
    expect(closeSpy).toHaveBeenCalledTimes(1)
    expect(result.current.cannotClose).toBe(false)
  })

  it('reports cannotClose when still running 350 ms after the call', () => {
    const { result } = renderHook(() => useCloseWindow())
    act(() => result.current.close())
    act(() => vi.advanceTimersByTime(349))
    expect(result.current.cannotClose).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.cannotClose).toBe(true)
  })

  it('does not report anything if unmounted first', () => {
    const { result, unmount } = renderHook(() => useCloseWindow())
    act(() => result.current.close())
    unmount()
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
  })
})
