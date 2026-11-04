import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import {
  deleteBookmark,
  getBookmark,
  restoreBookmark,
  updateBookmark,
  type BookmarkDetail,
} from '../../../lib/api/bookmarks'
import { ToastProvider } from '../../../components/ui/Toast'
import { BookmarkView } from './BookmarkView'

vi.mock('../../../lib/api/bookmarks', () => ({
  getBookmark: vi.fn(),
  updateBookmark: vi.fn(),
  deleteBookmark: vi.fn(),
  restoreBookmark: vi.fn(),
}))

function bookmark(overrides: Partial<BookmarkDetail> = {}): BookmarkDetail {
  return {
    id: 'b-1',
    url: 'https://www.example.com/a',
    title: 'An example',
    note: null,
    folder_id: null,
    favicon_url: null,
    fetch_status: 'ok',
    created_at: '2026-03-04T10:30:00Z',
    updated_at: '2026-03-04T10:30:00Z',
    deleted_at: null,
    content: 'The page text.',
    ...overrides,
  }
}

async function open() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/bookmarks/b-1']}>
        <ToastProvider>
          <BookmarkView id="b-1" />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await advance(0)
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('BookmarkView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    notifyManager.setScheduler((callback) => queueMicrotask(callback))
    vi.mocked(getBookmark).mockReset()
  })

  afterEach(() => {
    notifyManager.setScheduler((callback) => setTimeout(callback, 0))
    vi.useRealTimers()
  })

  describe('fetch states', () => {
    it('explains a pending fetch and shows the pending chip', async () => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark({ fetch_status: 'pending', content: null }))
      await open()
      expect(screen.getByText(/Still fetching this page/)).toBeInTheDocument()
      expect(screen.getByText('Fetching…')).toBeInTheDocument()
    })

    it('shows the page text and the complete chip when the fetch is ok', async () => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark())
      await open()
      expect(screen.getByText('The page text.')).toBeInTheDocument()
      expect(screen.getByText('Complete')).toBeInTheDocument()
    })

    it('explains a failed fetch, says the link still works, and shows the failed chip', async () => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark({ fetch_status: 'failed', content: null }))
      await open()
      expect(screen.getByText(/couldn't fetch this page's text/)).toBeInTheDocument()
      expect(screen.getByText(/link above still works/)).toBeInTheDocument()
      expect(screen.getByText('Fetch failed')).toBeInTheDocument()
    })

    it('shows a trashed bookmark read-only, with an In trash banner and a Restore button', async () => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark({ deleted_at: '2026-03-05T00:00:00Z' }))
      await open()
      expect(document.querySelector('.banner--trashed')).toHaveTextContent(
        'In trash. This bookmark is read-only. Restore it to edit it.',
      )
      expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
      expect(screen.getByText('The page text.')).toBeInTheDocument()
    })

    it('has no banner for a live bookmark', async () => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark())
      await open()
      expect(screen.queryByText(/In trash/)).not.toBeInTheDocument()
    })
  })

  describe('content is text', () => {
    it('shows markup in the page text literally and keeps its line breaks', async () => {
      const content = 'Line one <b>x</b>\nLine two <img src=x onerror=alert(1)>'
      vi.mocked(getBookmark).mockResolvedValue(bookmark({ content }))
      await open()
      const body = document.querySelector('.detail-page__content-body') as HTMLElement
      expect(body.textContent).toBe(content)
      expect(body.querySelector('b, img')).toBeNull()
    })

    it('shows markup in the title and the note literally', async () => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark({ title: '<i>t</i>', note: '<u>n</u>' }))
      await open()
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('<i>t</i>')
      expect(screen.getByText('<u>n</u>')).toBeInTheDocument()
    })
  })

  describe('header and facts', () => {
    it('links the saved URL to a new tab with noopener noreferrer, and links back to /', async () => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark())
      await open()
      const link = screen.getByRole('link', { name: 'https://www.example.com/a' })
      expect(link).toHaveAttribute('href', 'https://www.example.com/a')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(screen.getByRole('link', { name: 'Open original link' })).toHaveAttribute(
        'rel',
        'noopener noreferrer',
      )
      expect(screen.getByRole('link', { name: /Back/ })).toHaveAttribute('href', '/')
    })

    it('shows the note only when it is not null', async () => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark({ note: 'remember this' }))
      await open()
      expect(screen.getByText('remember this')).toBeInTheDocument()
    })

    it('has no Note section when the note is null, and no folder', async () => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark({ note: null }))
      await open()
      expect(screen.queryByText('Note')).not.toBeInTheDocument()
      expect(screen.queryByText('Folder')).not.toBeInTheDocument()
    })

    it('keeps an empty-string note as a note', async () => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark({ note: '' }))
      await open()
      expect(screen.getByText('Note')).toBeInTheDocument()
    })
  })

  describe('title', () => {
    it('shows the title when there is one', async () => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark({ title: 'Hello' }))
      await open()
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello')
    })

    it('shows the host name of the URL while the title is empty', async () => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark({ title: '' }))
      await open()
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('www.example.com')
    })

    it('shows the whole URL when the title is empty and the URL cannot be parsed', async () => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark({ title: '', url: 'not a url at all' }))
      await open()
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('not a url at all')
    })
  })

  describe('errors', () => {
    it('shows "Bookmark not found" with a link to / on a 404', async () => {
      vi.mocked(getBookmark).mockRejectedValue(new ApiError(404, null, null))
      await open()
      expect(screen.getByText('Bookmark not found')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Back to your bookmarks/ })).toHaveAttribute('href', '/')
    })

    it('shows the signed-out message on a 401', async () => {
      vi.mocked(getBookmark).mockRejectedValue(new ApiError(401, null, null))
      await open()
      expect(screen.getByText("You're logged out. Log in to continue.")).toBeInTheDocument()
    })

    it('shows the error state with a retry button on any other failure, and retry loads the bookmark', async () => {
      vi.mocked(getBookmark)
        .mockRejectedValueOnce(new ApiError(500, null, null))
        .mockResolvedValue(bookmark())
      await open()
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      await act(async () => screen.getByRole('button', { name: 'Try again' }).click())
      await advance(0)
      expect(screen.getByText('The page text.')).toBeInTheDocument()
    })

    it('treats a network failure like any other failure', async () => {
      vi.mocked(getBookmark).mockRejectedValue(new TypeError('Failed to fetch'))
      await open()
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    })
  })

  describe('later polls', () => {
    const pending = () => bookmark({ fetch_status: 'pending', content: null })

    it('replaces the shown bookmark with "Bookmark not found" when a later poll gets a 404', async () => {
      vi.mocked(getBookmark)
        .mockResolvedValueOnce(pending())
        .mockRejectedValue(new ApiError(404, null, null))
      await open()
      expect(screen.getByText('An example')).toBeInTheDocument()
      await advance(1000)
      expect(screen.getByText('Bookmark not found')).toBeInTheDocument()
      expect(screen.queryByText('An example')).not.toBeInTheDocument()
    })

    it('replaces the shown bookmark with the signed-out message when a later poll gets a 401', async () => {
      vi.mocked(getBookmark)
        .mockResolvedValueOnce(pending())
        .mockRejectedValue(new ApiError(401, null, null))
      await open()
      await advance(1000)
      expect(screen.getByText("You're logged out. Log in to continue.")).toBeInTheDocument()
      expect(screen.queryByText('An example')).not.toBeInTheDocument()
    })

    it('keeps the bookmark and keeps polling after another failure on a later poll', async () => {
      vi.mocked(getBookmark)
        .mockResolvedValueOnce(pending())
        .mockRejectedValueOnce(new ApiError(500, null, null))
        .mockResolvedValue(bookmark({ content: 'Now it is done.' }))
      await open()
      await advance(1000)
      expect(screen.getByText('An example')).toBeInTheDocument()
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
      await advance(1000)
      expect(screen.getByText('Now it is done.')).toBeInTheDocument()
    })

    it('updates from pending to the finished text without a reload', async () => {
      vi.mocked(getBookmark)
        .mockResolvedValueOnce(pending())
        .mockResolvedValue(bookmark({ content: 'Fetched.' }))
      await open()
      expect(screen.getByText(/Still fetching/)).toBeInTheDocument()
      await advance(1000)
      expect(screen.getByText('Fetched.')).toBeInTheDocument()
    })
  })
})

