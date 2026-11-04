import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bookmarkletHref } from '../lib/bookmarklet'
import { BookmarkletSection } from './BookmarkletSection'

afterEach(() => vi.restoreAllMocks())

describe('BookmarkletSection', () => {
  it('carries the bookmarklet in the href attribute and ignores a click inside the app', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<BookmarkletSection />)
    const link = screen.getByRole('link', { name: 'Save to marker' })
    expect(link.getAttribute('href')).toBe(bookmarkletHref(window.location.origin))
    // fireEvent returns false when the default was prevented.
    expect(fireEvent.click(link)).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it('lists the four browsers in order', () => {
    render(<BookmarkletSection />)
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(steps).toHaveLength(4)
    expect(steps.map((s) => s.split(':')[0])).toEqual(['Chrome', 'Firefox', 'Opera', 'Safari'])
  })
})
