import { ApiError } from '../api/ApiError'

export const URL_MAX_LENGTH = 2048
export const TITLE_MAX_LENGTH = 300

export type SaveFailure =
  | { kind: 'signed-out' }
  | { kind: 'duplicate'; message: string; existingBookmarkId: string | null; inTrash: boolean }
  /** The input itself is wrong (not an http(s) link, or too long): a message for the field. */
  | { kind: 'invalid-input'; message: string }
  | { kind: 'error'; message: string }

const GENERIC = "Couldn't save that link."

function rateLimitMessage(retryAfter: number | null): string {
  if (retryAfter !== null && Number.isInteger(retryAfter) && retryAfter >= 0) {
    return `Too many saves. Try again in about ${retryAfter} seconds.`
  }
  return 'Too many saves. Try again in a moment.'
}

function tooLongMessage(err: ApiError): string | null {
  const tooLong = (err.problem?.errors ?? []).filter((e) => e.code === 'too_long')
  if (tooLong.some((e) => e.field === 'url')) {
    return `That URL is too long. The limit is ${URL_MAX_LENGTH.toLocaleString('en-US')} characters.`
  }
  if (tooLong.some((e) => e.field === 'title')) {
    return `That title is too long. The limit is ${TITLE_MAX_LENGTH} characters.`
  }
  return null
}

/** Maps whatever `createBookmark` threw to what a save screen shows. Pure. */
export function describeSaveFailure(error: unknown): SaveFailure {
  if (!(error instanceof ApiError)) return { kind: 'error', message: GENERIC }

  if (error.status === 401) return { kind: 'signed-out' }

  const code = error.problem?.code
  if (error.status === 409 && code === 'duplicate_bookmark') {
    const inTrash = error.problem?.in_trash === true
    return {
      kind: 'duplicate',
      message: inTrash ? 'This link is in your trash.' : 'This link is already saved.',
      existingBookmarkId: error.problem?.existing_bookmark_id ?? null,
      inTrash,
    }
  }
  if (error.status === 409 && code === 'bookmark_limit_reached') {
    return {
      kind: 'error',
      message:
        "You're at the 1,000 bookmark limit. Empty the trash or delete some bookmarks first.",
    }
  }
  if (error.status === 422 && code === 'invalid_url') {
    return { kind: 'invalid-input', message: 'Only http and https links can be saved.' }
  }
  if (error.status === 422 && code === 'validation_error') {
    const message = tooLongMessage(error)
    if (message) return { kind: 'invalid-input', message }
  }
  // The chosen folder was deleted meanwhile.
  if (error.status === 404) return { kind: 'error', message: 'That folder no longer exists.' }
  if (error.status === 429) return { kind: 'error', message: rateLimitMessage(error.retryAfter) }

  return { kind: 'error', message: GENERIC }
}
