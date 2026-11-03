import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignedOutMessage } from './SignedOutMessage'

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SignedOutMessage />
    </MemoryRouter>,
  )
  return screen.getByRole('link', { name: 'Log in' })
}

describe('SignedOutMessage', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('says the user is logged out', () => {
    renderAt('/')
    expect(screen.getByText("You're logged out. Log in to continue.")).toBeInTheDocument()
  })

  it('links to dev-login in a development build', () => {
    vi.stubEnv('DEV', true)
    expect(renderAt('/bookmarks/abc')).toHaveAttribute(
      'href',
      '/auth/dev-login?name=alice&return_to=%2Fbookmarks%2Fabc',
    )
  })

  it('links to /auth/login otherwise', () => {
    vi.stubEnv('DEV', false)
    expect(renderAt('/bookmarks/abc')).toHaveAttribute(
      'href',
      '/auth/login?return_to=%2Fbookmarks%2Fabc',
    )
  })

  it('keeps the whole path and query, encoded once', () => {
    const query = '?url=https%3A%2F%2Fa.test%2Fp%3Fx%3D1%26y%3D2%23frag&title=Hi%20there'
    const link = renderAt(`/save${query}`)
    const returnTo = new URL(link.getAttribute('href') ?? '', 'http://x').searchParams.get('return_to')
    expect(returnTo).toBe(`/save${query}`)
  })
})
