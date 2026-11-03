import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWindowClose } from './useWindowClose'

describe('useWindowClose', () => {
  let closeSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    closeSpy = vi.fn()
    vi.stubGlobal('close', closeSpy)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does nothing until close is called', () => {
    const { result } = renderHook(() => useWindowClose())
    act(() => vi.advanceTimersByTime(1000))
    expect(closeSpy).not.toHaveBeenCalled()
    expect(result.current.couldNotClose).toBe(false)
  })

  it('calls window.close at once and reports failure only after 350 ms', () => {
    const { result } = renderHook(() => useWindowClose())
    act(() => result.current.close())
    expect(closeSpy).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(349))
    expect(result.current.couldNotClose).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.couldNotClose).toBe(true)
  })

  it('stays quiet when the window is gone before the timer fires', () => {
    const { result, unmount } = renderHook(() => useWindowClose())
    act(() => result.current.close())
    unmount()
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
  })
})
