import { act } from '@testing-library/react'

/** The default test viewport: wide, so every screen renders its desktop layout. */
export const WIDE = 1024

type Entry = { query: string; listeners: Set<() => void> }

let width = WIDE
let reducedMotion = false
const lists: Entry[] = []

function matches(query: string): boolean {
  const px = (name: string) => Number(new RegExp(`\\(${name}:\\s*(\\d+)px\\)`).exec(query)?.[1])
  if (query.includes('max-width')) return width <= px('max-width')
  if (query.includes('min-width')) return width >= px('min-width')
  if (query.includes('prefers-reduced-motion')) return reducedMotion
  return false
}

/** jsdom has no `matchMedia`; this stand-in understands max-width, min-width and reduced motion. */
export function installMatchMedia() {
  if (typeof window === 'undefined' || typeof window.matchMedia === 'function') return
  window.matchMedia = (query: string) => {
    const entry: Entry = { query, listeners: new Set() }
    lists.push(entry)
    return {
      media: query,
      get matches() {
        return matches(query)
      },
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
        entry.listeners.add(listener as () => void),
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
        entry.listeners.delete(listener as () => void),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    }
  }
}

/** The number of change listeners now attached, to check that a hook cleans up. */
export function listenerCount(): number {
  return lists.reduce((n, entry) => n + entry.listeners.size, 0)
}

function fire() {
  act(() => {
    for (const entry of lists) for (const listener of [...entry.listeners]) listener()
  })
}

/** Sets the viewport width and tells the listeners of every media query. */
export function setViewport(next: number) {
  width = next
  fire()
}

/** Turns `prefers-reduced-motion: reduce` on or off. */
export function setReducedMotion(next: boolean) {
  reducedMotion = next
  fire()
}

/** Back to the defaults; setup.ts runs this after every test. */
export function resetViewport() {
  width = WIDE
  reducedMotion = false
  lists.length = 0
}
