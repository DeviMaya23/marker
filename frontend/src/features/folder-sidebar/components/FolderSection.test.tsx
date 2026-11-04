import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes, useLocation, useNavigationType } from 'react-router'
import { ApiError, type ProblemBody } from '../../../lib/api/ApiError'
import { createFolder, deleteFolder, listFolders, updateFolder } from '../../../lib/api/folders'
import { folder } from '../../../test/builders'
import { renderApp } from '../../../test/wrap'
import { FolderSection } from './FolderSection'

vi.mock('../../../lib/api/folders', () => ({
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}))
const list = vi.mocked(listFolders)

const items = [
  folder({ id: 'a', name: 'Recipes', depth: 1, bookmark_count: 1 }),
  folder({ id: 'b', name: 'Soups', parent_id: 'a', depth: 2, bookmark_count: 2 }),
  folder({ id: 'c', name: 'Winter', parent_id: 'b', depth: 3, bookmark_count: 4 }),
  folder({ id: 'd', name: 'Other', depth: 1, bookmark_count: 0 }),
]

function Where() {
  const { pathname } = useLocation()
  const type = useNavigationType()
  return (
    <output data-testid="where" data-navigation={type}>
      {pathname}
    </output>
  )
}

function setup(path = '/') {
  const view = renderApp(
    <>
      <Where />
      <Routes>
        <Route path="*" element={<FolderSection />} />
      </Routes>
    </>,
    { path },
  )
  return { user: userEvent.setup(), invalidate: vi.spyOn(view.client, 'invalidateQueries'), ...view }
}

const where = () => screen.getByTestId('where').textContent
const problem = (status: number, code: string) => new ApiError(status, { type: 'x', title: 't', status, code } as ProblemBody, null)

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string, item: string) {
  await user.click(await screen.findByRole('button', { name: `Actions for folder ${name}` }))
  await user.click(await screen.findByRole('menuitem', { name: item }))
}

beforeEach(() => {
  for (const fn of [list, vi.mocked(createFolder), vi.mocked(updateFolder), vi.mocked(deleteFolder)]) fn.mockReset()
  list.mockResolvedValue({ items })
})

describe('FolderSection states', () => {
  it('shows skeleton rows while loading, then the tree', async () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Folders' })).toBeInTheDocument()
    expect(screen.getByTestId('folder-skeleton')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Recipes' })).toBeInTheDocument()
    expect(screen.queryByTestId('folder-skeleton')).not.toBeInTheDocument()
  })

  it('says "No folders yet." and keeps the New folder button', async () => {
    list.mockResolvedValue({ items: [] })
    setup()
    expect(await screen.findByText('No folders yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New folder' })).toBeInTheDocument()
  })

  it('shows a failure with a Try again that refetches and then shows the tree', async () => {
    list.mockRejectedValueOnce(new TypeError('offline'))
    const { user } = setup()
    expect(await screen.findByText("Couldn't load your folders.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New folder' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: 'Recipes' })).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('shows the signed-out message on a 401', async () => {
    list.mockRejectedValue(problem(401, 'unauthenticated'))
    setup()
    expect(await screen.findByText("You're logged out. Log in to continue.")).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Recipes' })).not.toBeInTheDocument()
  })
})

describe('FolderSection create and rename', () => {
  it('New folder creates at the top level with no parent, closes, refreshes and toasts', async () => {
    vi.mocked(createFolder).mockResolvedValue(folder({ id: 'n', name: 'Fresh' }))
    const { user, invalidate } = setup()
    await user.click(await screen.findByRole('button', { name: 'New folder' }))
    await user.type(await screen.findByLabelText('Name'), 'Fresh{Enter}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New folder' })).not.toBeInTheDocument())
    expect(createFolder).toHaveBeenCalledExactlyOnceWith({ name: 'Fresh', parentId: undefined })
    expect(screen.getByText('Folder created.')).toBeInTheDocument()
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([['folders'], ['bookmark-list']])
    expect(where()).toBe('/')
  })

  it('New subfolder shows the parent and sends its id', async () => {
    vi.mocked(createFolder).mockResolvedValue(folder({ id: 'n' }))
    const { user } = setup()
    await openMenu(user, 'Soups', 'New subfolder')
    expect(await screen.findByText('In Soups')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Name'), 'Broths{Enter}')
    await waitFor(() => expect(createFolder).toHaveBeenCalledExactlyOnceWith({ name: 'Broths', parentId: 'b' }))
  })

  it('Rename is prefilled, sends only the new name and toasts', async () => {
    vi.mocked(updateFolder).mockResolvedValue(folder({ id: 'd', name: 'Misc' }))
    const { user } = setup()
    await openMenu(user, 'Other', 'Rename')
    const field = await screen.findByLabelText('Name')
    expect(field).toHaveValue('Other')
    await user.clear(field)
    await user.type(field, 'Misc{Enter}')
    await waitFor(() => expect(updateFolder).toHaveBeenCalledExactlyOnceWith('d', { name: 'Misc' }))
    expect(await screen.findByText('Folder renamed.')).toBeInTheDocument()
  })

  it('a name conflict stays under the field, keeps the text and does not refresh', async () => {
    vi.mocked(createFolder).mockRejectedValue(problem(409, 'folder_name_conflict'))
    const { user, invalidate } = setup()
    await user.click(await screen.findByRole('button', { name: 'New folder' }))
    await user.type(await screen.findByLabelText('Name'), 'Other{Enter}')
    expect(await screen.findByText('A folder with this name already exists here.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Other')
    expect(screen.getByRole('dialog', { name: 'New folder' })).toBeInTheDocument()
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('a depth error is a banner in the dialog; a 401 shows the signed-out message; both keep the dialog', async () => {
    vi.mocked(createFolder).mockRejectedValueOnce(problem(422, 'folder_depth_exceeded'))
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'New folder' }))
    await user.type(await screen.findByLabelText('Name'), 'Deep{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Folders can only be nested 3 levels deep.')
    vi.mocked(createFolder).mockRejectedValueOnce(new ApiError(401, null, null))
    await user.type(screen.getByLabelText('Name'), '{Enter}')
    expect(await screen.findByText("You're logged out. Log in to continue.")).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Deep')
  })

  it('returns focus to the row menu button after Cancel', async () => {
    const { user } = setup()
    await openMenu(user, 'Other', 'Rename')
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rename folder' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Actions for folder Other' })).toHaveFocus()
  })
})

