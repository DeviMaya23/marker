import { afterEach, expect, it, vi } from 'vitest'
import { loginHref } from './loginHref'

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
