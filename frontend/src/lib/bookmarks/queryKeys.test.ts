import { describe, expect, it } from 'vitest'
import { bookmarkListKey } from './queryKeys'

describe('bookmarkListKey', () => {
  it('is unchanged for a list with no term', () => {
    expect(bookmarkListKey(false)).toEqual(['bookmark-list', { trashed: false, folderId: undefined }])
    expect(bookmarkListKey(true)).toEqual(['bookmark-list', { trashed: true, folderId: undefined }])
    expect(bookmarkListKey(false, 'f-1')).toEqual(['bookmark-list', { trashed: false, folderId: 'f-1' }])
  })

  it('treats an empty term as no term', () => {
    expect(bookmarkListKey(false, 'f-1', { q: '', includeNotes: true })).toEqual(bookmarkListKey(false, 'f-1'))
  })

  it('differs with a term, another term, the other notes setting and another folder', () => {
    const plain = JSON.stringify(bookmarkListKey(false))
    const foo = JSON.stringify(bookmarkListKey(false, undefined, { q: 'foo', includeNotes: false }))
    const keys = [
      plain,
      foo,
      JSON.stringify(bookmarkListKey(false, undefined, { q: 'bar', includeNotes: false })),
      JSON.stringify(bookmarkListKey(false, undefined, { q: 'foo', includeNotes: true })),
      JSON.stringify(bookmarkListKey(false, 'f-1', { q: 'foo', includeNotes: false })),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })
})
