import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVisibleSentinel } from './useVisibleSentinel'

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void

let callbacks: Callback[]
let options: IntersectionObserverInit[]
let disconnect: ReturnType<typeof vi.fn>

beforeEach(() => {
  callbacks = []
  options = []
  disconnect = vi.fn()
  class FakeObserver {
    constructor(cb: Callback, opts: IntersectionObserverInit) {
      callbacks.push(cb)
      options.push(opts)
    }
    observe = vi.fn()
    disconnect = disconnect
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function Harness({ show, onVisible }: { show: boolean; onVisible: () => void }) {
  const ref = useVisibleSentinel(onVisible)
  return show ? <div ref={ref} data-testid="sentinel" /> : null
}

describe('useVisibleSentinel', () => {
  it('observes with a 400px margin and calls back only when intersecting', () => {
    const onVisible = vi.fn()
    render(<Harness show onVisible={onVisible} />)
    expect(options).toEqual([{ rootMargin: '400px' }])

    act(() => callbacks[0]([{ isIntersecting: false }]))
    expect(onVisible).not.toHaveBeenCalled()
    act(() => callbacks[0]([{ isIntersecting: true }]))
    expect(onVisible).toHaveBeenCalledTimes(1)
  })

  it('calls the latest callback without observing again', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<Harness show onVisible={first} />)
    rerender(<Harness show onVisible={second} />)
    act(() => callbacks[0]([{ isIntersecting: true }]))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(callbacks).toHaveLength(1)
  })

  it('disconnects when the sentinel goes away and when unmounted', () => {
    const { rerender, unmount } = render(<Harness show onVisible={vi.fn()} />)
    rerender(<Harness show={false} onVisible={vi.fn()} />)
    expect(disconnect).toHaveBeenCalledTimes(1)
    rerender(<Harness show onVisible={vi.fn()} />)
    expect(callbacks).toHaveLength(2)
    unmount()
    expect(disconnect).toHaveBeenCalledTimes(2)
  })

  it('does nothing and does not throw without IntersectionObserver', () => {
    vi.unstubAllGlobals()
    expect('IntersectionObserver' in globalThis).toBe(false)
    render(<Harness show onVisible={vi.fn()} />)
    expect(screen.getByTestId('sentinel')).toBeInTheDocument()
  })
})
