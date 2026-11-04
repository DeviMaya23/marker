import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './ApiError'
import { goTo } from '../goTo'
import { loginPageHref } from '../loginHref'
import { resetLoginRedirectForTests, suppressLoginRedirect } from './loginRedirect'
import { apiRequest } from './request'

vi.mock('../goTo', () => ({ goTo: vi.fn() }))

function problemResponse(status: number, body: object, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  })
}

function sentHeaders(fetchSpy: ReturnType<typeof vi.fn>): Record<string, string> {
  return (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>
}

function clearCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0].trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
  }
}

describe('apiRequest', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    clearCookies()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearCookies()
  })

  describe('csrf header on writes only', () => {
    it('sends the current csrf_token cookie on a POST', async () => {
      document.cookie = 'csrf_token=first'
      fetchSpy.mockResolvedValue(new Response('{}', { status: 201 }))
      await apiRequest('POST', '/bookmarks', { url: 'https://a.test' })
      expect(sentHeaders(fetchSpy)['X-CSRF-Token']).toBe('first')
    })

    it('reads the cookie at call time, not once at load', async () => {
      fetchSpy.mockImplementation(() => Promise.resolve(new Response('{}', { status: 201 })))
      document.cookie = 'csrf_token=one'
      await apiRequest('POST', '/bookmarks', {})
      document.cookie = 'csrf_token=two'
      await apiRequest('POST', '/bookmarks', {})
      expect((fetchSpy.mock.calls[1][1] as RequestInit).headers).toMatchObject({
        'X-CSRF-Token': 'two',
      })
    })

    it.each(['PATCH', 'DELETE'] as const)('sends it on a %s', async (method) => {
      document.cookie = 'csrf_token=abc'
      fetchSpy.mockResolvedValue(new Response(null, { status: 204 }))
      await apiRequest(method, '/bookmarks/1')
      expect(sentHeaders(fetchSpy)['X-CSRF-Token']).toBe('abc')
    })

    it('does not send it on a GET', async () => {
      document.cookie = 'csrf_token=abc'
      fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }))
      await apiRequest('GET', '/bookmarks/1')
      expect(sentHeaders(fetchSpy)).not.toHaveProperty('X-CSRF-Token')
    })

    it('requests /api/v1 paths and sends the body as JSON', async () => {
      fetchSpy.mockResolvedValue(new Response('{}', { status: 201 }))
      await apiRequest('POST', '/bookmarks', { url: 'https://a.test' })
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/v1/bookmarks')
      expect((fetchSpy.mock.calls[0][1] as RequestInit).body).toBe('{"url":"https://a.test"}')
    })

    it('does not set a credentials option', async () => {
      fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }))
      await apiRequest('GET', '/bookmarks/1')
      expect(fetchSpy.mock.calls[0][1]).not.toHaveProperty('credentials')
    })
  })

  describe('bad percent-escape in cookie', () => {
    it('still sends the request, without the header', async () => {
      document.cookie = 'csrf_token=%E0%A4%A'
      fetchSpy.mockResolvedValue(new Response('{}', { status: 201 }))
      await expect(apiRequest('POST', '/bookmarks', {})).resolves.toEqual({})
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(sentHeaders(fetchSpy)).not.toHaveProperty('X-CSRF-Token')
    })
  })

  describe('problem+json becomes ApiError', () => {
    it('carries the status, code and duplicate fields of a 409', async () => {
      fetchSpy.mockResolvedValue(
        problemResponse(409, {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          code: 'duplicate_bookmark',
          existing_bookmark_id: 'abc',
          in_trash: true,
        }),
      )
      const err = await apiRequest('POST', '/bookmarks', {}).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ApiError)
      const apiErr = err as ApiError
      expect(apiErr.status).toBe(409)
      expect(apiErr.problem?.code).toBe('duplicate_bookmark')
      expect(apiErr.problem?.existing_bookmark_id).toBe('abc')
      expect(apiErr.problem?.in_trash).toBe(true)
      expect(apiErr.retryAfter).toBeNull()
    })

    it('carries Retry-After on a 429', async () => {
      fetchSpy.mockResolvedValue(
        problemResponse(
          429,
          { type: 'about:blank', title: 'Slow down', status: 429, code: 'rate_limited' },
          { 'Retry-After': '17' },
        ),
      )
      const err = (await apiRequest('POST', '/bookmarks', {}).catch((e: unknown) => e)) as ApiError
      expect(err.status).toBe(429)
      expect(err.problem?.code).toBe('rate_limited')
      expect(err.retryAfter).toBe(17)
    })

    it.each([
      ['empty', '', null],
      ['an HTTP date', 'Wed, 21 Oct 2026 07:28:00 GMT', null],
      ['a fraction', '1.5', null],
      ['negative', '-5', -5],
      ['zero', '0', 0],
    ])('reads a Retry-After that is %s', async (_name, header, expected) => {
      fetchSpy.mockResolvedValue(
        problemResponse(
          429,
          { type: 'about:blank', title: 'Slow down', status: 429, code: 'rate_limited' },
          { 'Retry-After': header },
        ),
      )
      const err = (await apiRequest('POST', '/bookmarks', {}).catch((e: unknown) => e)) as ApiError
      expect(err.retryAfter).toBe(expected)
    })

    it('carries the field errors of a 422', async () => {
      fetchSpy.mockResolvedValue(
        problemResponse(422, {
          type: 'about:blank',
          title: 'Invalid',
          status: 422,
          code: 'validation_error',
          errors: [{ field: 'title', code: 'too_long' }],
        }),
      )
      const err = (await apiRequest('POST', '/bookmarks', {}).catch((e: unknown) => e)) as ApiError
      expect(err.problem?.errors).toEqual([{ field: 'title', code: 'too_long' }])
    })
  })

  describe('non-problem error', () => {
    it('becomes an ApiError with the status and no problem body', async () => {
      fetchSpy.mockResolvedValue(
        new Response('<html>bad gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      )
      const err = (await apiRequest('GET', '/bookmarks/1').catch((e: unknown) => e)) as ApiError
      expect(err).toBeInstanceOf(ApiError)
      expect(err.status).toBe(502)
      expect(err.problem).toBeNull()
    })

    it('treats a problem+json body that is not valid JSON as no problem', async () => {
      fetchSpy.mockResolvedValue(
        new Response('nope', { status: 500, headers: { 'Content-Type': 'application/problem+json' } }),
      )
      const err = (await apiRequest('GET', '/bookmarks/1').catch((e: unknown) => e)) as ApiError
      expect(err).toBeInstanceOf(ApiError)
      expect(err.problem).toBeNull()
    })
  })

  describe('network failure', () => {
    it('rejects with an error that is not an ApiError', async () => {
      const failure = new TypeError('Failed to fetch')
      fetchSpy.mockRejectedValue(failure)
      const err = await apiRequest('GET', '/bookmarks/1').catch((e: unknown) => e)
      expect(err).toBe(failure)
      expect(err).not.toBeInstanceOf(ApiError)
    })
  })
})

