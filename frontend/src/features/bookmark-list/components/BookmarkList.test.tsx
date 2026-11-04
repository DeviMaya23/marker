import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import { deleteBookmark, listBookmarks, updateBookmark } from '../../../lib/api/bookmarks'
import { listFolders } from '../../../lib/api/folders'
import { BOOKMARK_LIST_KEY } from '../../../lib/bookmarks/queryKeys'
import { ToastProvider } from '../../../components/ui/Toast'
import { bookmark, folder, page } from '../../../test/builders'
import { BookmarkList } from './BookmarkList'

vi.mock('../../../lib/api/bookmarks', () => ({ listBookmarks: vi.fn(), deleteBookmark: vi.fn(), updateBookmark: vi.fn() }))
vi.mock('../../../lib/api/folders', () => ({ listFolders: vi.fn() }))

const list = vi.mocked(listBookmarks)

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void
let observers: { callback: Callback; disconnect: ReturnType<typeof vi.fn> }[]

function stubObserver() {
  observers = []
  class FakeObserver {
    disconnect = vi.fn()
    constructor(callback: Callback) {
      observers.push({ callback, disconnect: this.disconnect })
    }
    observe = vi.fn()
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver)
}

/** The sentinel became visible. */
function scrollToEnd() {
  act(() => observers[observers.length - 1].callback([{ isIntersecting: true }]))
}

