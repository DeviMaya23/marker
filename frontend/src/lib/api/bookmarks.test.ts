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

  const sentQuery = async (params: Parameters<typeof listBookmarks>[0]) => {
    await listBookmarks(params)
    const path = vi.mocked(apiRequest).mock.calls[0][1]
    return new URLSearchParams(path.split('?')[1] ?? '')
  }

  it('sends q URL-encoded: a space, &, a quote and a non-ASCII letter round-trip', async () => {
    const q = 'a b&c "d" é'
    await listBookmarks({ q })
    const path = vi.mocked(apiRequest).mock.calls[0][1]
    expect(path).not.toMatch(/[ "é]/)
    expect(new URLSearchParams(path.split('?')[1]).get('q')).toBe(q)
  })

  it('sends include_notes=true only with a q and includeNotes: true', async () => {
    expect((await sentQuery({ q: 'foo', includeNotes: true })).get('include_notes')).toBe('true')
    vi.mocked(apiRequest).mockClear()
    expect((await sentQuery({ includeNotes: true })).has('include_notes')).toBe(false)
    vi.mocked(apiRequest).mockClear()
    expect((await sentQuery({ q: 'foo', includeNotes: false })).has('include_notes')).toBe(false)
    vi.mocked(apiRequest).mockClear()
    expect((await sentQuery({ q: 'foo' })).has('include_notes')).toBe(false)
  })

  it('sends q with a folder and a cursor, and nothing else changes without q', async () => {
    await listBookmarks({ q: 'foo', folderId: 'f-1', cursor: 'c1' })
    expect(apiRequest).toHaveBeenCalledWith('GET', '/bookmarks?folder_id=f-1&q=foo&cursor=c1')
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

  it('updateBookmark sends folder_id as a string, as an explicit null, and not at all', async () => {
    await updateBookmark('b1', { folder_id: 'f-1' })
    expect(JSON.stringify(vi.mocked(apiRequest).mock.calls.at(-1)?.[2])).toBe('{"folder_id":"f-1"}')

    await updateBookmark('b1', { folder_id: null })
    expect(JSON.stringify(vi.mocked(apiRequest).mock.calls.at(-1)?.[2])).toBe('{"folder_id":null}')

    await updateBookmark('b1', { title: 'T', note: 'n', folder_id: undefined })
    const body = vi.mocked(apiRequest).mock.calls.at(-1)?.[2]
    expect(JSON.stringify(body)).toBe('{"title":"T","note":"n"}')
    expect(body).not.toHaveProperty('folder_id')
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
