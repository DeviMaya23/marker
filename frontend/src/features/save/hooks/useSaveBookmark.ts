import { useCallback, useRef, useState } from 'react'
import { createBookmark } from '../../../lib/api/bookmarks'
import type { BookmarkSummary } from '../../../lib/api/types'
import { describeSaveFailure } from '../lib/saveFailure'
import type { SaveFailure } from '../lib/saveFailure'

export type SavePhase = 'form' | 'saving' | 'saved' | 'duplicate' | 'error' | 'needs-login'

/**
 * The save call and what the screen should show for it. Shared by the popup and the
 * home page. `save` ignores a second call while one is in flight.
 */
export function useSaveBookmark() {
  const [phase, setPhase] = useState<SavePhase>('form')
  const [failure, setFailure] = useState<Exclude<SaveFailure, { kind: 'signed-out' }> | null>(null)
  const inFlight = useRef(false)

  const save = useCallback(async (url: string, title: string): Promise<BookmarkSummary | null> => {
    if (inFlight.current) return null
    inFlight.current = true
    setPhase('saving')
    setFailure(null)
    const trimmed = title.trim()
    try {
      const bookmark = await createBookmark(trimmed === '' ? { url } : { url, title: trimmed })
      setPhase('saved')
      return bookmark
    } catch (err) {
      const result = describeSaveFailure(err)
      if (result.kind === 'signed-out') {
        setPhase('needs-login')
      } else {
        setFailure(result)
        setPhase(result.kind)
      }
      return null
    } finally {
      inFlight.current = false
    }
  }, [])

  /** Close an alert and go back to the form. */
  const dismiss = useCallback(() => {
    setFailure(null)
    setPhase('form')
  }, [])

  return { phase, failure, save, dismiss }
}
