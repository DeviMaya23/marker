import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listBookmarks } from '../lib/api/bookmarks'
import { ApiError } from '../lib/api/ApiError'
import { listFolders } from '../lib/api/folders'
import { getSyncVersion } from '../lib/api/sync'
import { SYNC_POLL_MS } from '../app-shell/useSyncPoll'
import { bookmark, page } from '../test/builders'
import { renderApp } from '../test/wrap'
import { BookmarksPage } from './BookmarksPage'

vi.mock('../lib/api/bookmarks', () => ({ createBookmark: vi.fn(), listBookmarks: vi.fn(), getBookmark: vi.fn() }))
vi.mock('../lib/api/folders', () => ({ listFolders: vi.fn() }))
vi.mock('../lib/api/sync', () => ({ getSyncVersion: vi.fn() }))

const list = vi.mocked(listBookmarks)
const sync = vi.mocked(getSyncVersion)

beforeEach(() => {
  list.mockReset().mockResolvedValue(page([bookmark({ id: 'b-1', title: 'A soup' })]))
  sync.mockReset().mockResolvedValue({ version: 0 })
  vi.mocked(listFolders).mockReset().mockResolvedValue({ items: [] })
})

describe('BookmarksPage', () => {
  it('has the search bar above the add field, and the plain list with no search', async () => {
    renderApp(<BookmarksPage />)
    expect(await screen.findByText('A soup')).toBeInTheDocument()
    const bar = screen.getByRole('search')
    const add = screen.getByLabelText('Link to save')
    expect(bar.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(list).toHaveBeenCalledWith({ trashed: false, cursor: undefined })
    expect(screen.getByRole('region', { name: 'Bookmarks' })).toBeInTheDocument()
  })

  it('searches everything from ?q= and keeps the add field', async () => {
    renderApp(<BookmarksPage />, { path: '/?q=soup&notes=1' })
    expect(await screen.findByText('A soup')).toBeInTheDocument()
    expect(list).toHaveBeenCalledWith({ trashed: false, cursor: undefined, q: 'soup', includeNotes: true })
    expect(screen.getByLabelText('Link to save')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search bookmarks' })).toHaveValue('soup')
    expect(screen.getByRole('region', { name: 'Search results' })).toBeInTheDocument()
  })
})

describe('BookmarksPage sync', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
  // 1 ms more lets the query's batched notification reach the component.
  const tick = async (ms: number) => {
    await advance(ms)
    await advance(1)
  }

  it('refetches the list with the same arguments on a version change, keeping the rows meanwhile', async () => {
    sync.mockReset().mockResolvedValueOnce({ version: 1 }).mockResolvedValue({ version: 2 })
    renderApp(<BookmarksPage />)
    await tick(0)
    expect(screen.getByText('A soup')).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(1)
    let resolve: (p: ReturnType<typeof page>) => void = () => {}
    list.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    await tick(SYNC_POLL_MS)
    expect(list).toHaveBeenCalledTimes(2)
    expect(list.mock.calls[1]).toEqual(list.mock.calls[0])
    expect(screen.getByText('A soup')).toBeInTheDocument()
    expect(screen.queryByTestId('skeleton-row')).not.toBeInTheDocument()
    resolve(page([bookmark({ id: 'b-2', title: 'A stew' })]))
    await tick(0)
    expect(screen.getByText('A stew')).toBeInTheDocument()
    expect(screen.queryByText('A soup')).not.toBeInTheDocument()
  })

  it('stops polling on a 401 from the poll and shows no login text while the list loads', async () => {
    sync.mockReset().mockRejectedValue(new ApiError(401, null, null))
    list.mockReset().mockRejectedValue(new ApiError(401, null, null))
    renderApp(<BookmarksPage />)
    await tick(0)
    await tick(0)
    expect(sync).toHaveBeenCalledTimes(1)
    await tick(SYNC_POLL_MS * 3)
    expect(sync).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/You're logged out/)).not.toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('skeleton-row').length).toBeGreaterThan(0)
  })
})
