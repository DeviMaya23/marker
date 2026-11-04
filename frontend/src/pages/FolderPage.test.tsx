import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api/ApiError'
import { createBookmark, listBookmarks } from '../lib/api/bookmarks'
import { listFolders } from '../lib/api/folders'
import { getSyncVersion } from '../lib/api/sync'
import { SYNC_POLL_MS } from '../app-shell/useSyncPoll'
import { bookmark, folder, page } from '../test/builders'
import { renderApp } from '../test/wrap'
import { FolderPage } from './FolderPage'

vi.mock('../lib/api/bookmarks', () => ({ createBookmark: vi.fn(), listBookmarks: vi.fn(), getBookmark: vi.fn() }))
vi.mock('../lib/api/folders', () => ({ listFolders: vi.fn() }))
vi.mock('../lib/api/sync', () => ({ getSyncVersion: vi.fn() }))

const folders = vi.mocked(listFolders)
const list = vi.mocked(listBookmarks)
const sync = vi.mocked(getSyncVersion)

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
  sync.mockReset().mockResolvedValue({ version: 0 })
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

describe('FolderPage moving between folders', () => {
  const addField = () => screen.getByLabelText('Link to save')
  const goToTravel = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('link', { name: /Travel/ }))
    await waitFor(() => expect(heading()).toHaveTextContent('Travel'))
  }
  const openWithSidebar = () =>
    renderApp(
      <Routes>
        <Route path="/folder/:id" element={<FolderPage />} />
      </Routes>,
      { path: '/folder/f-1' },
    )

  it('clears the add field when moving to another folder', async () => {
    const user = userEvent.setup()
    openWithSidebar()
    await user.type(addField(), 'https://a.test')
    await goToTravel(user)
    expect(addField()).toHaveValue('')
  })

  it('drops a shown save failure when moving to another folder', async () => {
    vi.mocked(createBookmark).mockRejectedValue(new ApiError(500, null, null))
    const user = userEvent.setup()
    openWithSidebar()
    await user.type(addField(), 'https://a.test')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('alert')
    await goToTravel(user)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('saves into the new folder after moving, never into the old one', async () => {
    vi.mocked(createBookmark).mockResolvedValue(bookmark({ id: 'new' }))
    const user = userEvent.setup()
    openWithSidebar()
    await user.type(addField(), 'https://old.test')
    await goToTravel(user)
    await user.type(addField(), 'https://new.test')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(createBookmark).toHaveBeenCalledTimes(1))
    expect(createBookmark).toHaveBeenCalledWith({ url: 'https://new.test', folder_id: 'f-2' })
    expect(vi.mocked(createBookmark).mock.calls.some(([r]) => r.folder_id === 'f-1')).toBe(false)
  })

  it('starts empty on every move, including back to a folder already visited', async () => {
    const user = userEvent.setup()
    openWithSidebar()
    await user.type(addField(), 'https://one.test')
    await goToTravel(user)
    expect(addField()).toHaveValue('')
    await user.type(addField(), 'https://two.test')
    await user.click(await screen.findByRole('link', { name: /Recipes/ }))
    await waitFor(() => expect(heading()).toHaveTextContent('Recipes'))
    expect(addField()).toHaveValue('')
    await user.type(addField(), 'https://three.test')
    await goToTravel(user)
    expect(addField()).toHaveValue('')
  })

  it('keeps the typed text when only the search changes', async () => {
    const user = userEvent.setup()
    openWithSidebar()
    await user.type(addField(), 'https://a.test')
    await user.type(screen.getByRole('searchbox', { name: 'Search bookmarks' }), 'soup{Enter}')
    await waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({ q: 'soup', folderId: 'f-1' })))
    expect(addField()).toHaveValue('https://a.test')
  })

  it('shows a fresh form on the new folder while a save for the old one is in flight', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    let finish: () => void = () => {}
    vi.mocked(createBookmark).mockImplementation(
      () => new Promise((resolve) => (finish = () => resolve(bookmark({ id: 'late' })))),
    )
    const user = userEvent.setup()
    openWithSidebar()
    await user.type(addField(), 'https://a.test')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('button', { name: 'Saving…' })
    await goToTravel(user)
    expect(addField()).not.toHaveAttribute('readonly')
    expect(addField()).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    const calls = list.mock.calls.length
    await act(async () => finish())
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(calls))
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})

