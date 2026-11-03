import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./lib/api/bookmarks', () => ({ createBookmark: vi.fn(), getBookmark: vi.fn(() => new Promise(() => {})) }))

function openAt(path: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('App routes', () => {
  it('shows the paste-a-URL field at /', () => {
    openAt('/')
    expect(screen.getByLabelText('Link to save')).toBeInTheDocument()
  })

  it('shows the save popup at /save', () => {
    openAt('/save?url=https%3A%2F%2Fa.test')
    expect(screen.getByText('Save bookmark')).toBeInTheDocument()
  })

  it('shows the bookmark page at /bookmarks/:id', () => {
    openAt('/bookmarks/b-1')
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows "Page not found" with a link to / for any other path', () => {
    openAt('/nope/at/all')
    expect(screen.getByText('Page not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /home page/ })).toHaveAttribute('href', '/')
  })
})
