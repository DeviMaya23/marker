import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../../../lib/api/ApiError'
import { deleteBookmark, restoreBookmark, updateBookmark } from '../../../lib/api/bookmarks'
import { goTo } from '../../../lib/goTo'
import { bookmark } from '../../../test/builders'
import { renderApp } from '../../../test/wrap'
import { BookmarkRow } from './BookmarkRow'

vi.mock('../../../lib/api/bookmarks', () => ({
  deleteBookmark: vi.fn(),
  restoreBookmark: vi.fn(),
  updateBookmark: vi.fn(),
}))
vi.mock('../../../lib/goTo', () => ({ goTo: vi.fn() }))

const del = vi.mocked(deleteBookmark)
const restore = vi.mocked(restoreBookmark)
const update = vi.mocked(updateBookmark)
const problem = (status: number, code: string) =>
  new ApiError(status, { type: 'x', title: 't', status, code } as ProblemBody, null)

const row = bookmark({ id: 'b-1', title: 'A page', url: 'https://example.com/a', note: 'my note' })

function setup() {
  const view = renderApp(<BookmarkRow bookmark={row} />)
  const invalidate = vi.spyOn(view.client, 'invalidateQueries')
  return { ...view, invalidate, user: userEvent.setup() }
}

const actionsButton = () => screen.getByRole('button', { name: 'Actions for A page' })

async function chooseDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(actionsButton())
  await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
}

beforeEach(() => {
  del.mockReset()
  restore.mockReset()
  update.mockReset()
  vi.mocked(goTo).mockReset()
})

describe('BookmarkRow actions menu', () => {
  it('has a button named for the title, and the row title still links to the bookmark', () => {
    setup()
    expect(actionsButton()).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /A page/ })).toHaveAttribute('href', '/bookmarks/b-1')
  })

  it('names the button for the host while the title is empty', () => {
    renderApp(<BookmarkRow bookmark={bookmark({ title: '', url: 'https://www.example.com/x' })} />)
    expect(screen.getByRole('button', { name: 'Actions for www.example.com' })).toBeInTheDocument()
  })

  it('lists Open original link, Edit title & note and Delete, in that order, with no Move to…', async () => {
    const { user } = setup()
    await user.click(actionsButton())
    await screen.findByRole('menu')
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Open original link',
      'Edit title & note',
      'Delete',
    ])
    expect(screen.queryByText(/move to/i)).not.toBeInTheDocument()
    const link = screen.getByRole('menuitem', { name: 'Open original link' })
    expect(link).toHaveAttribute('href', 'https://example.com/a')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

describe('BookmarkRow delete', () => {
  it('calls deleteBookmark once, refreshes and offers Undo; the button is disabled meanwhile', async () => {
    let finish: () => void = () => {}
    del.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))
    const { user, invalidate } = setup()
    await chooseDelete(user)
    await waitFor(() => expect(actionsButton()).toBeDisabled())
    expect(del).toHaveBeenCalledExactlyOnceWith('b-1')
    expect(invalidate).not.toHaveBeenCalled()
    finish()
    expect(await screen.findByText('Moved to trash.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([['bookmark-list'], ['bookmark', 'b-1']])
    expect(actionsButton()).toBeEnabled()
  })

  it('Undo calls restoreBookmark, refreshes and says it is restored', async () => {
    del.mockResolvedValue(undefined)
    restore.mockResolvedValue(row)
    const { user, invalidate } = setup()
    await chooseDelete(user)
    invalidate.mockClear()
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Restored to the top level.')).toBeInTheDocument()
    expect(restore).toHaveBeenCalledExactlyOnceWith('b-1')
    expect(invalidate).toHaveBeenCalledTimes(2)
  })

  it('an Undo that fails says it could not undo', async () => {
    del.mockResolvedValue(undefined)
    restore.mockRejectedValue(problem(404, 'not_found'))
    const { user } = setup()
    await chooseDelete(user)
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByText("Couldn't undo. It may have been changed elsewhere.")).toBeInTheDocument()
  })

  it.each([
    ['409 in trash', problem(409, 'bookmark_in_trash'), 'It was already in the trash.'],
    ['404', problem(404, 'not_found'), 'That bookmark no longer exists.'],
    ['429', new ApiError(429, null, 4), 'Too many requests. Try again in about 4 seconds.'],
    ['network', new TypeError('x'), "Couldn't move it to the trash."],
  ])('%s: shows its toast and refreshes', async (_name, error, message) => {
    del.mockRejectedValue(error)
    const { user, invalidate } = setup()
    await chooseDelete(user)
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(invalidate).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('401: a logged-out toast whose Log in goes to the login link', async () => {
    del.mockRejectedValue(new ApiError(401, null, null))
    const { user } = setup()
    await chooseDelete(user)
    expect(await screen.findByText("You're logged out.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(goTo).toHaveBeenCalledTimes(1)
    expect(vi.mocked(goTo).mock.calls[0][0]).toMatch(/return_to=%2F$/)
  })
})

describe('BookmarkRow edit', () => {
  it('opens the dialog prefilled from the row and saves only what changed', async () => {
    update.mockResolvedValue(row)
    const { user, invalidate } = setup()
    await user.click(actionsButton())
    await user.click(await screen.findByRole('menuitem', { name: 'Edit title & note' }))
    const title = await screen.findByLabelText('Title')
    expect(title).toHaveValue('A page')
    expect(screen.getByLabelText('Note')).toHaveValue('my note')
    await user.type(title, '!')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith('b-1', { title: 'A page!' }))
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(invalidate).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit bookmark' })).not.toBeInTheDocument())
  })

  it('shows a failure inside the dialog, which stays open, and forgets it when closed', async () => {
    update.mockRejectedValue(problem(404, 'not_found'))
    const { user } = setup()
    await user.click(actionsButton())
    await user.click(await screen.findByRole('menuitem', { name: 'Edit title & note' }))
    await user.type(await screen.findByLabelText('Title'), '!')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This bookmark no longer exists.')
    expect(screen.getByLabelText('Title')).toHaveValue('A page!')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit bookmark' })).not.toBeInTheDocument())
    await user.click(actionsButton())
    await user.click(await screen.findByRole('menuitem', { name: 'Edit title & note' }))
    await screen.findByLabelText('Title')
    expect(screen.getByLabelText('Title')).toHaveValue('A page')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
