import { afterEach, describe, expect, it, vi } from 'vitest'
import { loginHref, loginPageHref } from './loginHref'

afterEach(() => vi.unstubAllEnvs())

it('returns to the path and query, encoded, through dev-login in a development build', () => {
  vi.stubEnv('DEV', true)
  expect(loginHref('/bookmarks/a', '?x=1')).toBe(
    '/auth/dev-login?name=alice&return_to=%2Fbookmarks%2Fa%3Fx%3D1',
  )
})

it('uses the real login route in a production build', () => {
  vi.stubEnv('DEV', false)
  expect(loginHref('/trash', '')).toBe('/auth/login?return_to=%2Ftrash')
})

describe('loginPageHref', () => {
  it('encodes the path and query once', () => {
    expect(loginPageHref('/trash', '?x=1')).toBe('/login?return_to=%2Ftrash%3Fx%3D1')
    expect(loginPageHref('/', '')).toBe('/login?return_to=%2F')
  })
})
