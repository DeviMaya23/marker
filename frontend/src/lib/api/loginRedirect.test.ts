import { beforeEach, describe, expect, it, vi } from 'vitest'
import { goTo } from '../goTo'
import { redirectToLogin, resetLoginRedirectForTests, suppressLoginRedirect } from './loginRedirect'

vi.mock('../goTo', () => ({ goTo: vi.fn() }))

beforeEach(() => {
  vi.mocked(goTo).mockReset()
})

describe('redirectToLogin', () => {
  it('goes to the login screen with the current path and query, read now', () => {
    window.history.pushState({}, '', '/trash?x=1')
    redirectToLogin()
    expect(goTo).toHaveBeenCalledExactlyOnceWith('/login?return_to=%2Ftrash%3Fx%3D1')
  })

  it('redirects once per page load, and again after the test reset', () => {
    redirectToLogin()
    redirectToLogin()
    redirectToLogin()
    expect(goTo).toHaveBeenCalledTimes(1)
    resetLoginRedirectForTests()
    redirectToLogin()
    expect(goTo).toHaveBeenCalledTimes(2)
  })

  it.each(['/login', '/login/', '/Login', '/LOGIN/', '/login?return_to=%2F'])(
    'does nothing at %s and does not use up the guard',
    (location) => {
      window.history.pushState({}, '', location)
      redirectToLogin()
      expect(goTo).not.toHaveBeenCalled()
      window.history.pushState({}, '', '/trash')
      redirectToLogin()
      expect(goTo).toHaveBeenCalledExactlyOnceWith('/login?return_to=%2Ftrash')
    },
  )

  it('does not treat /loginx as the login screen', () => {
    window.history.pushState({}, '', '/loginx')
    redirectToLogin()
    expect(goTo).toHaveBeenCalledTimes(1)
  })

  it('does nothing after suppressLoginRedirect', () => {
    suppressLoginRedirect()
    redirectToLogin()
    expect(goTo).not.toHaveBeenCalled()
  })
})
