import { describe, expect, it } from 'vitest'
import { LOGIN_ERROR_MESSAGES, loginErrorFrom } from './loginError'

describe('loginErrorFrom', () => {
  it.each(['login_failed', 'access_denied'])('gives the code for %j', (code) => {
    expect(loginErrorFrom(code)).toBe(code)
  })

  it.each([null, '', 'LOGIN_FAILED', ' login_failed', 'login_failed ', 'access-denied', 'x'])(
    'gives null for %j',
    (raw) => {
      expect(loginErrorFrom(raw)).toBeNull()
    },
  )
})

describe('LOGIN_ERROR_MESSAGES', () => {
  it('has exactly the two texts', () => {
    expect(LOGIN_ERROR_MESSAGES).toEqual({
      login_failed: "Login didn't complete. Please try again.",
      access_denied: 'Login was cancelled.',
    })
  })
})
