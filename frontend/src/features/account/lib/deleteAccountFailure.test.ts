import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import { describeDeleteAccountFailure } from './deleteAccountFailure'

const GENERIC = "Couldn't delete your account."

describe('describeDeleteAccountFailure', () => {
  it('gives the generic message for a 401: callers check isUnauthorized first', () => {
    expect(describeDeleteAccountFailure(new ApiError(401, null, null))).toEqual({ message: GENERIC })
  })

  it.each([
    [7, 'Too many requests. Try again in about 7 seconds.'],
    [0, 'Too many requests. Try again in about 0 seconds.'],
    [null, 'Too many requests. Try again in a moment.'],
  ])('describes a 429 with Retry-After %s', (retryAfter, message) => {
    expect(describeDeleteAccountFailure(new ApiError(429, null, retryAfter))).toEqual({ message })
  })

  it.each([
    ['a 403', new ApiError(403, null, null)],
    ['a 500', new ApiError(500, null, null)],
    ['an error with a problem body', new ApiError(500, { type: 'about:blank', code: 'internal_error', title: 'x', status: 500 }, null)],
    ['a network failure', new TypeError('Failed to fetch')],
  ])('gives the generic message for %s', (_name, error) => {
    expect(describeDeleteAccountFailure(error)).toEqual({ message: GENERIC })
  })
})
