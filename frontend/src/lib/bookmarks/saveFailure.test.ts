import { describe, expect, it } from 'vitest'
import { ApiError, type ProblemBody } from '../api/ApiError'
import { describeSaveFailure } from './saveFailure'

function apiError(
  status: number,
  code: ProblemBody['code'],
  extra: Partial<ProblemBody> = {},
  retryAfter: number | null = null,
) {
  return new ApiError(status, { type: 'about:blank', title: 't', status, code, ...extra }, retryAfter)
}

describe('describeSaveFailure', () => {
  describe('duplicates', () => {
    it('says the link is already saved, and returns the existing id', () => {
      const failure = describeSaveFailure(
        apiError(409, 'duplicate_bookmark', { existing_bookmark_id: 'b-1', in_trash: false }),
      )
      expect(failure).toEqual({
        kind: 'duplicate',
        message: 'This link is already saved.',
        existingBookmarkId: 'b-1',
        inTrash: false,
      })
    })

    it('says the link is in the trash, and returns the existing id', () => {
      const failure = describeSaveFailure(
        apiError(409, 'duplicate_bookmark', { existing_bookmark_id: 'b-2', in_trash: true }),
      )
      expect(failure).toEqual({
        kind: 'duplicate',
        message: 'This link is in your trash.',
        existingBookmarkId: 'b-2',
        inTrash: true,
      })
    })
  })

  it('maps invalid_url', () => {
    expect(describeSaveFailure(apiError(422, 'invalid_url'))).toEqual({
      kind: 'invalid-input',
      message: 'Only http and https links can be saved.',
    })
  })

  describe('validation_error', () => {
    it('names the URL and its limit when the url is too long', () => {
      const failure = describeSaveFailure(
        apiError(422, 'validation_error', { errors: [{ field: 'url', code: 'too_long' }] }),
      )
      expect(failure).toEqual({
        kind: 'invalid-input',
        message: 'That URL is too long. The limit is 2,048 characters.',
      })
    })

    it('names the title and its limit when the title is too long', () => {
      const failure = describeSaveFailure(
        apiError(422, 'validation_error', { errors: [{ field: 'title', code: 'too_long' }] }),
      )
      expect(failure).toEqual({
        kind: 'invalid-input',
        message: 'That title is too long. The limit is 300 characters.',
      })
    })

    it('names the URL when both are too long', () => {
      const failure = describeSaveFailure(
        apiError(422, 'validation_error', {
          errors: [
            { field: 'title', code: 'too_long' },
            { field: 'url', code: 'too_long' },
          ],
        }),
      )
      expect(failure).toMatchObject({ message: expect.stringContaining('URL') })
    })

    it('falls back to the generic message for any other validation error', () => {
      expect(
        describeSaveFailure(
          apiError(422, 'validation_error', { errors: [{ field: 'note', code: 'unknown_field' }] }),
        ),
      ).toEqual({ kind: 'error', message: "Couldn't save that link." })
      expect(describeSaveFailure(apiError(422, 'validation_error'))).toEqual({
        kind: 'error',
        message: "Couldn't save that link.",
      })
    })
  })

  it('maps bookmark_limit_reached', () => {
    expect(describeSaveFailure(apiError(409, 'bookmark_limit_reached'))).toEqual({
      kind: 'error',
      message: "You're at the 1,000 bookmark limit. Empty the trash or delete some bookmarks first.",
    })
  })

  describe('429', () => {
    it.each([
      [0, 'Too many saves. Try again in about 0 seconds.'],
      [30, 'Too many saves. Try again in about 30 seconds.'],
      [null, 'Too many saves. Try again in a moment.'], // missing, empty, or non-numeric header
      [-5, 'Too many saves. Try again in a moment.'],
    ])('with Retry-After %s', (retryAfter, message) => {
      expect(describeSaveFailure(apiError(429, 'rate_limited', {}, retryAfter))).toEqual({
        kind: 'error',
        message,
      })
    })
  })

  it('maps a 401 to signed-out, not to a message', () => {
    expect(describeSaveFailure(apiError(401, 'unauthenticated'))).toEqual({ kind: 'signed-out' })
  })

  describe('anything else', () => {
    it.each([
      ['a 500', new ApiError(500, null, null)],
      ['a 403', apiError(403, 'csrf_failed')],
      ['a 409 with an unexpected code', apiError(409, 'folder_cycle')],
      ['a network failure', new TypeError('Failed to fetch')],
    ])('shows the generic message for %s', (_name, error) => {
      expect(describeSaveFailure(error)).toEqual({
        kind: 'error',
        message: "Couldn't save that link.",
      })
    })
  })
})
