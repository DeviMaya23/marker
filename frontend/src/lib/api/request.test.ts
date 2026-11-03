import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './ApiError'
import { request } from './request'

const fetchSpy = vi.fn<typeof fetch>()

function problem(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  })
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (e) {
    return e
  }
  throw new Error('expected a rejection')
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchSpy)
  document.cookie = 'csrf_token=abc123'
})

afterEach(() => {
  fetchSpy.mockReset()
  vi.unstubAllGlobals()
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})

describe('request csrf header', () => {
  it('sends X-CSRF-Token from the cookie on a POST', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 201 }))
    await request('POST', '/bookmarks', { url: 'https://a.test' })
    const init = fetchSpy.mock.calls[0][1]
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('abc123')
    expect(init?.body).toBe('{"url":"https://a.test"}')
  })

  it('reads the cookie at call time, not at import time', async () => {
    fetchSpy.mockImplementation(async () => new Response('{}', { status: 201 }))
    await request('POST', '/x', {})
    document.cookie = 'csrf_token=rotated'
    await request('POST', '/x', {})
    expect(new Headers(fetchSpy.mock.calls[1][1]?.headers).get('X-CSRF-Token')).toBe('rotated')
  })

  it('does not send it on a GET', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }))
    await request('GET', '/bookmarks/1')
    expect(new Headers(fetchSpy.mock.calls[0][1]?.headers).has('X-CSRF-Token')).toBe(false)
  })

  it('does not set a credentials option', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }))
    await request('GET', '/bookmarks/1')
    expect(fetchSpy.mock.calls[0][1]).not.toHaveProperty('credentials')
  })
})

describe('request errors', () => {
  it('turns a 409 problem+json into an ApiError with the duplicate fields', async () => {
    fetchSpy.mockResolvedValue(
      problem(409, { code: 'duplicate_bookmark', existing_bookmark_id: 'b1', in_trash: true, title: 't', status: 409 }),
    )
    const err = await caught(request('POST', '/bookmarks', {}))
    expect(err).toBeInstanceOf(ApiError)
    const api = err as ApiError
    expect(api.status).toBe(409)
    expect(api.problem?.code).toBe('duplicate_bookmark')
    expect(api.problem?.existing_bookmark_id).toBe('b1')
    expect(api.problem?.in_trash).toBe(true)
    expect(api.retryAfter).toBeNull()
  })

  it('carries Retry-After as seconds on a 429', async () => {
    fetchSpy.mockResolvedValue(problem(429, { code: 'rate_limited' }, { 'Retry-After': '12' }))
    const err = (await caught(request('POST', '/bookmarks', {}))) as ApiError
    expect(err.status).toBe(429)
    expect(err.retryAfter).toBe(12)
  })

  it('leaves retryAfter null on a 429 without the header', async () => {
    fetchSpy.mockResolvedValue(problem(429, { code: 'rate_limited' }))
    const err = (await caught(request('POST', '/bookmarks', {}))) as ApiError
    expect(err.retryAfter).toBeNull()
  })

  it('gives an ApiError with no problem body for a non-problem response', async () => {
    fetchSpy.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }))
    const err = (await caught(request('GET', '/bookmarks/1'))) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(502)
    expect(err.problem).toBeNull()
  })

  it('does not wrap a network failure in ApiError', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))
    const err = await caught(request('GET', '/bookmarks/1'))
    expect(err).toBeInstanceOf(TypeError)
    expect(err).not.toBeInstanceOf(ApiError)
  })
})
