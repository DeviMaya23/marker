import type { BookmarkChanges } from '../api/bookmarks'
import { NOTE_MAX, TITLE_MAX } from './describeFailure'

/** Length in code points, as the server counts: an emoji is 1 (`.length` would say 2). */
export function codePointLength(text: string): number {
  return Array.from(text).length
}

export type EditValues = { title: string; note: string | null }

/** Whether the typed values are over their limits. The title is counted as it would be sent, trimmed. */
export function overLimits(typed: { title: string; note: string }) {
  return {
    title: codePointLength(typed.title.trim()) > TITLE_MAX,
    // A spaces-only note is sent as null, so it cannot be too long.
    note: typed.note.trim() !== '' && codePointLength(typed.note) > NOTE_MAX,
  }
}

/**
 * What to send: only what changed. The title is trimmed and compared trimmed; a note that is
 * empty or only spaces becomes `null` (when the stored note is not null), otherwise the note
 * as typed. A stored null and an empty field are the same.
 */
export function computeChanges(stored: EditValues, typed: { title: string; note: string }): BookmarkChanges {
  const changes: BookmarkChanges = {}

  const title = typed.title.trim()
  if (title !== stored.title) changes.title = title

  if (typed.note.trim() === '') {
    if (stored.note !== null) changes.note = null
  } else if (typed.note !== (stored.note ?? '')) {
    changes.note = typed.note
  }
  return changes
}
