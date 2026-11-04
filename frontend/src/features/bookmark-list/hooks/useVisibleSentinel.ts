import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Calls `onVisible` whenever the sentinel element comes within 400px of the viewport.
 * Spread the returned ref onto the element; it may mount and unmount freely. Does nothing
 * where `IntersectionObserver` does not exist.
 */
export function useVisibleSentinel(onVisible: () => void) {
  const [node, setNode] = useState<Element | null>(null)
  const latest = useRef(onVisible)
  useEffect(() => {
    latest.current = onVisible
  })

  useEffect(() => {
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) latest.current()
      },
      { rootMargin: '400px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])

  return useCallback((element: Element | null) => setNode(element), [])
}
