import { ApiError } from '../api/ApiError'

export const TITLE_MAX = 300
export const NOTE_MAX = 500

/** Which call failed; the same failure reads differently on each. */
export type BookmarkAction = 'edit' | 'delete' | 'restore' | 'empty'

export type FailureDisplay = {
  /** A 401: the screen shows the signed-out message (a toast adds a "Log in" action). */
  signedOut: boolean
  /** The text to show; empty when the failure is shown only under fields. */
  message: string
  /** `neutral` for "it was already done" outcomes, `error` otherwise. */
  tone: 'neutral' | 'error'
  /** Messages for fields of the edit dialog (a 422 `too_long`). */
  fields: { title?: string; note?: string }
  /** False for a 422 (nothing changed on the server); true otherwise. */
  refresh: boolean
}

const GENERIC: Record<BookmarkAction, string> = {
  edit: "Couldn't save your changes.",
  delete: "Couldn't move it to the trash.",
  restore: "Couldn't restore it.",
  empty: "Couldn't empty the trash.",
}

export const LOGGED_OUT_TOAST = "You're logged out."

function rateLimitMessage(retryAfter: number | null): string {
  if (retryAfter !== null && Number.isInteger(retryAfter) && retryAfter >= 0) {
    return `Too many requests. Try again in about ${retryAfter} seconds.`
  }
  return 'Too many requests. Try again in a moment.'
}

function result(message: string, tone: 'neutral' | 'error' = 'error'): FailureDisplay {
  return { signedOut: false, message, tone, fields: {}, refresh: true }
}

/** Maps whatever one of the four calls threw to what the screen shows. Pure. */
export function describeFailure(error: unknown, action: BookmarkAction): FailureDisplay {
  const generic = result(GENERIC[action])
  if (!(error instanceof ApiError)) return generic

  const { status } = error
  const code = error.problem?.code

  if (status === 401) {
    return { ...result(LOGGED_OUT_TOAST), signedOut: true }
  }
  if (status === 429) return result(rateLimitMessage(error.retryAfter))

  if (status === 404 && action !== 'empty') {
    return result(action === 'edit' ? 'This bookmark no longer exists.' : 'That bookmark no longer exists.')
  }
  if (status === 409 && code === 'bookmark_in_trash') {
    if (action === 'edit') return result("This bookmark is in the trash and can't be edited.")
    if (action === 'delete') return result('It was already in the trash.', 'neutral')
  }
  if (status === 409 && code === 'bookmark_not_in_trash' && action === 'restore') {
    return result('It was already restored.', 'neutral')
  }
  if (status === 422 && action === 'edit') {
    const tooLong = (error.problem?.errors ?? []).filter((e) => e.code === 'too_long')
    const fields: FailureDisplay['fields'] = {}
    if (tooLong.some((e) => e.field === 'title')) fields.title = `Title is too long (${TITLE_MAX} characters at most).`
    if (tooLong.some((e) => e.field === 'note')) fields.note = `Note is too long (${NOTE_MAX} characters at most).`
    if (fields.title || fields.note) return { ...result(''), fields, refresh: false }
  }
  return generic
}
