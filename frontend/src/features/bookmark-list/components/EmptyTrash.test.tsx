import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import { emptyTrash, listBookmarks, type BookmarkSummary } from '../../../lib/api/bookmarks'
import { bookmark, page } from '../../../test/builders'
import { renderApp } from '../../../test/wrap'
import { EmptyTrash } from './EmptyTrash'

vi.mock('../../../lib/api/bookmarks', () => ({ listBookmarks: vi.fn(), emptyTrash: vi.fn() }))

const list = vi.mocked(listBookmarks)
const empty = vi.mocked(emptyTrash)

const items = (n: number): BookmarkSummary[] =>
  Array.from({ length: n }, (_, i) => bookmark({ id: `t-${i}`, deleted_at: '2026-01-02T00:00:00Z' }))

const button = () => screen.getByRole('button', { name: 'Empty trash' })
const dialog = () => screen.queryByRole('dialog', { name: 'Empty trash?' })
const field = () => screen.getByRole('textbox')
const confirm = () => within(dialog() as HTMLElement).getByRole('button', { name: 'Empty trash' })

async function openDialog(trash = page(items(3))) {
  list.mockResolvedValue(trash)
  const view = renderApp(<EmptyTrash />)
  const invalidate = vi.spyOn(view.client, 'invalidateQueries')
  await waitFor(() => expect(button()).toBeEnabled())
  const user = userEvent.setup()
  await user.click(button())
  await screen.findByRole('dialog', { name: 'Empty trash?' })
  return { ...view, invalidate, user }
}

beforeEach(() => {
  list.mockReset()
  empty.mockReset()
})

