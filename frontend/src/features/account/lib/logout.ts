import { ApiError } from '../../../lib/api/ApiError'
import { rateLimitMessage } from '../../../lib/bookmarks/describeFailure'

export const LOGOUT_FAILED = "Couldn't log out."

/** An ASCII control or space character (U+0000 to U+0020, U+007F) or a backslash. */
function hasForbiddenChar(url: string): boolean {
  for (let i = 0; i < url.length; i++) {
    const code = url.charCodeAt(i)
    if (code <= 0x20 || code === 0x7f || code === 0x5c) return true
  }
  return false
}

/**
 * Where the browser goes after the server ended the session: `url` itself, unchanged, when it is
 * an absolute http(s) URL with a host, no credentials, no control or space character and no
 * backslash; otherwise `/`. The only gate on the server's `logout_url`.
 */
export function logoutTarget(url: unknown): string {
  if (typeof url !== 'string') return '/'
  if (!/^https?:\/\//i.test(url)) return '/'
  if (hasForbiddenChar(url)) return '/'
  // `new URL('https:///x')` fills in a host from the path; the string itself must name one.
  if (/^https?:\/\/([/?#]|$)/i.test(url)) return '/'
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return '/'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '/'
  if (parsed.hostname === '' || parsed.username !== '' || parsed.password !== '') return '/'
  return url
}

/** What a failed logout shows. `signedOut` (a 401) has no message: the toast text is its own. */
export function describeLogoutFailure(error: unknown): { signedOut: boolean; message: string } {
  if (error instanceof ApiError) {
    if (error.status === 401) return { signedOut: true, message: '' }
    if (error.status === 429) return { signedOut: false, message: rateLimitMessage(error.retryAfter) }
  }
  return { signedOut: false, message: LOGOUT_FAILED }
}
