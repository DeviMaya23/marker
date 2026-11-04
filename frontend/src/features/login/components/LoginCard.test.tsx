import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../../test/wrap'
import { LoginCard } from './LoginCard'

afterEach(() => vi.unstubAllEnvs())

describe('LoginCard', () => {
  it('links to the real login in production and to dev-login in development, as an anchor', () => {
    vi.stubEnv('DEV', false)
    const { unmount } = renderApp(<LoginCard returnTo="/trash" />)
    const link = screen.getByRole('link', { name: 'Log in' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/auth/login?return_to=%2Ftrash')
    unmount()
    vi.stubEnv('DEV', true)
    renderApp(<LoginCard returnTo="/trash" />)
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/auth/dev-login?name=alice&return_to=%2Ftrash',
    )
  })
})
