import { describe, expect, it } from 'vitest'
import { ApiError, isUnauthorized } from './ApiError'

describe('isUnauthorized', () => {
  it('is true for an ApiError with status 401', () => {
    expect(isUnauthorized(new ApiError(401, null, null))).toBe(true)
  })

  it.each([
    ['a 403', new ApiError(403, null, null)],
    ['a 500', new ApiError(500, null, null)],
    ['a TypeError', new TypeError('Failed to fetch')],
    ['null', null],
    ['undefined', undefined],
    ['a plain object with status 401', { status: 401 }],
  ])('is false for %s', (_name, error) => {
    expect(isUnauthorized(error)).toBe(false)
  })
})
