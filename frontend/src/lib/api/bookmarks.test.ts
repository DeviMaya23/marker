import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteBookmark, emptyTrash, listBookmarks, restoreBookmark, updateBookmark } from './bookmarks'
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
    ['a folder', { folderId: 'f-1' }, '/bookmarks?folder_id=f-1'],
    ['a folder and a cursor', { folderId: 'f-1', cursor: 'abc' }, '/bookmarks?folder_id=f-1&cursor=abc'],
    ['a cursor with + / = &', { cursor: 'a+b/c=d&e' }, '/bookmarks?cursor=a%2Bb%2Fc%3Dd%26e'],
  ])('requests the right path for %s', async (_name, params, path) => {
    await listBookmarks(params)
    expect(apiRequest).toHaveBeenCalledWith('GET', path)
  })
})

describe('write wrappers', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
    vi.mocked(apiRequest).mockResolvedValue(undefined)
  })

  it('updateBookmark sends only the keys given', async () => {
    await updateBookmark('b 1', { title: 'New' })
    expect(apiRequest).toHaveBeenLastCalledWith('PATCH', '/bookmarks/b%201', { title: 'New' })
    await updateBookmark('b1', { note: 'n' })
    expect(apiRequest).toHaveBeenLastCalledWith('PATCH', '/bookmarks/b1', { note: 'n' })
    await updateBookmark('b1', { title: 'T', note: 'n' })
    expect(apiRequest).toHaveBeenLastCalledWith('PATCH', '/bookmarks/b1', { title: 'T', note: 'n' })
  })

  it('updateBookmark sends note: null as null, and leaves an omitted note out of the body', async () => {
    await updateBookmark('b1', { note: null })
    const nulled = vi.mocked(apiRequest).mock.calls.at(-1)?.[2]
    expect(JSON.stringify(nulled)).toBe('{"note":null}')

    await updateBookmark('b1', { title: 'T', note: undefined })
    const omitted = vi.mocked(apiRequest).mock.calls.at(-1)?.[2]
    expect(JSON.stringify(omitted)).toBe('{"title":"T"}')
  })

  it('deleteBookmark is a DELETE and restoreBookmark a POST to /restore, both without a body', async () => {
    await deleteBookmark('b1')
    expect(apiRequest).toHaveBeenLastCalledWith('DELETE', '/bookmarks/b1')
    await restoreBookmark('b1')
    expect(apiRequest).toHaveBeenLastCalledWith('POST', '/bookmarks/b1/restore')
  })

  it('emptyTrash is a DELETE to /trash and returns the count', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ deleted: 3 })
    await expect(emptyTrash()).resolves.toEqual({ deleted: 3 })
    expect(apiRequest).toHaveBeenLastCalledWith('DELETE', '/trash')
  })
})