function renderList(trashed = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToastProvider>
          <BookmarkList trashed={trashed} />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const cursors = () => list.mock.calls.map(([args]) => args?.cursor)
const titles = () => screen.getAllByRole('link').map((a) => a.querySelector('.bookmark-row__title')?.textContent)

beforeEach(() => {
  list.mockReset()
  vi.mocked(listFolders).mockReset().mockResolvedValue({ items: [folder({ id: 'f-1', name: 'Recipes' })] })
  stubObserver()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BookmarkList (live list)', () => {
  it('shows rows in the order given', async () => {
    list.mockResolvedValue(page([bookmark({ id: 'b', title: 'Second' }), bookmark({ id: 'a', title: 'First' })]))
    renderList()
    await screen.findByText('Second')
    expect(titles()).toEqual(['Second', 'First'])
  })

  it('links each row to its bookmark page', async () => {
    list.mockResolvedValue(page([bookmark({ id: 'x-1', title: 'One' })]))
    renderList()
    expect(await screen.findByRole('link', { name: /One/ })).toHaveAttribute('href', '/bookmarks/x-1')
  })

  it.each([
    ['an empty title', '', 'https://www.example.com/a', 'www.example.com'],
    ['a title of only spaces', '   ', 'https://www.example.com/a', 'www.example.com'],
    ['an empty title and an unparsable URL', '', 'not a url', 'not a url'],
    ['a title containing markup', '<b>x</b>', 'https://a.test', '<b>x</b>'],
  ])('shows the right title for %s', async (_name, title, url, shown) => {
    list.mockResolvedValue(page([bookmark({ title, url })]))
    renderList()
    await waitFor(() => expect(titles()).toEqual([shown]))
    expect(document.querySelector('.bookmark-row__title b')).toBeNull()
  })

  it('shows the host and the date in the meta line', async () => {
    list.mockResolvedValue(page([bookmark({ url: 'https://www.example.com/a' })]))
    renderList()
    const meta = (await screen.findByRole('link')).querySelector('.bookmark-row__meta-line')
    expect(meta).toHaveTextContent(/^www\.example\.com·\S/)
  })

  it.each([
    ['pending', 'Fetching…'],
    ['failed', 'Fetch failed'],
  ] as const)('shows the %s chip', async (status, text) => {
    list.mockResolvedValue(page([bookmark({ fetch_status: status })]))
    renderList()
    expect(await screen.findByText(text)).toBeInTheDocument()
  })

  it('shows no chip for an ok bookmark', async () => {
    list.mockResolvedValue(page([bookmark({ fetch_status: 'ok' })]))
    renderList()
    await screen.findByRole('link')
    expect(document.querySelector('.status-chip')).toBeNull()
  })

  it('falls back to the tile when favicon_url is null, and uses the image otherwise', async () => {
    list.mockResolvedValue(
      page([bookmark({ id: 'a', favicon_url: null }), bookmark({ id: 'b', favicon_url: '/api/v1/favicons/b' })]),
    )
    renderList()
    await screen.findAllByRole('link')
    expect(screen.getAllByTestId('favicon-tile')).toHaveLength(1)
    expect(document.querySelector('img.favicon')).toHaveAttribute('src', '/api/v1/favicons/b')
  })

  it('shows six skeleton rows and aria-busy while the first page loads', () => {
    list.mockReturnValue(new Promise(() => {}))
    renderList()
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(6)
    expect(screen.getByRole('region', { name: 'Bookmarks' })).toHaveAttribute('aria-busy', 'true')
  })

  it('shows the empty library for an empty first page', async () => {
    list.mockResolvedValue(page([]))
    renderList()
    expect(await screen.findByText('No bookmarks yet')).toBeInTheDocument()
    expect(screen.getByText('Paste a URL above to save your first link.')).toBeInTheDocument()
    expect(screen.queryByTestId('skeleton-row')).not.toBeInTheDocument()
  })

  it('pages through the cursors and stops at a null cursor', async () => {
    list
      .mockResolvedValueOnce(page([bookmark({ id: 'a' })], 'c1'))
      .mockResolvedValueOnce(page([bookmark({ id: 'b' })], 'c2'))
      .mockResolvedValueOnce(page([bookmark({ id: 'c' })], null))
    renderList()
    await screen.findByText('Title a')
    expect(cursors()).toEqual([undefined])

    scrollToEnd()
    await screen.findByText('Title b')
    scrollToEnd()
    await screen.findByText('Title c')
    expect(cursors()).toEqual([undefined, 'c1', 'c2'])
    expect(screen.getByRole('region', { name: 'Bookmarks' })).toHaveAttribute('aria-busy', 'false')

    await waitFor(() => expect(screen.queryByTestId('list-sentinel')).not.toBeInTheDocument())
    expect(list).toHaveBeenCalledTimes(3)
  })

  it('shows two skeleton rows below the rows while the next page loads, and makes one request', async () => {
    list.mockResolvedValueOnce(page([bookmark({ id: 'a' })], 'c1'))
    list.mockReturnValueOnce(new Promise(() => {}))
    renderList()
    await screen.findByText('Title a')

    scrollToEnd()
    await waitFor(() => expect(screen.getAllByTestId('skeleton-row')).toHaveLength(2))
    scrollToEnd()
    scrollToEnd()
    expect(list).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Title a')).toBeInTheDocument()
  })

  it('keeps paging past an empty page that still has a cursor', async () => {
    list.mockResolvedValueOnce(page([], 'c1')).mockResolvedValueOnce(page([bookmark({ id: 'a' })]))
    renderList()
    await waitFor(() => expect(screen.getByTestId('list-sentinel')).toBeInTheDocument())
    expect(screen.queryByText('No bookmarks yet')).not.toBeInTheDocument()
    scrollToEnd()
    await screen.findByText('Title a')
  })

  it('shows a first-page error, and Try again requests the first page again', async () => {
    list.mockRejectedValueOnce(new ApiError(500, null, null))
    list.mockResolvedValueOnce(page([bookmark({ title: 'Back' })]))
    renderList()
    expect(await screen.findByText("Couldn't load your bookmarks.")).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Back')).toBeInTheDocument()
    expect(cursors()).toEqual([undefined, undefined])
  })

  it('treats a 429 as an ordinary error', async () => {
    list.mockRejectedValueOnce(new ApiError(429, null, 5))
    renderList()
    expect(await screen.findByText("Couldn't load your bookmarks.")).toBeInTheDocument()
  })

  it('keeps the rows on a later-page error, and its Try again asks for the same cursor', async () => {
    list
      .mockResolvedValueOnce(page([bookmark({ id: 'a' })], 'c1'))
      .mockRejectedValueOnce(new ApiError(500, null, null))
      .mockResolvedValueOnce(page([bookmark({ id: 'b' })]))
    renderList()
    await screen.findByText('Title a')
    scrollToEnd()
    expect(await screen.findByText("Couldn't load more.")).toBeInTheDocument()
    expect(screen.getByText('Title a')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Title b')).toBeInTheDocument()
    expect(screen.getByText('Title a')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load more.")).not.toBeInTheDocument()
    expect(cursors()).toEqual([undefined, 'c1', 'c1'])
  })

  it('replaces the list with the signed-out message on a first-page 401', async () => {
    list.mockRejectedValueOnce(new ApiError(401, null, null))
    renderList()
    expect(await screen.findByText("You're logged out. Log in to continue.")).toBeInTheDocument()
  })

  it('replaces the rows with the signed-out message on a later-page 401', async () => {
    list
      .mockResolvedValueOnce(page([bookmark({ id: 'a' })], 'c1'))
      .mockRejectedValueOnce(new ApiError(401, null, null))
    renderList()
    await screen.findByText('Title a')
    scrollToEnd()
    expect(await screen.findByText("You're logged out. Log in to continue.")).toBeInTheDocument()
    expect(screen.queryByText('Title a')).not.toBeInTheDocument()
  })

  it('disconnects the observer on unmount', async () => {
    list.mockResolvedValue(page([bookmark()], 'c1'))
    const { unmount } = renderList()
    await screen.findByTestId('list-sentinel')
    unmount()
    expect(observers.every((o) => o.disconnect.mock.calls.length > 0)).toBe(true)
  })

  it('renders without IntersectionObserver', async () => {
    vi.unstubAllGlobals()
    list.mockResolvedValue(page([bookmark({ title: 'Fine' })], 'c1'))
    renderList()
    expect(await screen.findByText('Fine')).toBeInTheDocument()
  })

  it('keeps the rows and drops the sentinel when a last page is empty', async () => {
    list
      .mockResolvedValueOnce(page([bookmark({ id: 'a' })], 'c1'))
      .mockResolvedValueOnce(page([], null))
    renderList()
    await screen.findByText('Title a')
    scrollToEnd()
    await waitFor(() => expect(screen.queryByTestId('list-sentinel')).not.toBeInTheDocument())
    expect(screen.getByText('Title a')).toBeInTheDocument()
    expect(screen.queryByText('No bookmarks yet')).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('does not throw when unmounted while a page request is in flight', async () => {
    let resolve: (p: ReturnType<typeof page>) => void = () => {}
    list.mockResolvedValueOnce(page([bookmark({ id: 'a' })], 'c1'))
    list.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    const { unmount } = renderList()
    await screen.findByText('Title a')
    scrollToEnd()
    unmount()
    await act(async () => resolve(page([bookmark({ id: 'b' })])))
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('shows a long title and an unbroken title as plain text', async () => {
    const long = 'x'.repeat(300)
    list.mockResolvedValue(page([bookmark({ title: long })]))
    renderList()
    expect(await screen.findByText(long)).toBeInTheDocument()
  })
})

describe('BookmarkList (trash)', () => {
  it('asks for the trash and shows host, "trashed" date, no chip, and a link', async () => {
    list.mockResolvedValue(
      page([
        bookmark({
          id: 't-1',
          title: 'Gone',
          fetch_status: 'pending',
          deleted_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
        }),
      ]),
    )
    renderList(true)
    const link = await screen.findByRole('link', { name: /Gone/ })
    expect(list).toHaveBeenCalledWith({ trashed: true, cursor: undefined })
    expect(link).toHaveAttribute('href', '/bookmarks/t-1')
    expect(within(link).getByText('trashed 2h ago')).toBeInTheDocument()
    expect(document.querySelector('.status-chip')).toBeNull()
  })

  it('omits "trashed" when deleted_at is null', async () => {
    list.mockResolvedValue(page([bookmark({ title: 'Odd', deleted_at: null })]))
    renderList(true)
    const link = await screen.findByRole('link', { name: /Odd/ })
    expect(link).not.toHaveTextContent('trashed')
  })

  it('has only a Restore button per row: no Edit, Move, Delete or Empty trash', async () => {
    list.mockResolvedValue(page([bookmark({ deleted_at: '2026-01-02T00:00:00Z' })]))
    renderList(true)
    await screen.findByRole('link', { name: /Title/ })
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Restore'])
    expect(screen.queryByText(/edit|delete|move|empty trash/i)).not.toBeInTheDocument()
  })

  it('shows its empty state', async () => {
    list.mockResolvedValue(page([]))
    renderList(true)
    expect(await screen.findByText('Trash is empty')).toBeInTheDocument()
    expect(screen.getByText('Deleted bookmarks show up here.')).toBeInTheDocument()
  })

  it('shows its error text', async () => {
    list.mockRejectedValueOnce(new ApiError(500, null, null))
    renderList(true)
    expect(await screen.findByText("Couldn't load the trash.")).toBeInTheDocument()
  })

  it('shows the signed-out message on a 401', async () => {
    list.mockRejectedValueOnce(new ApiError(401, null, null))
    renderList(true)
    expect(await screen.findByText("You're logged out. Log in to continue.")).toBeInTheDocument()
  })

  it('pages like the list', async () => {
    list
      .mockResolvedValueOnce(page([bookmark({ id: 'a' })], 'c1'))
      .mockResolvedValueOnce(page([bookmark({ id: 'b' })]))
    renderList(true)
    await screen.findByText('Title a')
    scrollToEnd()
    await screen.findByText('Title b')
    expect(list.mock.calls.map(([args]) => args)).toEqual([
      { trashed: true, cursor: undefined },
      { trashed: true, cursor: 'c1' },
    ])
  })
})

describe('BookmarkList (row delete)', () => {
  it('keeps the row until the server has answered and the list has been refetched', async () => {
    const user = userEvent.setup()
    let answer: () => void = () => {}
    vi.mocked(deleteBookmark).mockReset().mockImplementation(() => new Promise<void>((resolve) => (answer = resolve)))
    list.mockResolvedValueOnce(page([bookmark({ id: 'a', title: 'Doomed' })])).mockResolvedValue(page([]))
    renderList()
    await screen.findByText('Doomed')

    await user.click(screen.getByRole('button', { name: 'Actions for Doomed' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(deleteBookmark).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Doomed')).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(1)

    answer()
    expect(await screen.findByText('No bookmarks yet')).toBeInTheDocument()
    expect(screen.queryByText('Doomed')).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Moved to trash.')).toBeInTheDocument()
  })
})

describe('BookmarkList (row edit that finds the bookmark gone)', () => {
  it('keeps the dialog open with its message when Save gets a 404 and the refreshed list no longer has the row', async () => {
    const user = userEvent.setup()
    vi.mocked(updateBookmark).mockReset().mockRejectedValue(new ApiError(404, null, null))
    list.mockResolvedValueOnce(page([bookmark({ id: 'a', title: 'Gone soon' })])).mockResolvedValue(page([]))
    renderList()
    await screen.findByText('Gone soon')
    await user.click(screen.getByRole('button', { name: 'Actions for Gone soon' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Edit title & note' }))
    await user.type(await screen.findByLabelText('Title'), '!')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateBookmark).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByRole('dialog', { name: 'Edit bookmark' })).toBeInTheDocument()
    expect(screen.getByText('This bookmark no longer exists.')).toBeInTheDocument()
  })
})

describe('BookmarkList (row move that finds the bookmark gone)', () => {
  it('keeps the dialog open with its message when Move gets a 404 and the refreshed list no longer has the row', async () => {
    const user = userEvent.setup()
    vi.mocked(updateBookmark).mockReset().mockRejectedValue(new ApiError(404, null, null))
    list.mockResolvedValueOnce(page([bookmark({ id: 'a', title: 'Gone soon' })])).mockResolvedValue(page([]))
    renderList()
    await screen.findByText('Gone soon')
    await user.click(screen.getByRole('button', { name: 'Actions for Gone soon' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Move to…' }))
    await user.click(await screen.findByRole('radio', { name: 'Recipes' }))
    await user.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(updateBookmark).toHaveBeenCalledExactlyOnceWith('a', { folder_id: 'f-1' }))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByRole('dialog', { name: 'Move bookmark' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('That bookmark or folder no longer exists.')
  })
})

function Jump({ to }: { to: string }) {
  const navigate = useNavigate()
  return <button onClick={() => navigate(to)}>jump {to}</button>
}

function renderSearch(path: string, { folderId, trashed = false }: { folderId?: string; trashed?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <Jump to="/?q=bar" />
          <BookmarkList trashed={trashed} folderId={folderId} />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, ...view }
}

describe('BookmarkList (search)', () => {
  it('requests q with no includeNotes key, then includeNotes: true with notes=1', async () => {
    list.mockResolvedValue(page([bookmark({ id: 'a' })]))
    renderSearch('/?q=foo')
    await screen.findAllByRole('link')
    expect(list).toHaveBeenLastCalledWith({ trashed: false, cursor: undefined, q: 'foo' })
    expect(Object.keys(list.mock.calls[0][0] ?? {})).not.toContain('includeNotes')
    cleanup()
    list.mockClear()
    renderSearch('/?q=foo&notes=1')
    await screen.findAllByRole('link')
    expect(list).toHaveBeenLastCalledWith({ trashed: false, cursor: undefined, q: 'foo', includeNotes: true })
  })

  it('adds folderId on a folder page, and sends exactly the old request with no q', async () => {
    list.mockResolvedValue(page([bookmark({ id: 'a' })]))
    renderSearch('/folder/f-1?q=foo', { folderId: 'f-1' })
    await screen.findAllByRole('link')
    expect(list).toHaveBeenLastCalledWith({ trashed: false, cursor: undefined, folderId: 'f-1', q: 'foo' })
    cleanup()
    list.mockClear()
    renderSearch('/folder/f-1?notes=1&q=%20', { folderId: 'f-1' })
    await screen.findAllByRole('link')
    expect(list).toHaveBeenLastCalledWith({ trashed: false, cursor: undefined, folderId: 'f-1' })
    expect(screen.getByRole('region', { name: 'Bookmarks' })).toBeInTheDocument()
  })

  it('ignores q in the URL for the trash: the request has no q and the section is Trash', async () => {
    list.mockResolvedValue(page([bookmark({ id: 'a' })]))
    renderSearch('/trash?q=foo&notes=1', { trashed: true })
    await screen.findAllByRole('link')
    expect(list).toHaveBeenLastCalledWith({ trashed: true, cursor: undefined })
    expect(screen.getByRole('region', { name: 'Trash' })).toBeInTheDocument()
  })

  it('shows rows in the order the server returned, not newest first or alphabetical', async () => {
    list.mockResolvedValue(
      page([
        bookmark({ id: 'm', title: 'Mango', created_at: '2026-01-02T00:00:00Z' }),
        bookmark({ id: 'z', title: 'Zebra', created_at: '2026-01-03T00:00:00Z' }),
        bookmark({ id: 'a', title: 'Apple', created_at: '2026-01-01T00:00:00Z' }),
      ]),
    )
    renderSearch('/?q=foo')
    await screen.findByText('Mango')
    expect(titles()).toEqual(['Mango', 'Zebra', 'Apple'])
  })

  it('names the section "Search results" while searching, "Bookmarks" otherwise', async () => {
    list.mockResolvedValue(page([bookmark({ id: 'a' })]))
    renderSearch('/?q=foo')
    expect(screen.getByRole('region', { name: 'Search results' })).toBeInTheDocument()
    cleanup()
    renderSearch('/')
    expect(screen.getByRole('region', { name: 'Bookmarks' })).toBeInTheDocument()
  })

  it('shows the loading skeleton, not the earlier results, for a new term; a late earlier response is dropped', async () => {
    const user = userEvent.setup()
    let late: (p: ReturnType<typeof page>) => void = () => {}
    list.mockReturnValueOnce(new Promise((r) => (late = r)))
    let release: (p: ReturnType<typeof page>) => void = () => {}
    list.mockReturnValueOnce(new Promise((r) => (release = r)))
    renderSearch('/?q=foo')
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    await user.click(screen.getByText('jump /?q=bar'))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    expect(list.mock.calls[1][0]).toEqual({ trashed: false, cursor: undefined, q: 'bar' })
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(6)

    await act(async () => late(page([bookmark({ id: 'o', title: 'Old term row' })])))
    expect(screen.queryByText('Old term row')).not.toBeInTheDocument()
    await act(async () => release(page([bookmark({ id: 'n', title: 'New term row' })])))
    expect(await screen.findByText('New term row')).toBeInTheDocument()
    expect(screen.queryByText('Old term row')).not.toBeInTheDocument()
  })

  it('refetches an open search with the same q when the list key is invalidated', async () => {
    list.mockResolvedValueOnce(page([bookmark({ id: 'a', title: 'Before' })])).mockResolvedValue(page([bookmark({ id: 'b', title: 'After' })]))
    const { client } = renderSearch('/?q=foo')
    await screen.findByText('Before')
    await act(() => client.invalidateQueries({ queryKey: BOOKMARK_LIST_KEY }))
    expect(await screen.findByText('After')).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
    expect(list.mock.calls[1][0]).toEqual({ trashed: false, cursor: undefined, q: 'foo' })
  })

  it('deletes a search result and refreshes the search', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteBookmark).mockReset().mockResolvedValue(undefined)
    list.mockResolvedValueOnce(page([bookmark({ id: 'a', title: 'Doomed' })])).mockResolvedValue(page([]))
    renderSearch('/?q=foo')
    await screen.findByText('Doomed')
    await user.click(screen.getByRole('button', { name: 'Actions for Doomed' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    expect(deleteBookmark).toHaveBeenCalledWith('a')
    expect(await screen.findByText('No bookmarks match “foo”.')).toBeInTheDocument()
    expect(list.mock.calls[1][0]).toEqual({ trashed: false, cursor: undefined, q: 'foo' })
  })

  it('shows the no-results panel with the term as text, and the notes-off description', async () => {
    list.mockResolvedValue(page([]))
    renderSearch('/?q=%3Cb%3Ebold%3C%2Fb%3E')
    expect(await screen.findByRole('heading', { name: 'No bookmarks match “<b>bold</b>”.' })).toBeInTheDocument()
    expect(document.querySelector('.state-panel__title b')).toBeNull()
    expect(screen.getByText('Search matches whole words. Try another word, or include notes.')).toBeInTheDocument()
    expect(screen.queryByText('No bookmarks yet')).not.toBeInTheDocument()
  })

  it('shows the notes-on description, and replaces the given empty panel on a folder page', async () => {
    list.mockResolvedValue(page([]))
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/folder/f-1?q=soup&notes=1']}>
          <ToastProvider>
            <BookmarkList folderId="f-1" empty={<p>This folder is empty.</p>} />
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('No bookmarks match “soup”.')).toBeInTheDocument()
    expect(screen.getByText('Search matches whole words. Try another word.')).toBeInTheDocument()
    expect(screen.queryByText('This folder is empty.')).not.toBeInTheDocument()
  })

  it('shows "Couldn\'t search your bookmarks." when the first page fails, and Try again retries', async () => {
    const user = userEvent.setup()
    list.mockRejectedValueOnce(new ApiError(500, null, null)).mockResolvedValueOnce(page([bookmark({ id: 'a', title: 'Found' })]))
    renderSearch('/?q=foo')
    expect(await screen.findByText("Couldn't search your bookmarks.")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Found')).toBeInTheDocument()
  })

  it('shows the signed-out message on a 401', async () => {
    list.mockRejectedValue(new ApiError(401, null, null))
    renderSearch('/?q=foo')
    expect(await screen.findByText("You're logged out. Log in to continue.")).toBeInTheDocument()
    expect(screen.queryByText("Couldn't search your bookmarks.")).not.toBeInTheDocument()
  })

  it('shows "Couldn\'t load more." when a later page fails, and the second page carries q and the cursor', async () => {
    list
      .mockResolvedValueOnce(page([bookmark({ id: 'a', title: 'One' })], 'c1'))
      .mockRejectedValueOnce(new ApiError(500, null, null))
    renderSearch('/folder/f-1?q=foo&notes=1', { folderId: 'f-1' })
    await screen.findByText('One')
    scrollToEnd()
    expect(await screen.findByText("Couldn't load more.")).toBeInTheDocument()
    expect(list.mock.calls[1][0]).toEqual({ trashed: false, cursor: 'c1', folderId: 'f-1', q: 'foo', includeNotes: true })
    expect(screen.getByText('One')).toBeInTheDocument()
  })
})