describe('apiRequest base option', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('requests the path under the given base instead of /api/v1', async () => {
    const spy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', spy)
    await apiRequest('POST', '/auth/logout', undefined, { base: '' })
    expect(spy.mock.calls[0][0]).toBe('/auth/logout')
  })
})

describe('apiRequest 401 redirect', () => {
  let spy: ReturnType<typeof vi.fn>
  const reply = (status: number) =>
    status === 204 || status === 200
      ? new Response(status === 204 ? null : '{}', { status })
      : new Response(JSON.stringify({ type: 'about:blank', title: 't', status, code: 'c' }), {
          status,
          headers: { 'Content-Type': 'application/problem+json' },
        })
  beforeEach(() => {
    vi.mocked(goTo).mockReset()
    spy = vi.fn()
    vi.stubGlobal('fetch', spy)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends the browser to login with the current path and query and still rejects', async () => {
    window.history.pushState({}, '', '/trash?x=1')
    spy.mockResolvedValue(reply(401))
    const err = await apiRequest('GET', '/bookmarks').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(401)
    expect((err as ApiError).problem?.status).toBe(401)
    expect(goTo).toHaveBeenCalledExactlyOnceWith('/login?return_to=%2Ftrash%3Fx%3D1')
  })

  it('round-trips a nested query exactly', async () => {
    const path = '/save?url=https%3A%2F%2Fx.test%2Fa%3Fb%3D1&title=A%20B'
    window.history.pushState({}, '', path)
    spy.mockResolvedValue(reply(401))
    await apiRequest('GET', '/folders').catch(() => {})
    const arg = vi.mocked(goTo).mock.calls[0][0]
    expect(arg).toBe(loginPageHref(path, ''))
    expect(new URLSearchParams(arg.split('?')[1]).get('return_to')).toBe(path)
  })

  it('redirects once for 401s in a row and in parallel', async () => {
    spy.mockImplementation(() => Promise.resolve(reply(401)))
    await Promise.all([
      apiRequest('GET', '/a').catch(() => {}),
      apiRequest('GET', '/b').catch(() => {}),
      apiRequest('GET', '/c').catch(() => {}),
    ])
    await apiRequest('GET', '/d').catch(() => {})
    expect(goTo).toHaveBeenCalledTimes(1)
  })

  it.each(['/login', '/login/', '/login?return_to=%2F'])(
    'does not redirect at %s, still rejects, and leaves the guard unused',
    async (location) => {
      window.history.pushState({}, '', location)
      spy.mockImplementation(() => Promise.resolve(reply(401)))
      await expect(apiRequest('GET', '/sync/version')).rejects.toBeInstanceOf(ApiError)
      expect(goTo).not.toHaveBeenCalled()
      window.history.pushState({}, '', '/trash')
      await apiRequest('GET', '/x').catch(() => {})
      expect(goTo).toHaveBeenCalledTimes(1)
    },
  )

  it('does not redirect after suppressLoginRedirect, but does without it', async () => {
    spy.mockImplementation(() => Promise.resolve(reply(401)))
    suppressLoginRedirect()
    await apiRequest('GET', '/x').catch(() => {})
    expect(goTo).not.toHaveBeenCalled()
    resetLoginRedirectForTests()
    await apiRequest('GET', '/x').catch(() => {})
    expect(goTo).toHaveBeenCalledTimes(1)
  })

  it.each([200, 204, 403, 404, 429, 500])('does not redirect on %i', async (status) => {
    spy.mockResolvedValue(reply(status))
    await apiRequest('GET', '/x').catch(() => {})
    expect(goTo).not.toHaveBeenCalled()
  })

  it('does not redirect on a network failure', async () => {
    spy.mockRejectedValue(new TypeError('Failed to fetch'))
    await apiRequest('GET', '/x').catch(() => {})
    expect(goTo).not.toHaveBeenCalled()
  })

  it('redirects on a 401 from the logout call too', async () => {
    window.history.pushState({}, '', '/account')
    spy.mockResolvedValue(reply(401))
    await apiRequest('POST', '/auth/logout', undefined, { base: '' }).catch(() => {})
    expect(goTo).toHaveBeenCalledExactlyOnceWith('/login?return_to=%2Faccount')
  })
})
