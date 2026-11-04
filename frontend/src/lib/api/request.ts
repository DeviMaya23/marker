import { ApiError, type ProblemBody } from './ApiError'

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

const WRITE_METHODS: ReadonlySet<Method> = new Set(['POST', 'PATCH', 'DELETE'])

/** The current `csrf_token` cookie, or null when it is missing or cannot be decoded. */
function readCsrfToken(): string | null {
  for (const part of document.cookie.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== 'csrf_token') continue
    try {
      return decodeURIComponent(part.slice(eq + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

/** Whole seconds from a Retry-After header; an empty value, an HTTP date or a fraction is null. */
function parseRetryAfter(header: string | null): number | null {
  if (header === null || !/^\s*-?\d+\s*$/.test(header)) return null
  return Number.parseInt(header, 10)
}

async function readProblem(res: Response): Promise<ProblemBody | null> {
  if (!res.headers.get('Content-Type')?.includes('application/problem+json')) return null
  try {
    return (await res.json()) as ProblemBody
  } catch {
    return null
  }
}

/**
 * Makes a JSON request to `<base><path>`, where `base` is `/api/v1` unless `options.base` says
 * otherwise (the auth routes live at the root, outside `/api/v1`). A write carries `X-CSRF-Token` from the cookie,
 * read now. A non-2xx response throws `ApiError`; a network failure rejects with the
 * fetch error itself, which is not an `ApiError`.
 */
export async function apiRequest<T>(
  method: Method,
  path: string,
  body?: unknown,
  options: { base?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (WRITE_METHODS.has(method)) {
    const token = readCsrfToken()
    if (token !== null) headers['X-CSRF-Token'] = token
  }

  const res = await fetch(`${options.base ?? '/api/v1'}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!res.ok) {
    const problem = await readProblem(res)
    const retryAfter = res.status === 429 ? parseRetryAfter(res.headers.get('Retry-After')) : null
    throw new ApiError(res.status, problem, retryAfter)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
