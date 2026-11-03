import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import type { ProblemBody } from '../../../lib/api/types'
import { describeSaveFailure } from './saveFailure'

function failure(status: number, body: Partial<ProblemBody> | null, retryAfter: number | null = null) {
  const problem = body && ({ type: 'about:blank', title: 't', status, ...body } as ProblemBody)
  return describeSaveFailure(new ApiError(status, problem, retryAfter))
}

describe('describeSaveFailure', () => {
  it('reports a live duplicate with the existing id', () => {
    expect(failure(409, { code: 'duplicate_bookmark', in_trash: false, existing_bookmark_id: 'b1' })).toEqual({
      kind: 'duplicate',
      message: 'This link is already saved.',
      existingBookmarkId: 'b1',
      inTrash: false,
    })
  })

  it('reports a trashed duplicate with the existing id', () => {
    expect(failure(409, { code: 'duplicate_bookmark', in_trash: true, existing_bookmark_id: 'b2' })).toEqual({
      kind: 'duplicate',
      message: 'This link is in your trash.',
      existingBookmarkId: 'b2',
      inTrash: true,
    })
  })

  it('maps invalid_url', () => {
    expect(failure(422, { code: 'invalid_url' })).toEqual({ kind: 'error', message: 'Only http and https links can be saved.' })
  })

  it('names the URL and its limit when the url is too long', () => {
    expect(failure(422, { code: 'validation_error', errors: [{ field: 'url', code: 'too_long' }] })).toEqual({
      kind: 'error',
      message: 'The URL is too long (limit 2,048 characters).',
    })
  })

  it('names the title and its limit when the title is too long', () => {
    expect(failure(422, { code: 'validation_error', errors: [{ field: 'title', code: 'too_long' }] })).toEqual({
      kind: 'error',
      message: 'The title is too long (limit 300 characters).',
    })
  })

  it('falls back to the generic message for a validation error that is not too_long', () => {
    expect(failure(422, { code: 'validation_error', errors: [{ field: 'url', code: 'required' }] })).toEqual({
      kind: 'error',
      message: "Couldn't save that link.",
    })
  })

  it('maps the bookmark limit', () => {
    expect(failure(409, { code: 'bookmark_limit_reached' })).toEqual({
      kind: 'error',
      message: "You're at the 1,000 bookmark limit. Empty the trash or delete some bookmarks first.",
    })
  })

  it('uses Retry-After for a 429', () => {
    expect(failure(429, { code: 'rate_limited' }, 30)).toEqual({
      kind: 'error',
      message: 'Too many saves. Try again in about 30 seconds.',
    })
  })

  it('says "a moment" for a 429 without Retry-After', () => {
    expect(failure(429, { code: 'rate_limited' })).toEqual({
      kind: 'error',
      message: 'Too many saves. Try again in a moment.',
    })
  })

  it('reports a 401 as signed out', () => {
    expect(failure(401, { code: 'unauthenticated' })).toEqual({ kind: 'signed-out' })
  })

  it.each([
    ['a 500', new ApiError(500, null, null)],
    ['a non-problem 502', new ApiError(502, null, null)],
    ['a network failure', new TypeError('Failed to fetch')],
  ])('uses the generic message for %s', (_name, err) => {
    expect(describeSaveFailure(err)).toEqual({ kind: 'error', message: "Couldn't save that link." })
  })
})
