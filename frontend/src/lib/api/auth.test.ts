import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './ApiError'
import { logout } from './auth'

function problem(status: number, headers: Record<string, string> = {}) {
  const body = { type: 'about:blank', title: 't', status, code: 'unauthenticated' }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  })
}

describe('logout', () => {
  let fetchSpy: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    document.cookie = 'csrf_token=tok1'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('POSTs /auth/logout with the csrf header, no body and no content type', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ logout_url: 'https://id.example/out' }), { status: 200 }),
    )
    await expect(logout()).resolves.toEqual({ logout_url: 'https://id.example/out' })
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/auth/logout')
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(init.headers).toMatchObject({ 'X-CSRF-Token': 'tok1' })
    expect(init.headers).not.toHaveProperty('Content-Type')
  })

  it.each([401, 403, 429])('rejects a %s with an ApiError carrying the problem', async (status) => {
    fetchSpy.mockResolvedValue(problem(status, status === 429 ? { 'Retry-After': '7' } : {}))
    const error = await logout().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    const api = error as ApiError
    expect(api.status).toBe(status)
    expect(api.problem?.status).toBe(status)
    expect(api.retryAfter).toBe(status === 429 ? 7 : null)
  })
})
