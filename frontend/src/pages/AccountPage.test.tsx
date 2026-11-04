import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api/ApiError'
import { deleteAccount } from '../lib/api/account'
import { listFolders } from '../lib/api/folders'
import { getSyncVersion } from '../lib/api/sync'
import { loginHref } from '../lib/loginHref'
import { testClient, renderApp } from '../test/wrap'
import { AccountPage } from './AccountPage'

vi.mock('../lib/api/account', () => ({ deleteAccount: vi.fn() }))
vi.mock('../lib/api/folders', () => ({ listFolders: vi.fn() }))
vi.mock('../lib/api/sync', () => ({ getSyncVersion: vi.fn() }))
const del = vi.mocked(deleteAccount)
const folders = vi.mocked(listFolders)
const sync = vi.mocked(getSyncVersion)

const DELETED = 'Your account was deleted.'

beforeEach(() => {
  del.mockReset()
  folders.mockReset().mockResolvedValue({ items: [] })
  sync.mockReset().mockResolvedValue({ version: 0 })
})

function show() {
  const client = testClient()
  client.setQueryData(['seeded'], { value: 1 })
  renderApp(<AccountPage />, { path: '/account', client })
  return client
}

async function startDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Delete account' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' })
  await user.type(within(dialog).getByRole('textbox'), 'delete my account')
  return dialog
}

describe('AccountPage', () => {
  it('shows the title and the two sections in order, inside the app shell', () => {
    show()
    const headings = within(screen.getByRole('main')).getAllByRole('heading').map((h) => [h.tagName, h.textContent])
    expect(headings).toEqual([
      ['H1', 'Account & help'],
      ['H2', 'Install the bookmarklet'],
      ['H2', 'Delete account'],
    ])
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('page__title')
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.queryByText(DELETED)).not.toBeInTheDocument()
  })

  it('replaces the app with the deleted page, requests nothing more and clears the cache', async () => {
    del.mockResolvedValue(undefined)
    const client = show()
    await waitFor(() => expect(folders).toHaveBeenCalled())
    const user = userEvent.setup()
    const dialog = await startDelete(user)
    const folderCalls = folders.mock.calls.length
    const syncCalls = sync.mock.calls.length
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }))

    expect(await screen.findByText(DELETED)).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.queryByText('Folders')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', loginHref('/', ''))
    expect(
      screen.getByText(
        'All of your bookmarks, notes, folders and trash were permanently erased. Logging in again starts a new, empty account.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(client.getQueryCache().getAll()).toHaveLength(0))
    expect(folders).toHaveBeenCalledTimes(folderCalls)
    expect(sync).toHaveBeenCalledTimes(syncCalls)
  })

  it('keeps the cache and the page after a failed delete and after Cancel', async () => {
    del.mockImplementation(() => Promise.reject(new ApiError(500, null, null)))
    const client = show()
    const user = userEvent.setup()
    const dialog = await startDelete(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }))
    await within(dialog).findByText("Couldn't delete your account.")
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(DELETED)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Account & help' })).toBeInTheDocument()
    expect(client.getQueryData(['seeded'])).toEqual({ value: 1 })
  })
})
