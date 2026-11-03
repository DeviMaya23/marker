import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './lib/api/ApiError'
import * as bookmarks from './lib/api/bookmarks'
import App from './App'

vi.mock('./lib/api/bookmarks')

function at(path: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('App routes', () => {
  it('shows the home page with the add field at /', () => {
    at('/')
    expect(screen.getByLabelText('URL')).toBeInTheDocument()
  })

  it('shows the save popup at /save', () => {
    at('/save?url=https%3A%2F%2Fa.test')
    expect(screen.getByText('Save bookmark')).toBeInTheDocument()
  })

  it('shows the bookmark page at /bookmarks/:id', async () => {
    vi.mocked(bookmarks.getBookmark).mockRejectedValue(new ApiError(404, null, null))
    at('/bookmarks/abc')
    expect(await screen.findByText('Bookmark not found')).toBeInTheDocument()
    expect(bookmarks.getBookmark).toHaveBeenCalledWith('abc')
  })

  it('shows Page not found with a link home for any other path', () => {
    at('/nope')
    expect(screen.getByText('Page not found')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/')
  })
})
