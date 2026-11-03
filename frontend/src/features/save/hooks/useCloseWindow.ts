import { useCallback, useEffect, useRef, useState } from 'react'

const FALLBACK_MS = 350

/**
 * Closes the popup window. If the page is still running 350 ms later the browser did
 * not allow it, and `cannotClose` turns true so the screen can say so (FR-3b).
 */
export function useCloseWindow() {
  const [cannotClose, setCannotClose] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const close = useCallback(() => {
    window.close()
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCannotClose(true), FALLBACK_MS)
  }, [])

  return { close, cannotClose }
}
