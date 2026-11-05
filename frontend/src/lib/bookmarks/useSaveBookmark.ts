import { useCallback, useRef, useState } from 'react'
import { isUnauthorized } from '../api/ApiError'
import { createBookmark, type BookmarkSummary, type CreateBookmarkRequest } from '../api/bookmarks'
import { describeSaveFailure, type SaveFailure } from './saveFailure'

/** Names from the design's glossary (`checking-auth` does not exist: there is no who-am-I yet). */
export type SavePhase = 'form' | 'saving' | 'saved' | 'duplicate' | 'error'

export type SaveBookmark = {
  phase: SavePhase
  /** Set while the phase is `duplicate` or `error`. */
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
      if (isUnauthorized(error)) {
        // Silent: the login redirect is on its way.
        setFailure(null)
        setPhase('form')
        return null
      }
      const described = describeSaveFailure(error)
      setFailure(described)
      setPhase(described.kind === 'duplicate' ? 'duplicate' : 'error')
      return null
    } finally {
      inFlight.current = false
    }
  }, [])

  const dismiss = useCallback(() => {
    setPhase((current) => (current === 'duplicate' || current === 'error' ? 'form' : current))
    setFailure(null)
  }, [])

  return { phase, failure, save, dismiss }
}
