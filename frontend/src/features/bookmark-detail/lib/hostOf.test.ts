import { describe, expect, it } from 'vitest'
import { hostOf } from './hostOf'

describe('hostOf', () => {
  it('returns the host name', () => {
    expect(hostOf('https://www.example.com/a')).toBe('www.example.com')
    expect(hostOf('http://example.com:8080/a?b=1#c')).toBe('example.com')
  })

  it.each(['not a url', '', '/relative/path', 'mailto:someone'])(
    'returns the whole text for %j, which has no host',
    (text) => expect(hostOf(text)).toBe(text),
  )
})
