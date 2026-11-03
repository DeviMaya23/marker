import { ApiError } from './ApiError'
import type { ProblemBody } from './types'

const WRITE_METHODS = new Set(['POST', 'PATCH', 'DELETE'])

function csrfToken(): string {
  const match = document.cookie.split('; ').find((part) => part.startsWith('csrf_token='))
  return match ? decodeURIComponent(match.slice('csrf_token='.length)) : ''
}

function retryAfterSeconds(res: Response): number | null {
  const raw = res.headers.get('Retry-After')
  if (raw === null) return null
  const seconds = Number(raw)
  return Number.isFinite(seconds) ? seconds : null
}

async function problemFrom(res: Response): Promise<ProblemBody | null> {
  if (!(res.headers.get('Content-Type') ?? '').includes('application/problem+json')) return null
  try {
    return (await res.json()) as ProblemBody
  } catch {
    return null
  }
}

/**
 * One JSON request to `/api/v1{path}`. Writes carry the CSRF header (NFR-13), read from
 * the cookie at call time. A non-2xx response throws `ApiError`; a network failure
 * rethrows fetch's own error.
 */
export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (WRITE_METHODS.has(method)) headers['X-CSRF-Token'] = csrfToken()

  const res = await fetch(`/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!res.ok) {
    throw new ApiError(res.status, await problemFrom(res), res.status === 429 ? retryAfterSeconds(res) : null)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