describe('FolderPage search bar', () => {
  const bar = () => screen.queryByRole('search')

  it('shows the bar with the generic folder label while the folders load', () => {
    folders.mockReturnValue(new Promise(() => {}))
    open('/folder/f-1')
    expect(bar()).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'This folder & subfolders' })).toBeChecked()
  })

  it('shows the bar with the generic label when loading the folders failed', async () => {
    folders.mockRejectedValue(new ApiError(500, null, null))
    open('/folder/f-1')
    await screen.findByText('A soup')
    await waitFor(() => expect(folders).toHaveBeenCalled())
    expect(bar()).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'This folder & subfolders' })).toBeChecked()
  })

  it('names the folder in the scope control once the folders have loaded', async () => {
    open('/folder/f-1')
    expect(await screen.findByRole('radio', { name: '“Recipes” & subfolders' })).toBeChecked()
  })

  it('keeps the bar above the notFound panel when the list answers 404 but the folder is still listed', async () => {
    list.mockRejectedValue(new ApiError(404, null, null))
    open('/folder/f-1')
    expect(await screen.findByText("This folder doesn't exist.")).toBeInTheDocument()
    expect(bar()).toBeInTheDocument()
  })

  it('has no bar when the folders have loaded without this folder', async () => {
    open('/folder/nope')
    expect(await screen.findByText("This folder doesn't exist.")).toBeInTheDocument()
    expect(bar()).not.toBeInTheDocument()
  })

  it('keeps the add field, and searches this folder from the URL', async () => {
    list.mockResolvedValue(page([bookmark({ id: 'b-9', title: 'A match' })]))
    open('/folder/f-1?q=soup')
    expect(await screen.findByText('A match')).toBeInTheDocument()
    expect(list).toHaveBeenCalledWith({ trashed: false, cursor: undefined, folderId: 'f-1', q: 'soup' })
    expect(screen.getByLabelText('Link to save')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search bookmarks' })).toHaveValue('soup')
  })

  it('shows the no-match panel instead of "This folder is empty." during a search', async () => {
    list.mockResolvedValue(page([]))
    open('/folder/f-1?q=soup')
    expect(await screen.findByText('No bookmarks match “soup”.')).toBeInTheDocument()
    expect(screen.queryByText('This folder is empty.')).not.toBeInTheDocument()
  })
})


describe('FolderPage sync', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
  // 1 ms more lets the query's batched notification reach the component.
  const tick = async (ms: number) => {
    await advance(ms)
    await advance(1)
  }

  it('refetches the folders and the list on a version change, and shows the missing panel when the folder is gone', async () => {
    sync.mockReset().mockResolvedValueOnce({ version: 1 }).mockResolvedValue({ version: 2 })
    open('/folder/f-1')
    await tick(0)
    expect(screen.getByText('A soup')).toBeInTheDocument()
    expect(folders).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledTimes(1)
    folders.mockResolvedValue({ items: [folder({ id: 'f-2', name: 'Travel' })] })
    await tick(SYNC_POLL_MS)
    expect(folders).toHaveBeenCalledTimes(2)
    expect(list).toHaveBeenCalledTimes(2)
    expect(list.mock.calls[1]).toEqual(list.mock.calls[0])
    expect(list).toHaveBeenLastCalledWith({ trashed: false, cursor: undefined, folderId: 'f-1' })
    expect(screen.getByText("This folder doesn't exist.")).toBeInTheDocument()
  })
})
