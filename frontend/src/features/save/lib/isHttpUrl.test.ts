import { describe, expect, it } from 'vitest'
import { isHttpUrl } from './isHttpUrl'

describe('isHttpUrl', () => {
  it.each([
    'https://example.com',
    'http://example.com/a?b=1&c=2#frag',
    'HTTPS://EXAMPLE.COM',
  ])('accepts %s', (text) => expect(isHttpUrl(text)).toBe(true))

  it.each(['', 'example.com', 'javascript:alert(1)', 'ftp://example.com', 'data:text/html,hi', 'file:///etc/passwd'])(
    'rejects %j',
    (text) => expect(isHttpUrl(text)).toBe(false),
  )
})
