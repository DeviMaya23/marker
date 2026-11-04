import { describe, expect, it } from 'vitest'
import { ApiError, type ProblemBody } from '../api/ApiError'
import { folderFailureMessage, type FolderAction, type FolderFailure } from './folderFailureMessage'

function problem(code: string, errors?: { field: string; code: string }[]): ProblemBody {
  return { type: `/errors/${code}`, title: code, status: 0, code, ...(errors ? { errors } : {}) } as ProblemBody
}
const api = (status: number, p: ProblemBody | null = null, retryAfter: number | null = null) =>
  new ApiError(status, p, retryAfter)

const field = (message: string): FolderFailure => ({ kind: 'field', message, refresh: false })
const dialog = (message: string, refresh = true): FolderFailure => ({ kind: 'dialog', message, refresh })

const GONE = 'This folder no longer exists.'
const required = api(422, problem('validation_error', [{ field: 'name', code: 'required' }]))
const tooLong = api(422, problem('validation_error', [{ field: 'name', code: 'too_long' }]))
const conflict = api(409, problem('folder_name_conflict'))
const depth = api(422, problem('folder_depth_exceeded'))
const cycle = api(422, problem('folder_cycle'))

describe('folderFailureMessage', () => {
  it.each<[string, FolderAction, unknown, FolderFailure]>([
    ['create: 422 required', 'create', required, field('Give the folder a name.')],
    ['rename: 422 required', 'rename', required, field('Give the folder a name.')],
    ['create: 422 too_long', 'create', tooLong, field('Name is too long (100 characters at most).')],
    ['rename: 422 too_long', 'rename', tooLong, field('Name is too long (100 characters at most).')],
    ['create: 409 conflict', 'create', conflict, field('A folder with this name already exists here.')],
    ['rename: 409 conflict', 'rename', conflict, field('A folder with this name already exists here.')],
    ['create: 422 depth', 'create', depth, dialog('Folders can only be nested 3 levels deep.', false)],
    ['rename: 422 depth', 'rename', depth, dialog('Folders can only be nested 3 levels deep.', false)],
    ['create: 404', 'create', api(404, problem('not_found')), dialog(GONE)],
    ['rename: 404', 'rename', api(404, problem('not_found')), dialog(GONE)],
    ['delete: 404', 'delete', api(404, problem('not_found')), dialog(GONE)],
    ['create: 401 gets the generic result', 'create', api(401, problem('unauthenticated')), dialog("Couldn't create the folder.")],
    ['rename: 401 gets the generic result', 'rename', api(401), dialog("Couldn't rename the folder.")],
    ['delete: 401 gets the generic result', 'delete', api(401), dialog("Couldn't delete the folder.")],
    ['create: other 500', 'create', api(500, problem('internal_error')), dialog("Couldn't create the folder.")],
    ['rename: other 500', 'rename', api(500), dialog("Couldn't rename the folder.")],
    ['delete: other 500', 'delete', api(500), dialog("Couldn't delete the folder.")],
    ['create: network failure', 'create', new TypeError('Failed to fetch'), dialog("Couldn't create the folder.")],
    ['rename: network failure', 'rename', new TypeError('Failed to fetch'), dialog("Couldn't rename the folder.")],
    ['delete: network failure', 'delete', new TypeError('Failed to fetch'), dialog("Couldn't delete the folder.")],
    ['create: 422 with an unknown code', 'create', api(422, problem('validation_error')), dialog("Couldn't create the folder.")],
    ['create: 409 with another code', 'create', api(409, problem('duplicate_bookmark')), dialog("Couldn't create the folder.")],
    ['delete: a 409 is not a name conflict', 'delete', conflict, dialog("Couldn't delete the folder.")],
    ['move: 404', 'move', api(404, problem('not_found')), dialog('That folder no longer exists.')],
    ['move: 409 name conflict is in the banner, not a field', 'move', conflict, dialog('A folder with this name already exists there.', false)],
    ['move: 422 depth', 'move', depth, dialog('Folders can only be nested 3 levels deep.', false)],
    ['move: 422 cycle', 'move', cycle, dialog("A folder can't be moved into itself or one of its own subfolders.", false)],
    ['move: 422 with an unknown code', 'move', api(422, problem('validation_error')), dialog("Couldn't move the folder.", false)],
    ['move: 409 with another code', 'move', api(409, problem('duplicate_bookmark')), dialog("Couldn't move the folder.")],
    ['move: 401 gets the generic result', 'move', api(401), dialog("Couldn't move the folder.")],
    ['move: other 500', 'move', api(500, problem('internal_error')), dialog("Couldn't move the folder.")],
    ['move: network failure', 'move', new TypeError('Failed to fetch'), dialog("Couldn't move the folder.")],
  ])('%s', (_name, action, error, expected) => {
    expect(folderFailureMessage(action, error)).toEqual(expected)
  })

  it.each<[string, number | null, string]>([
    ['seconds', 7, 'Too many requests. Try again in about 7 seconds.'],
    ['zero', 0, 'Too many requests. Try again in about 0 seconds.'],
    ['null', null, 'Too many requests. Try again in a moment.'],
  ])('429 with Retry-After %s, on every action', (_name, retryAfter, message) => {
    for (const action of ['create', 'rename', 'delete', 'move'] as const) {
      expect(folderFailureMessage(action, api(429, problem('rate_limited'), retryAfter))).toEqual(dialog(message))
    }
  })
})
