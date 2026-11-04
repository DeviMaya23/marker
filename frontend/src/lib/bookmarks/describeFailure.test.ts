import { describe, expect, it } from 'vitest'
import { ApiError, type ProblemBody } from '../api/ApiError'
import { describeFailure, type BookmarkAction } from './describeFailure'

function api(status: number, code?: string, extra: Partial<ProblemBody> = {}, retryAfter: number | null = null) {
  const problem = code ? ({ type: 'x', title: 't', status, code, ...extra } as ProblemBody) : null
  return new ApiError(status, problem, retryAfter)
}

const inTrash = api(409, 'bookmark_in_trash')
const notInTrash = api(409, 'bookmark_not_in_trash')
const notFound = api(404, 'not_found')
const tooLong = (...fields: string[]) =>
  api(422, 'validation_error', { errors: fields.map((field) => ({ field, code: 'too_long' })) } as Partial<ProblemBody>)

type Row = [string, unknown, BookmarkAction, string, 'neutral' | 'error']

describe('describeFailure messages', () => {
  it.each<Row>([
    ['409 in trash, edit', inTrash, 'edit', "This bookmark is in the trash and can't be edited.", 'error'],
    ['409 in trash, delete', inTrash, 'delete', 'It was already in the trash.', 'neutral'],
    ['409 not in trash, restore', notInTrash, 'restore', 'It was already restored.', 'neutral'],
    ['404, edit', notFound, 'edit', 'This bookmark no longer exists.', 'error'],
    ['404, delete', notFound, 'delete', 'That bookmark no longer exists.', 'error'],
    ['404, restore', notFound, 'restore', 'That bookmark no longer exists.', 'error'],
    ['401, delete', api(401), 'delete', "You're logged out.", 'error'],
    ['network, edit', new TypeError('Failed to fetch'), 'edit', "Couldn't save your changes.", 'error'],
    ['network, delete', new TypeError('x'), 'delete', "Couldn't move it to the trash.", 'error'],
    ['network, restore', new TypeError('x'), 'restore', "Couldn't restore it.", 'error'],
    ['network, empty', new TypeError('x'), 'empty', "Couldn't empty the trash.", 'error'],
    ['500, edit', api(500, 'internal_error'), 'edit', "Couldn't save your changes.", 'error'],
    ['500, delete', api(500), 'delete', "Couldn't move it to the trash.", 'error'],
    ['500, restore', api(500), 'restore', "Couldn't restore it.", 'error'],
    ['500, empty', api(500), 'empty', "Couldn't empty the trash.", 'error'],
    ['404, move', notFound, 'move', 'That bookmark or folder no longer exists.', 'error'],
    ['409 in trash, move', inTrash, 'move', "This bookmark is in the trash and can't be moved.", 'error'],
    ['409 with another code, move', api(409, 'duplicate_bookmark'), 'move', "Couldn't move the bookmark.", 'error'],
    ['409 not in trash, move', notInTrash, 'move', "Couldn't move the bookmark.", 'error'],
    ['401, move', api(401), 'move', "You're logged out.", 'error'],
    ['500, move', api(500, 'internal_error'), 'move', "Couldn't move the bookmark.", 'error'],
    ['network, move', new TypeError('Failed to fetch'), 'move', "Couldn't move the bookmark.", 'error'],
  ])('%s', (_name, error, action, message, tone) => {
    const out = describeFailure(error, action)
    expect(out.message).toBe(message)
    expect(out.tone).toBe(tone)
    expect(out.refresh).toBe(true)
    expect(out.fields).toEqual({})
  })

  it('does not match a code on the wrong action', () => {
    expect(describeFailure(notInTrash, 'delete').message).toBe("Couldn't move it to the trash.")
    expect(describeFailure(inTrash, 'restore').message).toBe("Couldn't restore it.")
    expect(describeFailure(notFound, 'empty').message).toBe("Couldn't empty the trash.")
  })

  it.each<BookmarkAction>(['edit', 'delete', 'restore', 'empty', 'move'])('401 is signed out for %s', (action) => {
    expect(describeFailure(api(401), action).signedOut).toBe(true)
    expect(describeFailure(api(500), action).signedOut).toBe(false)
  })
})

describe('describeFailure 429', () => {
  it.each<BookmarkAction>(['edit', 'delete', 'restore', 'empty', 'move'])('says the same for %s', (action) => {
    expect(describeFailure(api(429, 'rate_limited', {}, 7), action).message).toBe(
      'Too many requests. Try again in about 7 seconds.',
    )
  })

  it.each([
    [12, 'Too many requests. Try again in about 12 seconds.'],
    [0, 'Too many requests. Try again in about 0 seconds.'],
    [null, 'Too many requests. Try again in a moment.'],
  ])('retryAfter %s', (retryAfter, message) => {
    expect(describeFailure(api(429, 'rate_limited', {}, retryAfter), 'edit').message).toBe(message)
  })
})

describe('describeFailure 422 on edit', () => {
  const titleMsg = 'Title is too long (300 characters at most).'
  const noteMsg = 'Note is too long (500 characters at most).'

  it('puts a title error under the title, and does not refresh', () => {
    const out = describeFailure(tooLong('title'), 'edit')
    expect(out.fields).toEqual({ title: titleMsg })
    expect(out.refresh).toBe(false)
  })
  it('puts a note error under the note', () => {
    expect(describeFailure(tooLong('note'), 'edit').fields).toEqual({ note: noteMsg })
  })
  it('reports both', () => {
    expect(describeFailure(tooLong('title', 'note'), 'edit').fields).toEqual({ title: titleMsg, note: noteMsg })
  })
  it('falls back to the generic message for a 422 it does not know', () => {
    const out = describeFailure(api(422, 'validation_error', { errors: [{ field: 'x', code: 'invalid' }] } as Partial<ProblemBody>), 'edit')
    expect(out.message).toBe("Couldn't save your changes.")
  })
})
