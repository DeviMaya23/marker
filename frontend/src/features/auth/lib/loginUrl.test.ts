import { describe, expect, it } from 'vitest'
import { loginUrl } from './loginUrl'

describe('loginUrl', () => {
  it('points at dev-login in a development build', () => {
    expect(loginUrl('/', true)).toBe('/auth/dev-login?name=alice&return_to=%2F')
  })

  it('points at /auth/login otherwise', () => {
    expect(loginUrl('/', false)).toBe('/auth/login?return_to=%2F')
  })

  it('encodes the path and query, keeping & and # inside the value', () => {
    const url = loginUrl('/save?url=https%3A%2F%2Fa.test%2F%3Fx%3D1%26y%3D2%23f&title=Hi there', false)
    const value = new URL(url, 'http://x.test').searchParams.get('return_to')
    expect(value).toBe('/save?url=https%3A%2F%2Fa.test%2F%3Fx%3D1%26y%3D2%23f&title=Hi there')
    expect(url.split('return_to=')[1]).not.toMatch(/[&#? ]/)
  })
})
