import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../../lib/api/ApiError'
import { listFolders, updateFolder } from '../../lib/api/folders'
import { folder } from '../../test/builders'
import { renderApp, testClient } from '../../test/wrap'
import { MoveFolderDialog } from './MoveFolderDialog'

vi.mock('../../lib/api/folders', () => ({ listFolders: vi.fn(), updateFolder: vi.fn() }))

const a = folder({ id: 'a', name: 'Alpha', depth: 1 })
const b = folder({ id: 'b', name: 'Beta', parent_id: 'a', depth: 2 })
const c = folder({ id: 'c', name: 'Gamma', depth: 1 })

beforeEach(() => {
  vi.mocked(updateFolder).mockReset()
  vi.mocked(listFolders).mockReset()
  vi.mocked(listFolders).mockResolvedValue({ items: [a, b, c] })
})

describe('MoveFolderDialog', () => {
  it('disables the folder and its subtree, moves to the chosen one, refreshes folders and lists, closes', async () => {
    vi.mocked(updateFolder).mockResolvedValue(a)
    const onClose = vi.fn()
    const client = testClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    renderApp(<MoveFolderDialog open folder={a} onClose={onClose} />, { client })
    expect(await screen.findByRole('radio', { name: 'Top level' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-disabled', 'true')
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Gamma' }))
    await user.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(updateFolder).toHaveBeenCalledExactlyOnceWith('a', { parentId: 'c' })
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([['folders'], ['bookmark-list']])
    expect(await screen.findByText('Folder moved to “Gamma”.')).toBeInTheDocument()
  })

  it('moves to the top level with null, from a subfolder', async () => {
    vi.mocked(updateFolder).mockResolvedValue(b)
    const onClose = vi.fn()
    renderApp(<MoveFolderDialog open folder={b} onClose={onClose} />)
    expect(await screen.findByRole('radio', { name: 'Alpha' })).toBeChecked()
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Top level' }))
    await user.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(updateFolder).toHaveBeenCalledExactlyOnceWith('b', { parentId: null })
    expect(await screen.findByText('Folder moved to the top level.')).toBeInTheDocument()
  })

  it('shows a name conflict in the dialog without closing or refreshing', async () => {
    vi.mocked(updateFolder).mockRejectedValue(
      new ApiError(409, { type: 'x', title: 't', status: 409, code: 'folder_name_conflict' } as ProblemBody, null),
    )
    const client = testClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const onClose = vi.fn()
    renderApp(<MoveFolderDialog open folder={a} onClose={onClose} />, { client })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: 'Gamma' }))
    await user.click(screen.getByRole('button', { name: 'Move' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A folder with this name already exists there.')
    expect(onClose).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: 'Gamma' })).toBeChecked()
  })

  it('shows the signed-out message for a 401', async () => {
    vi.mocked(updateFolder).mockRejectedValue(new ApiError(401, null, null))
    renderApp(<MoveFolderDialog open folder={a} onClose={vi.fn()} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: 'Gamma' }))
    await user.click(screen.getByRole('button', { name: 'Move' }))
    expect(await screen.findByText("You're logged out. Log in to continue.")).toBeInTheDocument()
  })
})
