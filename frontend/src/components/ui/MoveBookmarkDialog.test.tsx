import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../../lib/api/ApiError'
import { updateBookmark } from '../../lib/api/bookmarks'
import { listFolders } from '../../lib/api/folders'
import { folder } from '../../test/builders'
import { renderApp, testClient } from '../../test/wrap'
import { MoveBookmarkDialog } from './MoveBookmarkDialog'

vi.mock('../../lib/api/bookmarks', () => ({ updateBookmark: vi.fn() }))
vi.mock('../../lib/api/folders', () => ({ listFolders: vi.fn() }))

const FOLDERS = [folder({ id: 'f-1', name: 'Recipes' }), folder({ id: 'f-2', name: 'Work' })]
const bookmark = { id: 'b-1', title: 'A page', url: 'https://example.com/x', folder_id: 'f-1' }

beforeEach(() => {
  vi.mocked(updateBookmark).mockReset()
  vi.mocked(listFolders).mockReset()
  vi.mocked(listFolders).mockResolvedValue({ items: FOLDERS })
})

describe('MoveBookmarkDialog', () => {
  it('lists the folders with the current one selected, moves with the chosen id, refreshes and closes', async () => {
    vi.mocked(updateBookmark).mockResolvedValue({} as never)
    const onClose = vi.fn()
    const client = testClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    renderApp(<MoveBookmarkDialog open bookmark={bookmark} onClose={onClose} />, { client })
    expect(await screen.findByRole('radio', { name: 'Recipes' })).toBeChecked()
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Work' }))
    await user.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(updateBookmark).toHaveBeenCalledExactlyOnceWith('b-1', { folder_id: 'f-2' })
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([['bookmark-list'], ['bookmark', 'b-1'], ['folders']])
    expect(await screen.findByText('Moved to “Work”.')).toBeInTheDocument()
  })

  it('names the bookmark by its host when the title is empty', async () => {
    renderApp(<MoveBookmarkDialog open bookmark={{ ...bookmark, title: '  ' }} onClose={vi.fn()} />)
    expect(await screen.findByText('example.com')).toBeInTheDocument()
  })

  it('shows the server failure in the dialog and keeps it open', async () => {
    vi.mocked(updateBookmark).mockRejectedValue(
      new ApiError(409, { type: 'x', title: 't', status: 409, code: 'bookmark_in_trash' } as ProblemBody, null),
    )
    const onClose = vi.fn()
    renderApp(<MoveBookmarkDialog open bookmark={bookmark} onClose={onClose} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: 'Top level' }))
    await user.click(screen.getByRole('button', { name: 'Move' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("This bookmark is in the trash and can't be moved.")
    expect(onClose).not.toHaveBeenCalled()
  })

  it('retries a failed folder list', async () => {
    vi.mocked(listFolders).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderApp(<MoveBookmarkDialog open bookmark={bookmark} onClose={vi.fn()} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('radio', { name: 'Recipes' })).toBeInTheDocument()
    expect(listFolders).toHaveBeenCalledTimes(2)
  })
})
