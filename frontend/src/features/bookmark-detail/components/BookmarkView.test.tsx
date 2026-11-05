import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
import { listFolders } from '../../../lib/api/folders'
import { folder } from '../../../test/builders'
import { ToastProvider } from '../../../components/ui/Toast'
import { BookmarkView } from './BookmarkView'

vi.mock('../../../lib/api/bookmarks', () => ({
  getBookmark: vi.fn(),
  updateBookmark: vi.fn(),
  deleteBookmark: vi.fn(),
  restoreBookmark: vi.fn(),
}))

vi.mock('../../../lib/api/folders', () => ({ listFolders: vi.fn() }))

beforeEach(() => {
  vi.mocked(listFolders).mockReset().mockResolvedValue({ items: [] })
})

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
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/bookmarks/b-1']}>
        <ToastProvider>
          <BookmarkView id="b-1" />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await advance(0)
  return client
}

const titleInput = () => screen.getByRole('textbox', { name: 'Title' })
const noteInput = () => screen.getByRole('textbox', { name: 'Note' })

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
      expect(titleInput()).toHaveValue('<i>t</i>')
      expect(noteInput()).toHaveValue('<u>n</u>')
      expect(screen.getByRole('heading', { level: 1 }).querySelector('i')).toBeNull()
      expect(document.querySelector('.detail-page u')).toBeNull()
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

    it('shows the stored note in the note field', async () => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark({ note: 'remember this' }))
      await open()
      expect(noteInput()).toHaveValue('remember this')
    })

    it.each([null, ''])('shows an empty note field with a placeholder when the note is %j', async (note) => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark({ note }))
      await open()
      expect(noteInput()).toHaveValue('')
      expect(noteInput()).toHaveAttribute('placeholder', 'Add a note…')
      expect(screen.getByLabelText('Note')).toBe(noteInput())
    })

    describe('a trashed bookmark', () => {
      const trashed = (overrides: Partial<BookmarkDetail>) =>
        vi.mocked(getBookmark).mockResolvedValue(bookmark({ deleted_at: '2026-03-05T00:00:00Z', ...overrides }))

      it('has no field, shows the title as the heading, and the note as text', async () => {
        trashed({ note: 'remember this' })
        await open()
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('An example')
        expect(screen.getByText('remember this')).toBeInTheDocument()
      })

      it('shows no note section for a null note and the section for an empty-string note', async () => {
        trashed({ note: null })
        await open()
        expect(screen.queryByText('Note')).not.toBeInTheDocument()
        cleanup()
        trashed({ note: '' })
        await open()
        expect(screen.getByText('Note')).toBeInTheDocument()
      })

      it('shows the host name as the heading when the title is empty', async () => {
        trashed({ title: '' })
        await open()
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('www.example.com')
      })
    })
  })

  describe('title', () => {
    it('shows the title when there is one', async () => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark({ title: 'Hello' }))
      await open()
      expect(titleInput()).toHaveValue('Hello')
      expect(screen.getByRole('heading', { level: 1 })).toContainElement(titleInput())
    })

    it.each(['', '   '])('shows an empty field with the host name as placeholder when the title is %j', async (title) => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark({ title }))
      await open()
      expect(titleInput()).toHaveValue('')
      expect(titleInput()).toHaveAttribute('placeholder', 'www.example.com')
    })

    it('shows the whole URL when the title is empty and the URL cannot be parsed', async () => {
      vi.mocked(getBookmark).mockResolvedValue(bookmark({ title: '', url: 'not a url at all' }))
      await open()
      expect(titleInput()).toHaveAttribute('placeholder', 'not a url at all')
    })
  })

  describe('errors', () => {
    it('shows "Bookmark not found" with a link to / on a 404', async () => {
      vi.mocked(getBookmark).mockRejectedValue(new ApiError(404, null, null))
      await open()
      expect(screen.getByText('Bookmark not found')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Back to your bookmarks/ })).toHaveAttribute('href', '/')
    })

    it('shows "Loading…", not an error, on a 401 with no bookmark', async () => {
      vi.mocked(getBookmark).mockRejectedValue(new ApiError(401, null, null))
      await open()
      expect(screen.getByText('Loading…')).toBeInTheDocument()
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
      expect(screen.queryByText(/logged out|Log in/)).not.toBeInTheDocument()
    })

    it('replaces the 404 panel with "Loading…" when a retry answers 401', async () => {
      vi.mocked(getBookmark).mockRejectedValueOnce(new ApiError(404, null, null))
      const client = await open()
      expect(screen.getByText('Bookmark not found')).toBeInTheDocument()
      vi.mocked(getBookmark).mockRejectedValue(new ApiError(401, null, null))
      await act(async () => {
        await client.refetchQueries({ queryKey: ['bookmark', 'b-1'] })
      })
      expect(screen.getByText('Loading…')).toBeInTheDocument()
      expect(screen.queryByText('Bookmark not found')).not.toBeInTheDocument()
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
      expect(titleInput()).toHaveValue('An example')
      await advance(1000)
      expect(screen.getByText('Bookmark not found')).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument()
    })

    it('keeps the shown bookmark and shows nothing when a later poll gets a 401', async () => {
      vi.mocked(getBookmark)
        .mockResolvedValueOnce(pending())
        .mockRejectedValue(new ApiError(401, null, null))
      await open()
      await advance(1000)
      expect(titleInput()).toHaveValue('An example')
      expect(screen.queryByText(/logged out|Log in|Something went wrong|Loading…/)).not.toBeInTheDocument()
      await advance(60_000)
      expect(getBookmark).toHaveBeenCalledTimes(2)
    })

    it('keeps the bookmark and keeps polling after another failure on a later poll', async () => {
      vi.mocked(getBookmark)
        .mockResolvedValueOnce(pending())
        .mockRejectedValueOnce(new ApiError(500, null, null))
        .mockResolvedValue(bookmark({ content: 'Now it is done.' }))
      await open()
      await advance(1000)
      expect(titleInput()).toHaveValue('An example')
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

  it('shows Edit, Move and Delete for a live bookmark, and no Restore', async () => {
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
    const dialog = within(screen.getByRole('dialog', { name: 'Edit bookmark' }))
    const title = dialog.getByLabelText('Title')
    expect(title).toHaveValue('An example')
    expect(dialog.getByLabelText('Note')).toHaveValue('a note')
    fireEvent.change(title, { target: { value: 'New title' } })
    fireEvent.change(dialog.getByLabelText('Note'), { target: { value: '' } })
    await click('Save')
    await advance(0)
    expect(updateBookmark).toHaveBeenCalledExactlyOnceWith('b-1', { title: 'New title', note: null })
    expect(titleInput()).toHaveValue('New title')
    expect(noteInput()).toHaveValue('')
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

  it('a 401 from Restore keeps the page, shows nothing and does not refresh', async () => {
    server = bookmark({ deleted_at: '2026-03-05T00:00:00Z' })
    vi.mocked(restoreBookmark).mockImplementation(async () => {
      throw new ApiError(401, null, null)
    })
    await open()
    const loads = vi.mocked(getBookmark).mock.calls.length
    await click('Restore')
    await advance(0)
    expect(restoreBookmark).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('An example')
    expect(screen.queryByText(/logged out|Log in|Couldn't restore/)).not.toBeInTheDocument()
    expect(vi.mocked(getBookmark).mock.calls.length).toBe(loads)
  })

  it('shows a failed Delete as a toast and keeps the page', async () => {
    vi.mocked(deleteBookmark).mockImplementation(async () => {
      throw new TypeError('offline')
    })
    await open()
    await click('Delete')
    await advance(0)
    expect(screen.getByText("Couldn't move it to the trash.")).toBeInTheDocument()
    expect(titleInput()).toHaveValue('An example')
  })
})

describe('BookmarkView folder and move', () => {
  let server: BookmarkDetail
  const FOLDERS = [folder({ id: 'f-1', name: 'Recipes' }), folder({ id: 'f-2', name: 'Work' })]

  beforeEach(() => {
    vi.useFakeTimers()
    notifyManager.setScheduler((callback) => queueMicrotask(callback))
    server = bookmark({ folder_id: 'f-1' })
    vi.mocked(getBookmark).mockReset().mockImplementation(async () => server)
    vi.mocked(updateBookmark).mockReset()
    vi.mocked(listFolders).mockReset().mockResolvedValue({ items: FOLDERS })
  })

  afterEach(() => {
    notifyManager.setScheduler((callback) => setTimeout(callback, 0))
    vi.useRealTimers()
  })

  const factValue = () => screen.getByText('Folder').parentElement as HTMLElement

  it('shows the folder name next to a Move button', async () => {
    await open()
    expect(factValue()).toHaveTextContent('Recipes')
    expect(screen.getByRole('button', { name: 'Move' })).toBeInTheDocument()
  })

  it('shows "Top level" for a bookmark at the top, even when the folder list failed', async () => {
    server = bookmark({ folder_id: null })
    vi.mocked(listFolders).mockRejectedValue(new TypeError('Failed to fetch'))
    await open()
    expect(factValue()).toHaveTextContent('Top level')
  })

  it('shows a quiet placeholder while the folders load', async () => {
    vi.mocked(listFolders).mockReturnValue(new Promise(() => {}))
    await open()
    expect(factValue()).toHaveTextContent('Loading…')
    expect(factValue().querySelector('.detail-page__fact-quiet')).not.toBeNull()
  })

  it.each([
    ['the folder list failed', () => vi.mocked(listFolders).mockRejectedValue(new ApiError(500, null, null)), 'f-1'],
    ['the id is not in the list', () => {}, 'f-gone'],
  ])('shows "Unknown folder" when %s', async (_name, arrange, folderId) => {
    arrange()
    server = bookmark({ folder_id: folderId })
    await open()
    expect(factValue()).toHaveTextContent('Unknown folder')
  })

  it('shows a folder name as text, never HTML', async () => {
    vi.mocked(listFolders).mockResolvedValue({ items: [folder({ id: 'f-1', name: '<img src=x onerror=alert(1)>' })] })
    await open()
    expect(factValue()).toHaveTextContent('<img src=x onerror=alert(1)>')
    expect(factValue().querySelector('img')).toBeNull()
  })

  it('shows neither the Folder fact nor Move for a trashed bookmark', async () => {
    server = bookmark({ folder_id: 'f-1', deleted_at: '2026-03-05T00:00:00Z' })
    await open()
    expect(screen.queryByText('Folder')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument()
  })

  it('moves through the dialog; the page then shows the new folder', async () => {
    vi.mocked(updateBookmark).mockImplementation(async (_id, changes) => {
      server = { ...server, folder_id: changes.folder_id ?? null }
      return server
    })
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    await advance(0)
    expect(screen.getByRole('dialog', { name: 'Move bookmark' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Recipes' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Work' }))
    await advance(0)
    fireEvent.click(screen.getByRole('button', { name: /^Move$/ }))
    await advance(0)
    await advance(0)
    expect(updateBookmark).toHaveBeenCalledExactlyOnceWith('b-1', { folder_id: 'f-2' })
    expect(screen.getByText('Moved to “Work”.')).toBeInTheDocument()
    expect(factValue()).toHaveTextContent('Work')
  })

  it('replaces the page with "Bookmark not found" when the move gets a 404', async () => {
    vi.mocked(updateBookmark).mockRejectedValue(new ApiError(404, null, null))
    vi.mocked(getBookmark).mockReset().mockResolvedValueOnce(server).mockRejectedValue(new ApiError(404, null, null))
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    await advance(0)
    fireEvent.click(screen.getByRole('radio', { name: 'Work' }))
    await advance(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'Move' }).at(-1) as HTMLElement)
    await advance(0)
    await advance(0)
    expect(screen.getByText('Bookmark not found')).toBeInTheDocument()
  })

  it('keeps the page, shows nothing and does not refresh when the move gets a 401', async () => {
    vi.mocked(updateBookmark).mockRejectedValue(new ApiError(401, null, null))
    vi.mocked(getBookmark).mockReset().mockResolvedValue(server)
    await open()
    const loads = vi.mocked(getBookmark).mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    await advance(0)
    fireEvent.click(screen.getByRole('radio', { name: 'Work' }))
    await advance(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'Move' }).at(-1) as HTMLElement)
    await advance(0)
    await advance(0)
    expect(updateBookmark).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('textbox', { name: 'Title', hidden: true })).toHaveValue('An example')
    expect(screen.queryByText(/logged out|Log in|Couldn't move/)).not.toBeInTheDocument()
    expect(vi.mocked(getBookmark).mock.calls.length).toBe(loads)
  })
})

describe('BookmarkView inline edit', () => {
  // The "server": the mocked calls change it, and the page sees it only when it refetches.
  let server: BookmarkDetail
  const update = vi.mocked(updateBookmark)

  beforeEach(() => {
    vi.useFakeTimers()
    notifyManager.setScheduler((callback) => queueMicrotask(callback))
    server = bookmark({ note: 'a note' })
    vi.mocked(getBookmark).mockReset().mockImplementation(async () => server)
    update.mockReset().mockImplementation(async (_id, changes) => {
      server = {
        ...server,
        title: changes.title ?? server.title,
        note: changes.note === undefined ? server.note : changes.note,
      }
      return server
    })
  })

  afterEach(() => {
    notifyManager.setScheduler((callback) => setTimeout(callback, 0))
    vi.useRealTimers()
  })

  const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
  const leave = async (el: HTMLElement) => {
    fireEvent.blur(el)
    await advance(0)
  }
  const problem = (status: number, code: string, errors?: { field: string; code: string }[]) =>
    new ApiError(status, { type: 'x', title: 't', status, code, errors } as never, null)
  /** The status line next to a field: the live region inside the field's own wrapper. */
  const statusOf = (el: HTMLElement) => (el.closest('.detail-page__note') ?? el.closest('.detail-page__title-block'))!.querySelector('[role="status"]')!
  const pendingUpdate = () => {
    const calls: { resolve: () => void; reject: (e: unknown) => void }[] = []
    update.mockImplementation(
      (_id, changes) =>
        new Promise((resolve, reject) => {
          calls.push({
            resolve: () => {
              server = { ...server, title: changes.title ?? server.title, note: changes.note === undefined ? server.note : changes.note }
              resolve(server)
            },
            reject,
          })
        }),
    )
    return calls
  }

  describe('counters', () => {
    it('shows the note counter always, as the user types', async () => {
      server = bookmark({ note: null })
      await open()
      expect(screen.getByText('0/500')).toBeInTheDocument()
      type(noteInput(), 'abc')
      expect(screen.getByText('3/500')).toBeInTheDocument()
    })

    it('shows the title counter only while focused or over the limit', async () => {
      await open()
      expect(screen.queryByText(/\/300$/)).not.toBeInTheDocument()
      act(() => titleInput().focus())
      expect(screen.getByText('10/300')).toBeInTheDocument()
      expect(screen.getByText('10/300')).not.toHaveClass('field__meta--over')
      type(titleInput(), 'a'.repeat(301))
      fireEvent.blur(titleInput())
      expect(screen.getByText('301/300')).toHaveClass('field__meta--over')
    })

    it('counts a spaces-only note raw and never calls it over', async () => {
      await open()
      type(noteInput(), ' '.repeat(600))
      expect(screen.getByText('600/500')).not.toHaveClass('field__meta--over')
      await leave(noteInput())
      expect(update).toHaveBeenCalledExactlyOnceWith('b-1', { note: null })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('committing', () => {
    it.each([
      ['blur', async () => leave(titleInput())],
      ['Enter', async () => { fireEvent.keyDown(titleInput(), { key: 'Enter' }); await advance(0) }],
    ])('sends only the title on %s, shows the new title and no Saved. toast', async (_name, commit) => {
      await open()
      type(titleInput(), 'New title')
      await commit()
      expect(update).toHaveBeenCalledExactlyOnceWith('b-1', { title: 'New title' })
      expect(titleInput()).toHaveValue('New title')
      expect(screen.queryByText('Saved.')).not.toBeInTheDocument()
    })

    it('sends nothing for a title that only differs by spaces, and shows the stored one', async () => {
      server = bookmark({ title: 'Hello' })
      await open()
      type(titleInput(), '  Hello ')
      await leave(titleInput())
      expect(update).not.toHaveBeenCalled()
      expect(titleInput()).toHaveValue('Hello')
    })

    it('Shift+Enter in the title commits too, and Enter while composing does not', async () => {
      await open()
      type(titleInput(), 'New')
      fireEvent.keyDown(titleInput(), { key: 'Enter', isComposing: true })
      await advance(0)
      expect(update).not.toHaveBeenCalled()
      fireEvent.keyDown(titleInput(), { key: 'Enter', shiftKey: true })
      await advance(0)
      expect(update).toHaveBeenCalledExactlyOnceWith('b-1', { title: 'New' })
    })

    it('sends only the note on blur; Enter in the note sends nothing', async () => {
      await open()
      type(noteInput(), 'line one\nline two')
      fireEvent.keyDown(noteInput(), { key: 'Enter' })
      await advance(0)
      expect(update).not.toHaveBeenCalled()
      await leave(noteInput())
      expect(update).toHaveBeenCalledExactlyOnceWith('b-1', { note: 'line one\nline two' })
    })

    it.each([
      ['clearing a stored note', 'a note', '', { note: null }],
      ['a spaces-only note over a stored note', 'a note', '   ', { note: null }],
      ['an empty note over a null note', null, '', undefined],
      ['a spaces-only note over a null note', null, '  ', undefined],
      ['the same note', 'a note', 'a note', undefined],
    ])('%s', async (_name, stored, typed, body) => {
      server = bookmark({ note: stored })
      await open()
      type(noteInput(), typed)
      await leave(noteInput())
      if (body) expect(update).toHaveBeenCalledExactlyOnceWith('b-1', body)
      else expect(update).not.toHaveBeenCalled()
    })

    it('leaving the title then the note sends two calls with one field each', async () => {
      await open()
      type(titleInput(), 'T2')
      await leave(titleInput())
      type(noteInput(), 'N2')
      await leave(noteInput())
      expect(update.mock.calls).toEqual([
        ['b-1', { title: 'T2' }],
        ['b-1', { note: 'N2' }],
      ])
    })

    it('an edited note alone sends no title', async () => {
      await open()
      type(noteInput(), 'N2')
      await leave(noteInput())
      expect(update).toHaveBeenCalledExactlyOnceWith('b-1', { note: 'N2' })
    })

    it.each([
      ['title', 300, true, 'a'],
      ['title', 301, false, 'a'],
      ['title', 300, true, '😀'],
      ['note', 500, true, 'a'],
      ['note', 501, false, 'a'],
      ['note', 500, true, '😀'],
    ])('%s of %i characters (%s): sent is %s', async (field, n, sent, ch) => {
      await open()
      const el = field === 'title' ? titleInput() : noteInput()
      type(el, ch.repeat(n))
      await leave(el)
      expect(update).toHaveBeenCalledTimes(sent ? 1 : 0)
      if (!sent) {
        expect(screen.getByRole('alert')).toHaveTextContent(
          field === 'title' ? 'Title is too long (300 characters at most).' : 'Note is too long (500 characters at most).',
        )
        expect(el).toHaveValue(ch.repeat(n))
        type(el, ch.repeat(field === 'title' ? 300 : 500))
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      }
    })

    it('a second blur while the first save is in flight sends nothing, and the other field still sends', async () => {
      const calls = pendingUpdate()
      await open()
      type(titleInput(), 'T2')
      await leave(titleInput())
      await leave(titleInput())
      expect(update).toHaveBeenCalledTimes(1)
      type(noteInput(), 'N2')
      await leave(noteInput())
      expect(update.mock.calls).toEqual([
        ['b-1', { title: 'T2' }],
        ['b-1', { note: 'N2' }],
      ])
      calls.forEach((c) => c.resolve())
      await advance(0)
    })

    it('Enter then blur right after, with the first save pending, sends one request', async () => {
      pendingUpdate()
      await open()
      type(titleInput(), 'T2')
      fireEvent.keyDown(titleInput(), { key: 'Enter' })
      fireEvent.blur(titleInput())
      await advance(0)
      expect(update).toHaveBeenCalledTimes(1)
    })
  })

  describe('status and the old value', () => {
    it('says Saving… while pending, Saved for 2 seconds after, each field on its own', async () => {
      const calls = pendingUpdate()
      await open()
      type(titleInput(), 'T2')
      await leave(titleInput())
      expect(statusOf(titleInput())).toHaveTextContent('Saving…')
      expect(statusOf(noteInput())).toHaveTextContent('')
      calls[0].resolve()
      await advance(0)
      expect(statusOf(titleInput())).toHaveTextContent('Saved')
      expect(statusOf(noteInput())).toHaveTextContent('')
      await advance(1999)
      expect(statusOf(titleInput())).toHaveTextContent('Saved')
      await advance(1)
      expect(statusOf(titleInput())).toHaveTextContent('')
    })

    it('clears the Saved timer when the page unmounts', async () => {
      const client = await open()
      type(titleInput(), 'T2')
      await leave(titleInput())
      expect(statusOf(titleInput())).toHaveTextContent('Saved')
      const spy = vi.spyOn(globalThis, 'clearTimeout')
      cleanup()
      expect(spy).toHaveBeenCalled()
      client.clear()
    })

    it('shows the saved text, never the old stored one, until the refetch answers', async () => {
      await open()
      let answer: (b: BookmarkDetail) => void = () => {}
      vi.mocked(getBookmark).mockImplementation(() => new Promise((resolve) => (answer = resolve)))
      type(titleInput(), 'Saved title')
      await leave(titleInput())
      expect(titleInput()).toHaveValue('Saved title')
      await advance(0)
      expect(titleInput()).toHaveValue('Saved title')
      await act(async () => answer({ ...server, title: 'Server says' }))
      await advance(0)
      expect(titleInput()).toHaveValue('Server says')
    })

    it('releases the saved text when the refetch fails', async () => {
      await open()
      vi.mocked(getBookmark).mockRejectedValue(new ApiError(500, null, null))
      type(noteInput(), 'N2')
      await leave(noteInput())
      await advance(0)
      expect(noteInput()).toHaveValue('a note')
    })

    it('keeps later text typed after the commit and commits only it next time', async () => {
      const calls = pendingUpdate()
      await open()
      type(titleInput(), 'First')
      await leave(titleInput())
      type(titleInput(), 'Second')
      calls[0].resolve()
      await advance(0)
      expect(titleInput()).toHaveValue('Second')
      await leave(titleInput())
      expect(update.mock.calls).toEqual([
        ['b-1', { title: 'First' }],
        ['b-1', { title: 'Second' }],
      ])
      calls[1].resolve()
      await advance(0)
    })

    it('sends the previous stored value typed back while the refetch is held back', async () => {
      await open()
      vi.mocked(getBookmark).mockImplementation(() => new Promise(() => {}))
      type(titleInput(), 'Changed')
      await leave(titleInput())
      type(titleInput(), 'An example')
      await leave(titleInput())
      expect(update.mock.calls).toEqual([
        ['b-1', { title: 'Changed' }],
        ['b-1', { title: 'An example' }],
      ])
    })
  })

  describe('refetch while editing', () => {
    const pending = (title: string, note: string | null = null) =>
      bookmark({ fetch_status: 'pending', content: null, title, note })

    it('an untouched title follows the poll; a touched one keeps the typed text', async () => {
      server = pending('')
      await open()
      server = pending('Fetched title')
      await advance(1000)
      expect(titleInput()).toHaveValue('Fetched title')
      type(titleInput(), 'Mine')
      server = pending('Fetched again')
      await advance(1000)
      expect(titleInput()).toHaveValue('Mine')
    })

    it('a touched note keeps its text and its error across a poll', async () => {
      server = pending('t', null)
      await open()
      type(noteInput(), 'x'.repeat(501))
      await leave(noteInput())
      server = pending('t', 'from server')
      await advance(1000)
      expect(noteInput()).toHaveValue('x'.repeat(501))
      expect(screen.getByRole('alert')).toHaveTextContent('Note is too long')
    })

    it('an untouched note follows the poll', async () => {
      server = pending('t', null)
      await open()
      server = pending('t', 'from server')
      await advance(1000)
      expect(noteInput()).toHaveValue('from server')
    })

    it("the title's save refetch does not replace text typed into the note meanwhile", async () => {
      await open()
      type(titleInput(), 'T2')
      await leave(titleInput())
      type(noteInput(), 'typing')
      await advance(0)
      expect(noteInput()).toHaveValue('typing')
    })

    it('keeps the focus in the field across a refetch', async () => {
      server = pending('t', null)
      await open()
      act(() => noteInput().focus())
      type(noteInput(), 'typing')
      server = pending('t2', null)
      await advance(1000)
      expect(noteInput()).toHaveFocus()
    })
  })

  describe('Esc', () => {
    it('restores the baseline and removes the error, sending nothing, also on the blur after', async () => {
      await open()
      type(noteInput(), 'x'.repeat(501))
      await leave(noteInput())
      expect(screen.getByRole('alert')).toBeInTheDocument()
      fireEvent.keyDown(noteInput(), { key: 'Escape' })
      expect(noteInput()).toHaveValue('a note')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      await leave(noteInput())
      expect(update).not.toHaveBeenCalled()
    })

    it('while a save is in flight, leaves it alone: the field then shows the saved text', async () => {
      const calls = pendingUpdate()
      await open()
      type(titleInput(), 'Saved one')
      await leave(titleInput())
      fireEvent.keyDown(titleInput(), { key: 'Escape' })
      expect(titleInput()).toHaveValue('An example')
      calls[0].resolve()
      await advance(0)
      expect(titleInput()).toHaveValue('Saved one')
      await leave(titleInput())
      expect(update).toHaveBeenCalledTimes(1)
    })
  })

  describe('failures', () => {
    const network = () => new TypeError('offline')
    it.each([
      ['a 422 too_long on title', problem(422, 'validation_error', [{ field: 'title', code: 'too_long' }]), 'title', 'Title is too long (300 characters at most).'],
      ['a 422 too_long on note', problem(422, 'validation_error', [{ field: 'note', code: 'too_long' }]), 'note', 'Note is too long (500 characters at most).'],
      ['a 500', new ApiError(500, null, null), 'title', "Couldn't save your changes."],
      ['a network failure', network(), 'note', "Couldn't save your changes."],
      ['a 429 with Retry-After', new ApiError(429, null, 5), 'title', 'Too many requests. Try again in about 5 seconds.'],
      ['a 429 without it', new ApiError(429, null, null), 'note', 'Too many requests. Try again in a moment.'],
    ])('%s shows under the right field, keeps the text and retries on the next blur, with no toast', async (_name, error, field, message) => {
      await open()
      const el = field === 'title' ? titleInput() : noteInput()
      const other = field === 'title' ? noteInput() : titleInput()
      update.mockRejectedValue(error)
      type(el, 'typed')
      await leave(el)
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(message)
      expect(el.closest(field === 'title' ? '.detail-page__title-block' : '.detail-page__note')).toContainElement(alert)
      expect(other.closest(field === 'title' ? '.detail-page__note' : '.detail-page__title-block')).not.toContainElement(alert)
      expect(el).toHaveValue('typed')
      expect(document.querySelector('.toast')).toBeNull()
      await leave(el)
      expect(update).toHaveBeenCalledTimes(2)
    })

    it('a 401 shows nothing under the field and no toast', async () => {
      await open()
      update.mockRejectedValue(new ApiError(401, null, null))
      type(titleInput(), 'typed')
      await leave(titleInput())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(document.querySelector('.toast')).toBeNull()
      expect(titleInput()).toHaveValue('typed')
    })

    it('a 404 also toasts, and the page becomes "Bookmark not found" with the toast on screen', async () => {
      await open()
      update.mockRejectedValue(new ApiError(404, null, null))
      type(titleInput(), 'typed')
      vi.mocked(getBookmark).mockRejectedValue(new ApiError(404, null, null))
      await leave(titleInput())
      await advance(0)
      expect(screen.getByText('Bookmark not found')).toBeInTheDocument()
      expect(screen.getByText('This bookmark no longer exists.')).toBeInTheDocument()
    })

    it('a 409 also toasts, and the page becomes the read-only trashed view; a retried failure toasts again', async () => {
      await open()
      update.mockRejectedValue(problem(409, 'bookmark_in_trash'))
      type(titleInput(), 'typed')
      await leave(titleInput())
      expect(screen.getByText("This bookmark is in the trash and can't be edited.", { selector: '.field__error' })).toBeInTheDocument()
      await leave(titleInput())
      expect(screen.getAllByText("This bookmark is in the trash and can't be edited.", { selector: '.toast__message' })).toHaveLength(2)
    })

    it('a 409 leads to the read-only trashed view', async () => {
      await open()
      update.mockImplementation(async () => {
        server = { ...server, deleted_at: '2026-03-05T00:00:00Z' }
        throw problem(409, 'bookmark_in_trash')
      })
      type(noteInput(), 'typed')
      await leave(noteInput())
      await advance(0)
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
      expect(screen.getByText("This bookmark is in the trash and can't be edited.")).toBeInTheDocument()
    })

    it('a bookmark that becomes trashed in a refetch drops the typed text', async () => {
      server = bookmark({ fetch_status: 'pending', content: null })
      await open()
      type(noteInput(), 'typed note')
      type(titleInput(), 'typed title')
      server = { ...server, deleted_at: '2026-03-05T00:00:00Z' }
      await advance(1000)
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.queryByText('typed note')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('An example')
    })
  })

  describe('Edit button', () => {
    it('opens the dialog with the stored note and drops an over-limit draft', async () => {
      await open()
      type(noteInput(), 'x'.repeat(501))
      await leave(noteInput())
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      await advance(0)
      expect(update).not.toHaveBeenCalled()
      expect(within(screen.getByRole('dialog', { name: 'Edit bookmark' })).getByLabelText('Note')).toHaveValue('a note')
      const inline = document.querySelector('.detail-page__note textarea') as HTMLTextAreaElement
      expect(inline.value).toBe('a note')
    })

    it('sends a failed draft again (the blur is a commit) and still opens the dialog', async () => {
      await open()
      update.mockRejectedValue(new ApiError(500, null, null))
      type(noteInput(), 'draft')
      await leave(noteInput())
      expect(update).toHaveBeenCalledTimes(1)
      await leave(noteInput())
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      await advance(0)
      expect(update).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('dialog', { name: 'Edit bookmark' })).toBeInTheDocument()
    })
  })
})