describe('Empty trash button', () => {
  it('is disabled while the trash loads', () => {
    list.mockReturnValue(new Promise(() => {}))
    renderApp(<EmptyTrash />)
    expect(button()).toBeDisabled()
  })

  it('is disabled when the trash is empty', async () => {
    list.mockResolvedValue(page([]))
    renderApp(<EmptyTrash />)
    await waitFor(() => expect(list).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(button()).toBeDisabled()
  })

  it.each([
    ['a failure', new ApiError(500, null, null)],
    ['a 401', new ApiError(401, null, null)],
  ])('is disabled after %s loading it', async (_name, error) => {
    list.mockRejectedValue(error)
    renderApp(<EmptyTrash />)
    await waitFor(() => expect(list).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(button()).toBeDisabled()
  })

  it('is enabled once there are bookmarks', async () => {
    list.mockResolvedValue(page(items(1)))
    renderApp(<EmptyTrash />)
    await waitFor(() => expect(button()).toBeEnabled())
  })
})

describe('Empty trash dialog text', () => {
  it.each([
    [1, "This permanently deletes 1 bookmark in the trash. This can't be undone."],
    [3, "This permanently deletes 3 bookmarks in the trash. This can't be undone."],
  ])('says the count for %i when the whole trash is loaded', async (n, text) => {
    await openDialog(page(items(n)))
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('gives no count when more pages exist', async () => {
    await openDialog(page(items(2), 'next'))
    expect(screen.getByText("This permanently deletes every bookmark in the trash. This can't be undone.")).toBeInTheDocument()
  })

  it('focuses the field on open', async () => {
    await openDialog()
    expect(field()).toHaveFocus()
  })
})

describe('Empty trash confirmation', () => {
  it('enables the confirm button only for the phrase, ignoring case and surrounding spaces', async () => {
    const { user } = await openDialog()
    expect(confirm()).toBeDisabled()
    await user.type(field(), 'empty tras')
    expect(confirm()).toBeDisabled()
    await user.type(field(), 'h')
    expect(confirm()).toBeEnabled()
    await user.clear(field())
    await user.type(field(), '  Empty Trash ')
    expect(confirm()).toBeEnabled()
    await user.clear(field())
    await user.type(field(), 'emptytrash')
    expect(confirm()).toBeDisabled()
  })

  it('closes on Esc and on Cancel, calling nothing', async () => {
    const { user } = await openDialog()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    await user.click(button())
    await screen.findByRole('dialog', { name: 'Empty trash?' })
    expect(field()).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    expect(empty).not.toHaveBeenCalled()
  })

  it('puts Cancel and confirm in the footer, outside the body that holds the field and the text', async () => {
    await openDialog()
    const footer = confirm().closest('.modal-footer')
    expect(footer).not.toBeNull()
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Cancel' }))
    expect(confirm().closest('.modal-body')).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel' }).closest('.modal-body')).toBeNull()
    const body = (dialog() as HTMLElement).querySelector('.modal-body') as HTMLElement
    expect(body).toContainElement(field())
    expect(body).toContainElement(screen.getByText(/This permanently deletes/))
  })

  it('submits on Enter only when the phrase matches', async () => {
    empty.mockResolvedValue({ deleted: 3 })
    const { user } = await openDialog()
    await user.type(field(), 'wrong{Enter}')
    expect(empty).not.toHaveBeenCalled()
    await user.clear(field())
    await user.type(field(), 'empty trash{Enter}')
    await waitFor(() => expect(empty).toHaveBeenCalledTimes(1))
  })

  it('shows an empty field when reopened after a successful empty', async () => {
    empty.mockResolvedValue({ deleted: 3 })
    const { user } = await openDialog()
    await user.type(field(), 'empty trash')
    await user.click(confirm())
    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    await waitFor(() => expect(button()).toBeEnabled())
    await user.click(button())
    await screen.findByRole('dialog', { name: 'Empty trash?' })
    expect(field()).toHaveValue('')
  })

  it('does nothing on the confirm button until the phrase is typed', async () => {
    await openDialog()
    fireEvent.click(confirm())
    expect(empty).not.toHaveBeenCalled()
  })

  it.each([
    [5, 'Permanently deleted 5 bookmarks.'],
    [1, 'Permanently deleted 1 bookmark.'],
    [0, 'The trash was already empty.'],
  ])('success with %i: refreshes, closes and toasts', async (deleted, message) => {
    empty.mockResolvedValue({ deleted })
    const { user, invalidate } = await openDialog()
    await user.type(field(), 'empty trash')
    await user.click(confirm())
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(empty).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toContainEqual(['bookmark-list'])
  })

  it('disables everything while working, ignores Esc, and sends once on a double click', async () => {
    let finish: () => void = () => {}
    empty.mockImplementation(() => new Promise((resolve) => (finish = () => resolve({ deleted: 3 }))))
    const { user } = await openDialog()
    await user.type(field(), 'empty trash')
    fireEvent.click(confirm())
    fireEvent.click(confirm())
    await waitFor(() => expect(field()).toBeDisabled())
    expect(confirm()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(dialog()).toBeInTheDocument()
    expect(field()).toHaveValue('empty trash')
    expect(empty).toHaveBeenCalledTimes(1)
    finish()
    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
  })

  it.each([
    ['429', new ApiError(429, null, 8), 'Too many requests. Try again in about 8 seconds.'],
    ['500', new ApiError(500, null, null), "Couldn't empty the trash."],
    ['network', new TypeError('x'), "Couldn't empty the trash."],
  ])('%s: keeps the dialog open with its message', async (_name, error, message) => {
    empty.mockRejectedValue(error)
    const { user } = await openDialog()
    await user.type(field(), 'empty trash')
    await user.click(confirm())
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(dialog()).toBeInTheDocument()
    expect(field()).toHaveValue('empty trash')
    expect(field()).toBeEnabled()
  })

  it('401: shows the signed-out message in the dialog', async () => {
    empty.mockRejectedValue(new ApiError(401, null, null))
    const { user } = await openDialog()
    await user.type(field(), 'empty trash')
    await user.click(confirm())
    expect(await screen.findByText("You're logged out. Log in to continue.")).toBeInTheDocument()
    expect(dialog()).toBeInTheDocument()
  })
})
