import { useCallback, useRef, useState } from 'react'
import { createBookmark, type BookmarkSummary, type CreateBookmarkRequest } from '../api/bookmarks'
import { describeSaveFailure, type SaveFailure } from './saveFailure'

/** Names from the design's glossary (`checking-auth` does not exist: there is no who-am-I yet). */
export type SavePhase = 'form' | 'saving' | 'saved' | 'duplicate' | 'error' | 'needs-login'

export type SaveBookmark = {
  phase: SavePhase
  /** Set while the phase is `duplicate`, `error` or `needs-login`. */
  failure: SaveFailure | null
  /** Saves once; a call while a save is in flight does nothing. Resolves with the new bookmark, or null. */
  save: (request: CreateBookmarkRequest) => Promise<BookmarkSummary | null>
  /** Back to the form after an alert. */
  dismiss: () => void
}

/** The save flow shared by the popup and the home page's add field. */
export function useSaveBookmark(): SaveBookmark {
  const [phase, setPhase] = useState<SavePhase>('form')
  const [failure, setFailure] = useState<SaveFailure | null>(null)
  const inFlight = useRef(false)

  const save = useCallback(async (request: CreateBookmarkRequest) => {
    if (inFlight.current) return null
    inFlight.current = true
    setFailure(null)
    setPhase('saving')
    try {
      const bookmark = await createBookmark(request)
      setPhase('saved')
      return bookmark
    } catch (error) {
      const described = describeSaveFailure(error)
      setFailure(described)
      setPhase(
        described.kind === 'signed-out'
          ? 'needs-login'
          : described.kind === 'duplicate'
            ? 'duplicate'
            : 'error',
      )
      return null
    } finally {
      inFlight.current = false
    }
  }, [])

  const dismiss = useCallback(() => {
    setPhase((current) => (current === 'duplicate' || current === 'error' ? 'form' : current))
    setFailure((current) => (current?.kind === 'signed-out' ? current : null))
  }, [])

  return { phase, failure, save, dismiss }
}
