import { act, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { Route, Routes, useLocation, useNavigationType } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api/ApiError'
import { getSyncVersion } from '../lib/api/sync'
import { loginHref } from '../lib/loginHref'
import { renderApp } from '../test/wrap'
import { LoginPage } from './LoginPage'

vi.mock('../lib/api/sync', () => ({ getSyncVersion: vi.fn() }))
vi.mock('../lib/goTo', () => ({ goTo: vi.fn() }))

function Where() {
  const { pathname } = useLocation()
  const type = useNavigationType()
  return <p data-testid="where">{`${pathname} ${type}`}</p>
}

function page(strict = false) {
  const ui = (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Where />} />
    </Routes>
  )
  return strict ? <StrictMode>{ui}</StrictMode> : ui
}

beforeEach(() => {
  vi.mocked(getSyncVersion).mockReset()
  vi.stubEnv('DEV', false)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

const signedOut = () => vi.mocked(getSyncVersion).mockRejectedValue(new ApiError(401, null, null))

describe('LoginPage', () => {
  it('shows only the checking status while the probe is pending', () => {
    vi.mocked(getSyncVersion).mockReturnValue(new Promise(() => {}))
    renderApp(page(), { path: '/login' })
    expect(screen.getByText('Checking your session…')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('goes to the return path with replace when already signed in', async () => {
    vi.mocked(getSyncVersion).mockResolvedValue({ version: 1 } as never)
    renderApp(page(), { path: '/login?return_to=%2Ftrash' })
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/trash REPLACE'))
    expect(screen.queryByRole('heading', { name: 'marker' })).toBeNull()
  })

  it.each(['', '?return_to=%2F%2Fevil.example', '?return_to=%2Flogin', '?return_to=https%3A%2F%2Fx'])(
    'goes to / when signed in with return_to %j',
    async (query) => {
      vi.mocked(getSyncVersion).mockResolvedValue({ version: 1 } as never)
      renderApp(page(), { path: `/login${query}` })
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/ REPLACE'))
    },
  )

  it.each([
    ['401', new ApiError(401, null, null)],
    ['429', new ApiError(429, null, 2)],
    ['500', new ApiError(500, null, null)],
    ['a network error', new TypeError('Failed to fetch')],
  ])('shows the card with a working link on %s', async (_n, error) => {
    vi.mocked(getSyncVersion).mockRejectedValue(error)
    renderApp(page(), { path: '/login?return_to=%2Ftrash' })
    expect(await screen.findByRole('heading', { name: 'marker' })).toBeInTheDocument()
    expect(screen.getByText('A place to dump links and find them again.')).toBeInTheDocument()
    expect(screen.getByText(/You'll continue to your identity provider/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Log in' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', loginHref('/trash', ''))
    expect(link).toHaveAttribute('href', '/auth/login?return_to=%2Ftrash')
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('uses dev-login in a development build', async () => {
    vi.stubEnv('DEV', true)
    signedOut()
    renderApp(page(), { path: '/login?return_to=%2Ftrash' })
    expect(await screen.findByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/auth/dev-login?name=alice&return_to=%2Ftrash',
    )
  })

  it.each(['', '?return_to=%2F%2Fevil.example', '?return_to=%2Flogin%3Freturn_to%3D%2Fx'])(
    'links for / with return_to %j',
    async (query) => {
      signedOut()
      renderApp(page(), { path: `/login${query}` })
      expect(await screen.findByRole('link', { name: 'Log in' })).toHaveAttribute(
        'href',
        loginHref('/', ''),
      )
    },
  )

  it('keeps a nested query through the link', async () => {
    signedOut()
    renderApp(page(), {
      path: '/login?return_to=%2Fsave%3Furl%3Dhttps%253A%252F%252Fx.test%252F%26title%3DA',
    })
    const href = (await screen.findByRole('link', { name: 'Log in' })).getAttribute('href')!
    const returnTo = new URLSearchParams(href.split('?')[1]).get('return_to')
    expect(returnTo).toBe('/save?url=https%3A%2F%2Fx.test%2F&title=A')
  })

  it('asks the probe once, with no arguments, under StrictMode, and never polls', async () => {
    signedOut()
    renderApp(page(true), { path: '/login' })
    await screen.findByRole('link', { name: 'Log in' })
    vi.useFakeTimers()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(getSyncVersion).toHaveBeenCalledExactlyOnceWith()
  })

  describe('login error message', () => {
    const FAILED = "Login didn't complete. Please try again."
    const CANCELLED = 'Login was cancelled.'

    it('shows the login-failed message with the link in place', async () => {
      signedOut()
      renderApp(page(), { path: '/login?error=login_failed' })
      expect(await screen.findByRole('alert')).toHaveTextContent(FAILED)
      expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument()
    })

    it('shows the cancelled message', async () => {
      signedOut()
      renderApp(page(), { path: '/login?error=access_denied' })
      expect(await screen.findByRole('alert')).toHaveTextContent(CANCELLED)
    })

    it('keeps return_to in the link next to the message', async () => {
      signedOut()
      renderApp(page(), { path: '/login?error=login_failed&return_to=%2Ftrash' })
      expect(await screen.findByRole('alert')).toHaveTextContent(FAILED)
      expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
        'href',
        '/auth/login?return_to=%2Ftrash',
      )
    })

    it.each([
      ['an unknown value', '?error=foo'],
      ['an empty value', '?error='],
      ['another case', '?error=LOGIN_FAILED'],
      ['no error', ''],
      ['a NUL suffix', '?error=login_failed%00'],
      ['a very long value', `?error=${'a'.repeat(5000)}`],
      ['an error[] key', '?error[]=x'],
      ['a trailing space', '?error=login_failed%20'],
      ['a double-encoded value', '?error=login%255Ffailed'],
    ])('shows no alert for %s', async (_n, query) => {
      signedOut()
      renderApp(page(), { path: `/login${query}` })
      await screen.findByRole('link', { name: 'Log in' })
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('ignores a fragment after the value', async () => {
      signedOut()
      renderApp(page(), { path: '/login?error=login_failed#x' })
      expect(await screen.findByRole('alert')).toHaveTextContent(FAILED)
    })

    it('uses the first value when the key repeats', async () => {
      signedOut()
      renderApp(page(), { path: '/login?error=login_failed&error=access_denied' })
      expect(await screen.findByRole('alert')).toHaveTextContent(FAILED)
    })

    it('links to / for an unsafe return_to and still shows the message', async () => {
      signedOut()
      renderApp(page(), { path: '/login?error=access_denied&return_to=%2F%2Fevil.example' })
      expect(await screen.findByRole('alert')).toHaveTextContent(CANCELLED)
      expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', loginHref('/', ''))
    })

    it('shows only the checking status while the probe is pending', () => {
      vi.mocked(getSyncVersion).mockReturnValue(new Promise(() => {}))
      renderApp(page(), { path: '/login?error=login_failed' })
      expect(screen.getByText('Checking your session…')).toHaveAttribute('role', 'status')
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it.each(['', '&return_to=%2Ftrash'])('never shows it when signed in (%j)', async (extra) => {
      vi.mocked(getSyncVersion).mockResolvedValue({ version: 1 } as never)
      renderApp(page(), { path: `/login?error=login_failed${extra}` })
      const to = extra ? '/trash' : '/'
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`${to} REPLACE`))
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it.each([
      ['500', new ApiError(500, null, null)],
      ['429', new ApiError(429, null, 2)],
      ['a network error', new TypeError('Failed to fetch')],
    ])('shows the message when the probe fails with %s', async (_n, error) => {
      vi.mocked(getSyncVersion).mockRejectedValue(error)
      renderApp(page(), { path: '/login?error=access_denied' })
      expect(await screen.findByRole('alert')).toHaveTextContent(CANCELLED)
    })
  })
})
