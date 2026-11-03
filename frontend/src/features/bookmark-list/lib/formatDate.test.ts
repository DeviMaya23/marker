import { describe, expect, it } from 'vitest'
import { formatDate } from './formatDate'

const now = new Date('2026-06-15T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('formatDate', () => {
  it.each([
    ['30 seconds', 30 * SEC, 'just now'],
    ['59 seconds', 59 * SEC, 'just now'],
    ['60 seconds', 60 * SEC, '1m ago'],
    ['59 minutes', 59 * MIN, '59m ago'],
    ['60 minutes', 60 * MIN, '1h ago'],
    ['23 hours', 23 * HOUR, '23h ago'],
    ['24 hours', 24 * HOUR, '1d ago'],
    ['6 days', 6 * DAY, '6d ago'],
  ])('shows %s as "%s"', (_name, ms, expected) => {
    expect(formatDate(ago(ms), now)).toBe(expected)
  })

  it('floors rather than rounds', () => {
    expect(formatDate(ago(119 * SEC), now)).toBe('1m ago')
    expect(formatDate(ago(47 * HOUR), now)).toBe('1d ago')
  })

  it('switches to a date at 7 days, without the year in the same year', () => {
    const iso = ago(7 * DAY)
    const expected = new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    expect(formatDate(iso, now)).toBe(expected)
    expect(formatDate(iso, now)).not.toContain('2026')
  })

  it('adds the year for an earlier year', () => {
    const iso = '2025-03-10T12:00:00Z'
    const expected = new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    expect(formatDate(iso, now)).toBe(expected)
    expect(formatDate(iso, now)).toContain('2025')
  })
})
