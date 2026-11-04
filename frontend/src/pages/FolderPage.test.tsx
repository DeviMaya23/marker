import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api/ApiError'
import { createBookmark, listBookmarks } from '../lib/api/bookmarks'
import { listFolders } from '../lib/api/folders'
import { bookmark, folder, page } from '../test/builders'
import { renderApp } from '../test/wrap'
import { FolderPage } from './FolderPage'

vi.mock('../lib/api/bookmarks', () => ({ createBookmark: vi.fn(), listBookmarks: vi.fn(), getBookmark: vi.fn() }))
vi.mock('../lib/api/folders', () => ({ listFolders: vi.fn() }))

const folders = vi.mocked(listFolders)
const list = vi.mocked(listBookmarks)

function open(path: string) {
  return renderApp(
    <Routes>
      <Route path="/folder/:id" element={<FolderPage />} />
      <Route path="/" element={<p>all bookmarks page</p>} />
    </Routes>,
    { path },
  )
}

const heading = () => screen.getByRole('heading', { level: 1 })

beforeEach(() => {
  folders.mockReset()
  list.mockReset()
  vi.mocked(createBookmark).mockReset()
  folders.mockResolvedValue({
    items: [folder({ id: 'f-1', name: 'Recipes' }), folder({ id: 'f-2', name: 'Travel' })],
  })
  list.mockResolvedValue(page([bookmark({ id: 'b-1', title: 'A soup' })]))
})

describe('FolderPage', () => {
  it('requests the list with the route folder id and shows the bookmarks', async () => {
    open('/folder/f-1')
    expect(await screen.findByText('A soup')).toBeInTheDocument()
    expect(list).toHaveBeenCalledWith({ trashed: false, cursor: undefined, folderId: 'f-1' })
  })

  it('shows the folder name as the heading, and no text while the folders load', async () => {
    folders.mockReturnValue(new Promise(() => {}))
    open('/folder/f-1')
    expect(heading()).toBeEmptyDOMElement()
    expect(screen.queryByText('Travel')).not.toBeInTheDocument()
  })

  it('names the folder once the folders have loaded', async () => {
    open('/folder/f-2')
    await waitFor(() => expect(heading()).toHaveTextContent('Travel'))
  })

  it('keeps the folder id in the list key and shows the paging sentinel as All bookmarks does', async () => {
    list.mockResolvedValueOnce(page([bookmark({ id: 'b-1', title: 'First' })], 'c1'))
    list.mockResolvedValueOnce(page([bookmark({ id: 'b-2', title: 'Second' })]))
    const { client } = open('/folder/f-1')
    await screen.findByText('First')
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    expect(client.getQueryCache().findAll({ queryKey: ['bookmark-list'] })[0]?.queryKey).toEqual([
      'bookmark-list',
      { trashed: false, folderId: 'f-1' },
    ])
    expect(screen.getByTestId('list-sentinel')).toBeInTheDocument()
  })

  it('shows the empty text, pointing at the add field above', async () => {
    list.mockResolvedValue(page([]))
    open('/folder/f-1')
    expect(await screen.findByText('This folder is empty.')).toBeInTheDocument()
    expect(screen.getByText('Save a bookmark here with the field above.')).toBeInTheDocument()
    expect(screen.getByLabelText('Link to save')).toBeInTheDocument()
  })

  it('shows "This folder doesn\'t exist." with a link back when the id is not in the loaded list, and no list', async () => {
    open('/folder/nope')
    expect(await screen.findByText("This folder doesn't exist.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to all bookmarks', description: '' })).toHaveAttribute('href', '/')
    expect(screen.queryByLabelText('Link to save')).not.toBeInTheDocument()
    expect(screen.queryByText('A soup')).not.toBeInTheDocument()
  })

  it('shows the same message when the list answers 404', async () => {
    folders.mockReturnValue(new Promise(() => {}))
    list.mockRejectedValue(new ApiError(404, null, null))
    open('/folder/f-1')
    expect(await screen.findByText("This folder doesn't exist.")).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Back to all bookmarks' }).length).toBeGreaterThan(0)
  })

  it('shows the signed-out message on a 401', async () => {
    list.mockRejectedValue(new ApiError(401, null, null))
    folders.mockRejectedValue(new ApiError(401, null, null))
    open('/folder/f-1')
    expect((await screen.findAllByText("You're logged out. Log in to continue.")).length).toBeGreaterThan(0)
  })

  it('saves from the add field into this folder, and refreshes the list', async () => {
    vi.mocked(createBookmark).mockResolvedValue(bookmark({ id: 'new' }))
    const user = userEvent.setup()
    open('/folder/f-2')
    await screen.findByText('A soup')
    await user.type(screen.getByLabelText('Link to save'), 'https://a.test')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(createBookmark).toHaveBeenCalledExactlyOnceWith({ url: 'https://a.test', folder_id: 'f-2' }),
    )
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  })
})