describe('FolderSection delete', () => {
  it('builds the text from the loaded list: a parent counts its descendants', async () => {
    const { user } = setup()
    await openMenu(user, 'Recipes', 'Delete')
    expect(
      await screen.findByText(
        'Delete “Recipes”? Its 2 subfolders will be deleted too. 7 bookmarks in it will be moved to the trash.',
      ),
    ).toBeInTheDocument()
  })

  it('says an empty folder is empty', async () => {
    const { user } = setup()
    await openMenu(user, 'Other', 'Delete')
    expect(await screen.findByText('Delete “Other”? This folder is empty.')).toBeInTheDocument()
  })

  it('deletes once, closes, and toasts the server numbers', async () => {
    vi.mocked(deleteFolder).mockResolvedValue({ deleted_folders: 1, trashed_bookmarks: 1 })
    const { user } = setup()
    await openMenu(user, 'Other', 'Delete')
    await user.click(await screen.findByRole('button', { name: 'Delete folder' }))
    expect(await screen.findByText('Folder deleted. 1 bookmark moved to the trash.')).toBeInTheDocument()
    expect(deleteFolder).toHaveBeenCalledExactlyOnceWith('d')
    expect(screen.queryByRole('dialog', { name: 'Delete folder?' })).not.toBeInTheDocument()
  })

  it.each([
    ['the deleted folder', '/folder/a', 'Recipes', '/'],
    ['a child of it', '/folder/b', 'Recipes', '/'],
    ['a grandchild of it', '/folder/c', 'Recipes', '/'],
    ['an unrelated folder', '/folder/d', 'Recipes', '/folder/d'],
    ['its parent, while deleting the child', '/folder/a', 'Soups', '/folder/a'],
    ['the all-bookmarks page', '/', 'Recipes', '/'],
  ])('when viewing %s, deleting %s %s leaves you at %s', async (_label, path, name, expected) => {
    vi.mocked(deleteFolder).mockResolvedValue({ deleted_folders: 1, trashed_bookmarks: 0 })
    const { user } = setup(path)
    await openMenu(user, name, 'Delete')
    await user.click(await screen.findByRole('button', { name: 'Delete folder' }))
    await screen.findByText('Folder deleted.')
    // The toast shows a tick before the navigation renders; the dialog closes after navigating.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete folder?' })).not.toBeInTheDocument())
    expect(where()).toBe(expected)
  })

  it('does not navigate when the delete fails', async () => {
    vi.mocked(deleteFolder).mockRejectedValue(problem(404, 'not_found'))
    const { user } = setup('/folder/a')
    await openMenu(user, 'Recipes', 'Delete')
    await user.click(await screen.findByRole('button', { name: 'Delete folder' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This folder no longer exists.')
    expect(where()).toBe('/folder/a')
  })

  it('replaces the history entry instead of pushing one', async () => {
    vi.mocked(deleteFolder).mockResolvedValue({ deleted_folders: 1, trashed_bookmarks: 0 })
    const { user } = setup('/folder/d')
    await openMenu(user, 'Other', 'Delete')
    await user.click(await screen.findByRole('button', { name: 'Delete folder' }))
    await waitFor(() => expect(where()).toBe('/'))
    expect(screen.getByTestId('where')).toHaveAttribute('data-navigation', 'REPLACE')
  })
})

describe('FolderSection move', () => {
  it('opens the move dialog for that folder: its subtree and too-deep rows are disabled, the rest are not', async () => {
    const { user } = setup()
    await openMenu(user, 'Soups', 'Move to…')
    expect(await screen.findByRole('dialog', { name: 'Move folder' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Recipes' })).toBeChecked()
    // Soups has one level of children: itself and Winter are blocked; Recipes (depth 1) and Other can host it.
    for (const name of ['Soups', 'Winter']) expect(screen.getByRole('radio', { name })).toHaveAttribute('aria-disabled', 'true')
    for (const name of ['Top level', 'Recipes', 'Other']) {
      expect(screen.getByRole('radio', { name })).not.toHaveAttribute('aria-disabled', 'true')
    }
  })

  it('disables a depth-3 row for a folder that would go too deep', async () => {
    const { user } = setup()
    await openMenu(user, 'Other', 'Move to…')
    await screen.findByRole('dialog', { name: 'Move folder' })
    // Other has no children: depth 3 + 1 > 3 disables Winter only (and Other itself).
    expect(screen.getByRole('radio', { name: 'Winter' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('radio', { name: 'Soups' })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('moves under the chosen folder, sends only parent_id, refreshes, toasts, and the user stays where they are', async () => {
    vi.mocked(updateFolder).mockResolvedValue(folder({ id: 'd' }))
    const { user, invalidate } = setup('/folder/b')
    await openMenu(user, 'Other', 'Move to…')
    await user.click(await screen.findByRole('radio', { name: 'Recipes' }))
    await user.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(updateFolder).toHaveBeenCalledExactlyOnceWith('d', { parentId: 'a' }))
    expect(await screen.findByText('Folder moved to “Recipes”.')).toBeInTheDocument()
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([['folders'], ['bookmark-list']])
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Move folder' })).not.toBeInTheDocument())
    expect(where()).toBe('/folder/b')
  })

  it('moves a subfolder to the top level with an explicit null', async () => {
    vi.mocked(updateFolder).mockResolvedValue(folder({ id: 'b' }))
    const { user } = setup()
    await openMenu(user, 'Soups', 'Move to…')
    await user.click(await screen.findByRole('radio', { name: 'Top level' }))
    await user.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(updateFolder).toHaveBeenCalledExactlyOnceWith('b', { parentId: null }))
    expect(await screen.findByText('Folder moved to the top level.')).toBeInTheDocument()
  })

  it.each([
    ['409 folder_name_conflict', problem(409, 'folder_name_conflict'), 'A folder with this name already exists there.'],
    ['422 folder_depth_exceeded', problem(422, 'folder_depth_exceeded'), 'Folders can only be nested 3 levels deep.'],
    ['404', problem(404, 'not_found'), 'That folder no longer exists.'],
  ])('shows %s in the dialog and keeps it open', async (_name, error, message) => {
    vi.mocked(updateFolder).mockRejectedValue(error)
    const { user } = setup()
    await openMenu(user, 'Other', 'Move to…')
    await user.click(await screen.findByRole('radio', { name: 'Recipes' }))
    await user.click(screen.getByRole('button', { name: 'Move' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Move folder' })).toBeInTheDocument()
  })

  it('returns focus to the row menu button after Cancel', async () => {
    const { user } = setup()
    await openMenu(user, 'Other', 'Move to…')
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actions for folder Other' })).toHaveFocus())
  })
})