describe('BookmarkView actions', () => {
  // The "server": the mocked calls change it, and the page sees it only when it refetches.
  let server: BookmarkDetail

  beforeEach(() => {
    vi.useFakeTimers()
    notifyManager.setScheduler((callback) => queueMicrotask(callback))
    server = bookmark({ note: 'a note' })
    vi.mocked(getBookmark).mockReset().mockImplementation(async () => server)
    vi.mocked(updateBookmark).mockReset()
    vi.mocked(deleteBookmark).mockReset()
    vi.mocked(restoreBookmark).mockReset()
  })

  afterEach(() => {
    notifyManager.setScheduler((callback) => setTimeout(callback, 0))
    vi.useRealTimers()
  })

  const click = async (name: string) => {
    fireEvent.click(screen.getByRole('button', { name }))
    await advance(0)
  }

  it('shows Edit and Delete for a live bookmark, and no Restore', async () => {
    await open()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument()
    expect(screen.queryByText(/move to/i)).not.toBeInTheDocument()
  })

  it('edits through the dialog prefilled from the bookmark; the page then shows the new title, and a cleared note disappears', async () => {
    vi.mocked(updateBookmark).mockImplementation(async (_id, changes) => {
      server = { ...server, title: changes.title ?? server.title, note: changes.note === undefined ? server.note : changes.note }
      return server
    })
    await open()
    await click('Edit')
    const title = screen.getByLabelText('Title')
    expect(title).toHaveValue('An example')
    expect(screen.getByLabelText('Note')).toHaveValue('a note')
    fireEvent.change(title, { target: { value: 'New title' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: '' } })
    await click('Save')
    await advance(0)
    expect(updateBookmark).toHaveBeenCalledExactlyOnceWith('b-1', { title: 'New title', note: null })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New title')
    expect(screen.queryByText('a note')).not.toBeInTheDocument()
    expect(screen.queryByText('Note')).not.toBeInTheDocument()
    expect(screen.getByText('Saved.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Edit bookmark' })).not.toBeInTheDocument()
  })

  it('deletes: refreshes into the trashed view and toasts without an Undo', async () => {
    vi.mocked(deleteBookmark).mockImplementation(async () => {
      server = { ...server, deleted_at: '2026-03-05T00:00:00Z' }
    })
    await open()
    await click('Delete')
    await advance(0)
    expect(deleteBookmark).toHaveBeenCalledExactlyOnceWith('b-1')
    expect(screen.getByText('Moved to trash.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('restores a trashed bookmark: refreshes into the live view and toasts', async () => {
    server = bookmark({ deleted_at: '2026-03-05T00:00:00Z' })
    vi.mocked(restoreBookmark).mockImplementation(async () => {
      server = { ...server, deleted_at: null }
      return server
    })
    await open()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    await click('Restore')
    await advance(0)
    expect(restoreBookmark).toHaveBeenCalledExactlyOnceWith('b-1')
    expect(screen.getByText('Restored to the top level.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument()
  })

  it('disables Delete while its request is in flight, and sends once', async () => {
    let finish: () => void = () => {}
    vi.mocked(deleteBookmark).mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await advance(0)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(deleteBookmark).toHaveBeenCalledTimes(1)
    finish()
    await advance(0)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
  })

  it('disables Restore while its request is in flight', async () => {
    server = bookmark({ deleted_at: '2026-03-05T00:00:00Z' })
    vi.mocked(restoreBookmark).mockImplementation(() => new Promise(() => {}))
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await advance(0)
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled()
    expect(restoreBookmark).toHaveBeenCalledTimes(1)
  })

  it('a 404 from Delete replaces the page as loading it would', async () => {
    vi.mocked(deleteBookmark).mockImplementation(async () => {
      throw new ApiError(404, null, null)
    })
    await open()
    // After the failed delete the page is refetched, and the bookmark is gone.
    vi.mocked(getBookmark).mockRejectedValue(new ApiError(404, null, null))
    await click('Delete')
    await advance(0)
    expect(screen.getByText('Bookmark not found')).toBeInTheDocument()
    expect(screen.getByText('That bookmark no longer exists.')).toBeInTheDocument()
  })

  it('a 401 from Restore replaces the page with the signed-out message', async () => {
    server = bookmark({ deleted_at: '2026-03-05T00:00:00Z' })
    vi.mocked(restoreBookmark).mockImplementation(async () => {
      throw new ApiError(401, null, null)
    })
    await open()
    vi.mocked(getBookmark).mockRejectedValue(new ApiError(401, null, null))
    await click('Restore')
    await advance(0)
    expect(screen.getAllByText("You're logged out. Log in to continue.").length).toBeGreaterThan(0)
    expect(screen.queryByText('An example')).not.toBeInTheDocument()
  })

  it('shows a failed Delete as a toast and keeps the page', async () => {
    vi.mocked(deleteBookmark).mockImplementation(async () => {
      throw new TypeError('offline')
    })
    await open()
    await click('Delete')
    await advance(0)
    expect(screen.getByText("Couldn't move it to the trash.")).toBeInTheDocument()
    expect(screen.getByText('An example')).toBeInTheDocument()
  })
})
