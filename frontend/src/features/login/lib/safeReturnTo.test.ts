import { describe, expect, it } from 'vitest'
import { safeReturnTo } from './safeReturnTo'

const long = (n: number) => '/' + 'a'.repeat(n - 1)

describe('safeReturnTo', () => {
  it.each([
    '/',
    '/trash',
    '/folder/abc?q=a%20b',
    '/save?url=https%3A%2F%2Fx.test%2F&title=A',
    '/bookmarks/1#x',
    long(8192),
    '/loginx',
    '/authentic',
    '/apix',
  ])('keeps %s', (raw) => {
    expect(safeReturnTo(raw)).toBe(raw)
  })

  it.each([
    null,
    '',
    'trash',
    '//evil.example',
    '/\\evil',
    '/a\\b',
    'https://evil.example/',
    'javascript:alert(1)',
    '/a b',
    '/a\nb',
    '/a\0b',
    '/a\tb',
    '/a\x7fb',
    long(8193),
    '/login',
    '/Login',
    '/LOGIN/x',
    '/login?return_to=%2F',
    '/login#x',
    '/login/',
    '/login/x',
    '/auth',
    '/Auth',
    '/auth/login',
    '/AUTH/x',
    '/auth/callback?code=x',
    '/api',
    '/api?x=1',
    '/api/v1/bookmarks',
    '/API/v1/x',
  ])('falls back to / for %j', (raw) => {
    expect(safeReturnTo(raw)).toBe('/')
  })
})
