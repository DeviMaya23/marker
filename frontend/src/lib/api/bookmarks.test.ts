import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listBookmarks } from './bookmarks'
import { apiRequest } from './request'

vi.mock('./request', () => ({ apiRequest: vi.fn() }))

describe('listBookmarks', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
    vi.mocked(apiRequest).mockResolvedValue({ items: [], next_cursor: null })
  })

  it.each([
    ['no arguments', undefined, '/bookmarks'],
    ['trashed: true', { trashed: true }, '/bookmarks?trashed=true'],
    ['trashed: false', { trashed: false }, '/bookmarks'],
    ['a plain cursor', { cursor: 'abc' }, '/bookmarks?cursor=abc'],
    ['trashed and a cursor', { trashed: true, cursor: 'abc' }, '/bookmarks?trashed=true&cursor=abc'],
    ['a cursor with + / = &', { cursor: 'a+b/c=d&e' }, '/bookmarks?cursor=a%2Bb%2Fc%3Dd%26e'],
  ])('requests the right path for %s', async (_name, params, path) => {
    await listBookmarks(params)
    expect(apiRequest).toHaveBeenCalledWith('GET', path)
  })
})
