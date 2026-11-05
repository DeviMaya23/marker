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

  it.each([
    ['login_failed', "Login didn't complete. Please try again."],
    ['access_denied', 'Login was cancelled.'],
  ] as const)('shows %s as one alert with exactly its message', (error, text) => {
    renderApp(<LoginCard returnTo="/" error={error} />)
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].textContent).toBe(text)
  })

  it('shows no alert and no banner without an error, and keeps the same link', () => {
    vi.stubEnv('DEV', false)
    const { container, unmount } = renderApp(<LoginCard returnTo="/trash" />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(container.querySelector('.banner')).toBeNull()
    const plain = screen.getByRole('link', { name: 'Log in' }).getAttribute('href')
    unmount()
    renderApp(<LoginCard returnTo="/trash" error="login_failed" />)
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', plain)
  })
})
