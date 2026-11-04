import { describe, expect, it } from 'vitest'
import { codePointLength, computeChanges, overLimits } from './editChanges'

describe('codePointLength', () => {
  it('counts an emoji as one', () => {
    expect(codePointLength('a😀b')).toBe(3)
    expect('😀'.length).toBe(2)
    expect(codePointLength('')).toBe(0)
  })
})

describe('overLimits', () => {
  const title = (n: number) => 'a'.repeat(n)
  it.each([
    [300, false],
    [301, true],
  ])('title of %i characters: over is %s', (n, over) => {
    expect(overLimits({ title: title(n), note: '' }).title).toBe(over)
  })
  it.each([
    [500, false],
    [501, true],
  ])('note of %i characters: over is %s', (n, over) => {
    expect(overLimits({ title: '', note: 'n'.repeat(n) }).note).toBe(over)
  })
  it('counts emoji once: 300 of them fit, 301 do not', () => {
    expect(overLimits({ title: '😀'.repeat(300), note: '' }).title).toBe(false)
    expect(overLimits({ title: '😀'.repeat(301), note: '' }).title).toBe(true)
    expect(overLimits({ title: '', note: '😀'.repeat(500) }).note).toBe(false)
    expect(overLimits({ title: '', note: '😀'.repeat(501) }).note).toBe(true)
  })
  it('counts the title trimmed, and ignores a spaces-only note', () => {
    expect(overLimits({ title: ` ${title(300)} `, note: '' }).title).toBe(false)
    expect(overLimits({ title: '', note: ' '.repeat(600) }).note).toBe(false)
  })
})

describe('computeChanges', () => {
  const stored = { title: 'Old', note: 'old note' as string | null }

  it('sends nothing when nothing changed', () => {
    expect(computeChanges(stored, { title: 'Old', note: 'old note' })).toEqual({})
  })
  it('sends the title only, note only, or both', () => {
    expect(computeChanges(stored, { title: 'New', note: 'old note' })).toEqual({ title: 'New' })
    expect(computeChanges(stored, { title: 'Old', note: 'new note' })).toEqual({ note: 'new note' })
    expect(computeChanges(stored, { title: 'New', note: 'new note' })).toEqual({ title: 'New', note: 'new note' })
  })
  it('sends a title trimmed, and nothing when only the surrounding spaces changed', () => {
    expect(computeChanges(stored, { title: '  New  ', note: 'old note' })).toEqual({ title: 'New' })
    expect(computeChanges(stored, { title: '  Old ', note: 'old note' })).toEqual({})
  })
  it('allows an empty title', () => {
    expect(computeChanges(stored, { title: '   ', note: 'old note' })).toEqual({ title: '' })
  })
  it('sends null for an emptied note, and for a spaces-only note, when there was one', () => {
    expect(computeChanges(stored, { title: 'Old', note: '' })).toEqual({ note: null })
    expect(computeChanges(stored, { title: 'Old', note: '   ' })).toEqual({ note: null })
  })
  it('sends nothing for an empty or spaces-only note when there was none', () => {
    const none = { title: 'Old', note: null }
    expect(computeChanges(none, { title: 'Old', note: '' })).toEqual({})
    expect(computeChanges(none, { title: 'Old', note: '  ' })).toEqual({})
  })
  it('sends a note as typed, spaces included', () => {
    expect(computeChanges({ title: 'Old', note: null }, { title: 'Old', note: ' hi ' })).toEqual({ note: ' hi ' })
  })
  it('keeps note: null as an explicit key', () => {
    expect('note' in computeChanges(stored, { title: 'Old', note: '' })).toBe(true)
    expect('note' in computeChanges(stored, { title: 'New', note: 'old note' })).toBe(false)
  })
})
