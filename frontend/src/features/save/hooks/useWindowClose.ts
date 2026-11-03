import { useCallback, useEffect, useRef, useState } from 'react'

/** How long to wait before concluding the browser did not let the window close. */
export const CLOSE_FALLBACK_MS = 350

/**
 * Closes the window. A browser only closes a window a script opened, so if this code is
 * still running after a short delay, `couldNotClose` turns true and the screen says so.
 */
export function useWindowClose() {
  const [couldNotClose, setCouldNotClose] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const close = useCallback(() => {
    window.close()
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCouldNotClose(true), CLOSE_FALLBACK_MS)
  }, [])

  return { close, couldNotClose }
}
