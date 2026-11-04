import { describe, expect, it } from 'vitest'
import { readListSearch, writeListSearch } from './listSearch'

const read = (qs: string) => readListSearch(new URLSearchParams(qs))
const term = (q: string) => read(new URLSearchParams({ q }).toString()).q

describe('readListSearch: q', () => {
  it('trims the term', () => {
    expect(term('  foo bar \t')).toBe('foo bar')
  })

  it('gives an empty term for absent, empty and only spaces', () => {
    expect(read('').q).toBe('')
    expect(read('q=').q).toBe('')
    expect(term('   ')).toBe('')
  })

  it('passes 200 characters whole and cuts 201 to 200', () => {
    expect(term('a'.repeat(200))).toBe('a'.repeat(200))
    expect(term('a'.repeat(201))).toBe('a'.repeat(200))
  })

  it('counts characters, not UTF-16 units: 201 emoji are cut to 200 emoji', () => {
    expect(term('😀'.repeat(201))).toBe('😀'.repeat(200))
  })

  it('trims again when the cut ends on a space', () => {
    expect(term(`${'a'.repeat(199)} b`)).toBe('a'.repeat(199))
  })
})

describe('readListSearch: notes', () => {
  it('is on only for notes=1', () => {
    expect(read('notes=1').includeNotes).toBe(true)
  })

  it.each(['notes=0', 'notes=true', 'notes=', ''])('is off for %j', (qs) => {
    expect(read(qs).includeNotes).toBe(false)
  })
})

describe('writeListSearch', () => {
  it('sets q and notes and leaves other parameters alone', () => {
    const next = writeListSearch(new URLSearchParams('x=1&y=2'), { q: 'foo bar', includeNotes: true })
    expect(next.get('q')).toBe('foo bar')
    expect(next.get('notes')).toBe('1')
    expect(next.get('x')).toBe('1')
    expect(next.get('y')).toBe('2')
  })

  it('removes q for an empty term and notes when off, keeping the rest', () => {
    const next = writeListSearch(new URLSearchParams('q=old&notes=1&x=1'), { q: '', includeNotes: false })
    expect(next.toString()).toBe('x=1')
  })

  it('does not change the params it was given', () => {
    const params = new URLSearchParams('q=old')
    writeListSearch(params, { q: 'new', includeNotes: true })
    expect(params.toString()).toBe('q=old')
  })
})
