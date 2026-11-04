import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ToastProvider } from './components/ui/Toast'
import { listBookmarks } from './lib/api/bookmarks'
import { bookmark, page } from './test/builders'

vi.mock('./lib/api/bookmarks', () => ({
  createBookmark: vi.fn(),
  getBookmark: vi.fn(() => new Promise(() => {})),
  listBookmarks: vi.fn(),
}))

vi.mock('./lib/api/folders', () => ({
  listFolders: vi.fn(() => Promise.resolve({ items: [] })),
}))

function openAt(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('App routes', () => {
  beforeEach(() => {
    vi.mocked(listBookmarks).mockReset()
    vi.mocked(listBookmarks).mockImplementation(({ trashed } = {}) =>
      Promise.resolve(
        page([
          bookmark({
            id: trashed ? 't-1' : 'l-1',
            title: trashed ? 'In the trash' : 'In the list',
            deleted_at: trashed ? '2026-01-02T00:00:00Z' : null,
          }),
        ]),
      ),
    )
  })

  it('shows the list with the paste-a-URL field at /', async () => {
    openAt('/')
    expect(screen.getByRole('heading', { level: 1, name: 'All bookmarks' })).toBeInTheDocument()
    expect(screen.getByLabelText('Link to save')).toBeInTheDocument()
    expect(await screen.findByText('In the list')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All bookmarks' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Trash' })).not.toHaveAttribute('aria-current')
  })

  it('shows the trash at /trash, with Empty trash and a Restore per row but no add field', async () => {
    openAt('/trash')
    expect(screen.getByRole('heading', { level: 1, name: 'Trash' })).toBeInTheDocument()
    expect(await screen.findByText('In the trash')).toBeInTheDocument()
    expect(screen.queryByLabelText('Link to save')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Empty trash' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Trash' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'All bookmarks' })).not.toHaveAttribute('aria-current')
    expect(listBookmarks).toHaveBeenCalledWith({ trashed: true, cursor: undefined })
  })

  it('has the search bar at / and no search field on the trash, detail or save pages', async () => {
    openAt('/')
    expect(screen.getByRole('searchbox', { name: 'Search bookmarks' })).toBeInTheDocument()
    cleanup()
    openAt('/trash')
    await screen.findByText('In the trash')
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
    cleanup()
    openAt('/bookmarks/b-1')
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
    cleanup()
    openAt('/save?url=https%3A%2F%2Fa.test')
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
  })

  it('lists the trash at /trash?q=foo and sends no q', async () => {
    openAt('/trash?q=foo&notes=1')
    expect(await screen.findByText('In the trash')).toBeInTheDocument()
    expect(listBookmarks).toHaveBeenCalledWith({ trashed: true, cursor: undefined })
    expect(screen.getByRole('region', { name: 'Trash' })).toBeInTheDocument()
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
