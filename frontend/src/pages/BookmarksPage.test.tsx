import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listBookmarks } from '../lib/api/bookmarks'
import { listFolders } from '../lib/api/folders'
import { bookmark, page } from '../test/builders'
import { renderApp } from '../test/wrap'
import { BookmarksPage } from './BookmarksPage'

vi.mock('../lib/api/bookmarks', () => ({ createBookmark: vi.fn(), listBookmarks: vi.fn(), getBookmark: vi.fn() }))
vi.mock('../lib/api/folders', () => ({ listFolders: vi.fn() }))

const list = vi.mocked(listBookmarks)

beforeEach(() => {
  list.mockReset().mockResolvedValue(page([bookmark({ id: 'b-1', title: 'A soup' })]))
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
