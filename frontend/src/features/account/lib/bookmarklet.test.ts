import { describe, expect, it, vi } from 'vitest'
import { bookmarkletHref } from './bookmarklet'

/** Runs the bookmarklet's code against stand-in page objects; returns the `window.open` spy. */
function run(origin: string, page: { href: string; title: string }) {
  const href = bookmarkletHref(origin)
  const code = href.slice('javascript:'.length)
  const open = vi.fn()
  new Function('location', 'document', 'window', code)({ href: page.href }, { title: page.title }, { open })
  return open
}

describe('bookmarkletHref', () => {
  it('starts with javascript:', () => {
    expect(bookmarkletHref('https://marker.test')).toMatch(/^javascript:/)
  })

  it.each([
    ['a page URL with a query and a fragment', 'https://example.com/p?a=1&b=2#frag', 'Plain'],
    ['a title with & # = a quote, a space and a non-Latin character', 'https://example.com/', `A&B #1 = "x" ñ 日本`],
  ])('opens the save page with %s, round-tripped', (_name, pageUrl, title) => {
    const open = run('https://marker.test', { href: pageUrl, title })
    expect(open).toHaveBeenCalledTimes(1)
    const [url, name, features] = open.mock.calls[0] as [string, string, string]
    expect(name).toBe('save-bookmark')
    expect(features).toBe('width=480,height=420')
    expect(url.startsWith('https://marker.test/save?')).toBe(true)
    const parsed = new URL(url)
    expect(parsed.searchParams.get('url')).toBe(pageUrl)
    expect(parsed.searchParams.get('title')).toBe(title)
  })

  it('escapes the origin instead of pasting it in', () => {
    for (const origin of [`https://a'b.test`, 'https://a"b.test', 'https://a\\b.test']) {
      const open = run(origin, { href: 'https://x.test/', title: 't' })
      expect(open).toHaveBeenCalledTimes(1)
      expect((open.mock.calls[0] as [string])[0].startsWith(`${origin}/save?`)).toBe(true)
    }
  })

  it('carries no noopener, secret or user data', () => {
    const code = bookmarkletHref('https://marker.test').toLowerCase()
    for (const word of ['noopener', 'cookie', 'localstorage', 'sessionstorage', 'csrf', 'token']) {
      expect(code).not.toContain(word)
    }
  })
})
