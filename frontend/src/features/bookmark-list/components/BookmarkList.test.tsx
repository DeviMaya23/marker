import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import { listBookmarks } from '../../../lib/api/bookmarks'
import { bookmark, page } from '../../../test/builders'
import { BookmarkList } from './BookmarkList'

vi.mock('../../../lib/api/bookmarks', () => ({ listBookmarks: vi.fn() }))

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
        <BookmarkList trashed={trashed} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const cursors = () => list.mock.calls.map(([args]) => args?.cursor)
const titles = () => screen.getAllByRole('link').map((a) => a.querySelector('.bookmark-row__title')?.textContent)

beforeEach(() => {
  list.mockReset()
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

  it('has no Restore, Empty trash or other buttons', async () => {
    list.mockResolvedValue(page([bookmark({ deleted_at: '2026-01-02T00:00:00Z' })]))
    renderList(true)
    await screen.findByRole('link')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText(/restore|empty trash/i)).not.toBeInTheDocument()
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
