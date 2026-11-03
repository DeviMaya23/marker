import { ApiError } from '../../../lib/api/ApiError'

export const URL_MAX_LENGTH = 2048
export const TITLE_MAX_LENGTH = 300

/** What a save screen shows for a failed `createBookmark`. */
export type SaveFailure =
  | { kind: 'signed-out' }
  | { kind: 'duplicate'; message: string; existingBookmarkId: string | null; inTrash: boolean }
  | { kind: 'error'; message: string }

const GENERIC = "Couldn't save that link."

function tooLongMessage(fields: string[]): string | null {
  const parts: string[] = []
  if (fields.includes('url')) parts.push(`The URL is too long (limit ${URL_MAX_LENGTH.toLocaleString('en-US')} characters).`)
  if (fields.includes('title')) parts.push(`The title is too long (limit ${TITLE_MAX_LENGTH.toLocaleString('en-US')} characters).`)
  return parts.length > 0 ? parts.join(' ') : null
}

export function describeSaveFailure(err: unknown): SaveFailure {
  if (!(err instanceof ApiError)) return { kind: 'error', message: GENERIC }
  const { status, problem } = err
  const code = problem?.code

  if (status === 401) return { kind: 'signed-out' }

  if (status === 409 && code === 'duplicate_bookmark') {
    const inTrash = problem?.in_trash === true
    return {
      kind: 'duplicate',
      message: inTrash ? 'This link is in your trash.' : 'This link is already saved.',
      existingBookmarkId: problem?.existing_bookmark_id ?? null,
      inTrash,
    }
  }
  if (status === 409 && code === 'bookmark_limit_reached') {
    return {
      kind: 'error',
      message: "You're at the 1,000 bookmark limit. Empty the trash or delete some bookmarks first.",
    }
  }
  if (status === 422 && code === 'invalid_url') {
    return { kind: 'error', message: 'Only http and https links can be saved.' }
  }
  if (status === 422 && code === 'validation_error') {
    const tooLong = (problem?.errors ?? []).filter((e) => e.code === 'too_long').map((e) => e.field)
    const message = tooLongMessage(tooLong)
    if (message) return { kind: 'error', message }
  }
  if (status === 429) {
    const wait = err.retryAfter === null ? 'a moment' : `about ${err.retryAfter} seconds`
    return { kind: 'error', message: `Too many saves. Try again in ${wait}.` }
  }
  return { kind: 'error', message: GENERIC }
}
