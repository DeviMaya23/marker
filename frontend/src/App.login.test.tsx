import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { goTo } from './lib/goTo'
import { renderApp } from './test/wrap'

vi.mock('./lib/goTo', () => ({ goTo: vi.fn() }))

const unauthenticated = () =>
  new Response(
    JSON.stringify({ type: 'about:blank', title: 'x', status: 401, code: 'unauthenticated' }),
    { status: 401, headers: { 'Content-Type': 'application/problem+json' } },
  )

beforeEach(() => {
  vi.mocked(goTo).mockReset()
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(unauthenticated())))
})
afterEach(() => vi.unstubAllGlobals())

describe('App login', () => {
  it('renders the login page at /login', async () => {
    window.history.pushState({}, '', '/login')
    renderApp(<App />, { path: '/login' })
    expect(await screen.findByRole('heading', { name: 'marker' })).toBeInTheDocument()
    expect(goTo).not.toHaveBeenCalled()
  })

  it('FR-3c: a signed-out save popup goes to login and back to the same /save URL', async () => {
    const path = '/save?url=https%3A%2F%2Fx.test%2F&title=A%20B'
    window.history.pushState({}, '', path)
    renderApp(<App />, { path })
    await waitFor(() => expect(goTo).toHaveBeenCalled())
    expect(goTo).toHaveBeenCalledExactlyOnceWith(`/login?return_to=${encodeURIComponent(path)}`)
  })
})
