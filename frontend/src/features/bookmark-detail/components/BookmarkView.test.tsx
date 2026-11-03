import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import * as bookmarks from '../../../lib/api/bookmarks'
import type { BookmarkDetail } from '../../../lib/api/types'
import { BookmarkView } from './BookmarkView'

vi.mock('../../../lib/api/bookmarks')
const getBookmark = vi.mocked(bookmarks.getBookmark)

function detail(over: Partial<BookmarkDetail> = {}): BookmarkDetail {
  return {
    id: 'b1',
    url: 'https://example.com/page',
    title: 'A title',
    note: null,
    folder_id: null,
    favicon_url: null,
    fetch_status: 'ok',
    created_at: '2026-01-02T03:04:05Z',
    updated_at: '2026-01-02T03:04:05Z',
    deleted_at: null,
    content: 'Page body',
    ...over,
  } as BookmarkDetail
}

function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/bookmarks/b1']}>
        <BookmarkView id="b1" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getBookmark.mockReset()
})

describe('BookmarkView', () => {
  it('shows a pending bookmark with its placeholders', async () => {
    getBookmark.mockResolvedValue(detail({ title: '', fetch_status: 'pending', content: null }))
    show()
    expect(await screen.findByRole('heading', { name: 'Fetching a title…' })).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText(/Still fetching this page/)).toBeInTheDocument()
  })

  it('shows a complete bookmark with its text, link and note', async () => {
    getBookmark.mockResolvedValue(detail({ note: 'my note' }))
    show()
    expect(await screen.findByRole('heading', { name: 'A title' })).toBeInTheDocument()
    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(screen.getByText('Page body')).toBeInTheDocument()
    expect(screen.getByText('my note')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'https://example.com/page' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: /Back/ })).toHaveAttribute('href', '/')
  })

  it('omits the note when it is null', async () => {
    getBookmark.mockResolvedValue(detail())
    show()
    await screen.findByText('Page body')
    expect(screen.queryByRole('heading', { name: 'Note' })).not.toBeInTheDocument()
  })

  it('shows a failed bookmark, still with its link and Untitled', async () => {
    getBookmark.mockResolvedValue(detail({ title: '', fetch_status: 'failed', content: null }))
    show()
    expect(await screen.findByRole('heading', { name: 'Untitled' })).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText(/couldn't fetch this page's text/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'https://example.com/page' })).toBeInTheDocument()
  })

  it('says a trashed bookmark is in the trash, without a Restore button', async () => {
    getBookmark.mockResolvedValue(detail({ deleted_at: '2026-02-01T00:00:00Z' }))
    show()
    expect(await screen.findByText('In trash.')).toBeInTheDocument()
    expect(screen.getByText('Page body')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows content as literal text, never as HTML', async () => {
    getBookmark.mockResolvedValue(detail({ content: 'line one\n<b>x</b>' }))
    show()
    const body = await screen.findByText(/line one/)
    expect(body.textContent).toBe('line one\n<b>x</b>')
    expect(body.querySelector('b')).toBeNull()
  })

  it('shows Bookmark not found with a link home on a 404', async () => {
    getBookmark.mockRejectedValue(new ApiError(404, null, null))
    show()
    expect(await screen.findByText('Bookmark not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
  })

  it('shows the signed-out message on a 401', async () => {
    getBookmark.mockRejectedValue(new ApiError(401, null, null))
    show()
    expect(await screen.findByText("You're logged out. Log in to continue.")).toBeInTheDocument()
  })

  it('shows the signed-out message when a poll after the first load gets a 401', async () => {
    vi.useFakeTimers()
    try {
      getBookmark
        .mockResolvedValueOnce(detail({ fetch_status: 'pending', content: null }))
        .mockRejectedValue(new ApiError(401, null, null))
      show()
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(screen.getByText('Pending')).toBeInTheDocument()
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(getBookmark).toHaveBeenCalledTimes(2)
      expect(screen.getByText("You're logged out. Log in to continue.")).toBeInTheDocument()
      expect(screen.queryByText('Pending')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows an error state with a retry for any other failure', async () => {
    getBookmark.mockRejectedValueOnce(new ApiError(500, null, null)).mockResolvedValue(detail())
    show()
    const retry = await screen.findByRole('button', { name: 'Try again' })
    retry.click()
    expect(await screen.findByText('Page body')).toBeInTheDocument()
  })
})
