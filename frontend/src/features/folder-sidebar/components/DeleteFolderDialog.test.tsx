import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../../../lib/api/ApiError'
import { deleteFolder } from '../../../lib/api/folders'
import { folder } from '../../../test/builders'
import { renderApp } from '../../../test/wrap'
import { DeleteFolderDialog } from './DeleteFolderDialog'

vi.mock('../../../lib/api/folders', () => ({ deleteFolder: vi.fn() }))
const del = vi.mocked(deleteFolder)

function Harness({ onDeleted = () => {} }: { onDeleted?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <DeleteFolderDialog
        open={open}
        folder={folder({ id: 'f1', name: 'Recipes' })}
        subfolders={2}
        bookmarks={5}
        onClose={() => setOpen(false)}
        onDeleted={onDeleted}
      />
    </>
  )
}

async function setup(onDeleted?: () => void) {
  const view = renderApp(<Harness onDeleted={onDeleted} />)
  const user = userEvent.setup()
  const invalidate = vi.spyOn(view.client, 'invalidateQueries')
  await user.click(screen.getByRole('button', { name: 'Open' }))
  await screen.findByRole('dialog', { name: 'Delete folder?' })
  return { user, invalidate, ...view }
}

const confirmButton = () => screen.getByRole('button', { name: 'Delete folder' })
// A toast is also a role=dialog, so the confirmation is looked up by its name.
const confirmation = () => screen.queryByRole('dialog', { name: 'Delete folder?' })
const gone = () => waitFor(() => expect(confirmation()).not.toBeInTheDocument())

function clickBackdrop() {
  const backdrop = document.querySelector('.modal-overlay')
  if (!backdrop) throw new Error('no backdrop')
  for (const type of ['pointerDown', 'mouseDown', 'pointerUp', 'mouseUp', 'click'] as const) fireEvent[type](backdrop)
}

beforeEach(() => {
  del.mockReset()
})

describe('DeleteFolderDialog', () => {
  it('names what will happen from the counts it was given', async () => {
    await setup()
    expect(
      screen.getByText(
        'Delete “Recipes”? Its 2 subfolders will be deleted too. 5 bookmarks in it will be moved to the trash.',
      ),
    ).toBeInTheDocument()
  })

  it('confirming deletes once, calls onDeleted, closes and toasts', async () => {
    del.mockResolvedValue({ deleted_folders: 3, trashed_bookmarks: 5 })
    const onDeleted = vi.fn()
    const { user } = await setup(onDeleted)
    await user.dblClick(confirmButton())
    await gone()
    expect(del).toHaveBeenCalledExactlyOnceWith('f1')
    expect(onDeleted).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Folder deleted. 5 bookmarks moved to the trash.')).toBeInTheDocument()
  })

  it('refreshes the folders, the lists and the bookmark pages after a delete', async () => {
    del.mockResolvedValue({ deleted_folders: 1, trashed_bookmarks: 0 })
    const { user, invalidate } = await setup()
    await user.click(confirmButton())
    await gone()
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([['folders'], ['bookmark-list'], ['bookmark']])
  })

  it('while working, Esc, Cancel and the backdrop do nothing and both buttons are disabled', async () => {
    let finish: (value: { deleted_folders: number; trashed_bookmarks: number }) => void = () => {}
    del.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const { user } = await setup()
    await user.click(confirmButton())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled())
    expect(confirmButton()).toBeDisabled()
    await user.keyboard('{Escape}')
    clickBackdrop()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(confirmation()).toBeInTheDocument()
    finish({ deleted_folders: 1, trashed_bookmarks: 0 })
    await gone()
  })

  it('Esc and Cancel close it when nothing is working, without deleting', async () => {
    const { user } = await setup()
    await user.keyboard('{Escape}')
    await gone()
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await gone()
    expect(del).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
  })

  it('a failure keeps the dialog open with its message and does not call onDeleted', async () => {
    del.mockRejectedValue(new TypeError('offline'))
    const onDeleted = vi.fn()
    const { user } = await setup(onDeleted)
    await user.click(confirmButton())
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't delete the folder.")
    expect(confirmation()).toBeInTheDocument()
    expect(confirmButton()).toBeEnabled()
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('a 404 says the folder is gone and still refreshes', async () => {
    del.mockRejectedValue(new ApiError(404, { type: 'x', title: 't', status: 404, code: 'not_found' } as ProblemBody, null))
    const { user, invalidate } = await setup()
    await user.click(confirmButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('This folder no longer exists.')
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toContainEqual(['folders'])
  })

  it('a 401 shows the signed-out message', async () => {
    del.mockRejectedValue(new ApiError(401, null, null))
    const { user } = await setup()
    await user.click(confirmButton())
    expect(await screen.findByText("You're logged out. Log in to continue.")).toBeInTheDocument()
  })
})
