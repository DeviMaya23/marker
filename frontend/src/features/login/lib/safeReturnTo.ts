const MAX_LENGTH = 8192
const BLOCKED_ROOTS = ['/login', '/auth', '/api']

/**
 * The path to go to after login: `raw` when it is a same-origin relative path that is neither
 * the login screen nor a server route, otherwise `/`. The server re-checks it.
 */
export function safeReturnTo(raw: string | null): string {
  if (typeof raw !== 'string') return '/'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
  if (raw.length > MAX_LENGTH) return '/'
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000- \u007f]/.test(raw)) return '/'
  const path = raw.split(/[?#]/, 1)[0].toLowerCase()
  for (const root of BLOCKED_ROOTS) {
    if (path === root || path.startsWith(`${root}/`)) return '/'
  }
  return raw
}
