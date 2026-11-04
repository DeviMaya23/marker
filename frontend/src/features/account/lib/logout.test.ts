import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import { LOGOUT_FAILED, describeLogoutFailure, logoutTarget } from './logout'

describe('logoutTarget', () => {
  it.each([
    'https://id.example/logout?redirect=http%3A%2F%2Fapp',
    'http://id.example/logout',
    'HTTPS://ID.EXAMPLE/x',
    'https://id.example/' + 'a'.repeat(4980),
  ])('returns %s unchanged', (url) => {
    expect(logoutTarget(url)).toBe(url)
  })

  it('accepts a 5,000-character URL', () => {
    const url = 'https://id.example/' + 'a'.repeat(5000 - 19)
    expect(url).toHaveLength(5000)
    expect(logoutTarget(url)).toBe(url)
  })

  it.each([
    '',
    undefined,
    null,
    42,
    'javascript:alert(1)',
    'data:text/html,x',
    'ftp://x',
    '/relative',
    '//evil.example/x',
    'not a url',
    'https:evil.example',
    'https:/evil.example',
    'https:\\\\evil.example',
    'https:///x',
    'https://user:pw@id.example/',
    'https://user@id.example/',
    'https://id.example/a b',
    'https://id.example/a\\b',
    'https://id.example/\nx',
    'https://id.example/\u007fx',
  ])('gives / for %j', (url) => {
    expect(logoutTarget(url)).toBe('/')
  })
})

describe('describeLogoutFailure', () => {
  it('gives the generic message for a 401: callers check isUnauthorized first', () => {
    expect(describeLogoutFailure(new ApiError(401, null, null))).toEqual({ message: LOGOUT_FAILED })
  })

  it.each([
    [7, 'Too many requests. Try again in about 7 seconds.'],
    [0, 'Too many requests. Try again in about 0 seconds.'],
    [null, 'Too many requests. Try again in a moment.'],
  ])('words a 429 with retryAfter %s', (retryAfter, message) => {
    expect(describeLogoutFailure(new ApiError(429, null, retryAfter))).toEqual({ message }
  })

  it.each([
    new ApiError(403, null, null),
    new ApiError(501, null, null),
    new ApiError(500, null, null),
    new Error('x'),
    new TypeError('Failed to fetch'),
  ])('gives the generic message for %s', (error) => {
    expect(describeLogoutFailure(error)).toEqual({ message: LOGOUT_FAILED })
  })
})
