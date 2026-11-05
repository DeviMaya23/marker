import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import { deleteAccount } from '../../../lib/api/account'
import { renderApp } from '../../../test/wrap'
import { DeleteAccountSection } from './DeleteAccountSection'

vi.mock('../../../lib/api/account', () => ({ deleteAccount: vi.fn() }))
const del = vi.mocked(deleteAccount)

const dialog = () => screen.queryByRole('dialog', { name: 'Delete your account?' })
const field = () => screen.getByRole('textbox')
const confirm = () => within(dialog() as HTMLElement).getByRole('button', { name: 'Delete my account' })
const cancel = () => within(dialog() as HTMLElement).getByRole('button', { name: 'Cancel' })

async function openDialog() {
  const onDeleted = vi.fn()
  renderApp(<DeleteAccountSection onDeleted={onDeleted} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Delete account' }))
  await screen.findByRole('dialog', { name: 'Delete your account?' })
  return { user, onDeleted }
}

beforeEach(() => {
  del.mockReset()
})

describe('DeleteAccountSection', () => {
  it('describes the deletion and opens a dialog with the field focused and confirm disabled', async () => {
    renderApp(<DeleteAccountSection onDeleted={vi.fn()} />)
    expect(
      screen.getByText(
        'Permanently erases all of your bookmarks, notes, folders and trash. There are no backups. Your login at the identity provider is not deleted.',
      ),
    ).toBeInTheDocument()
    expect(dialog()).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete account' }))
    await screen.findByRole('dialog', { name: 'Delete your account?' })
    expect(field()).toHaveAttribute('id', 'delete-account-confirm')
    await waitFor(() => expect(field()).toHaveFocus())
    expect(
      screen.getByText(
        "This permanently erases every bookmark, note, folder and everything in the trash. There are no backups and this can't be undone. Your login at the identity provider is not deleted.",
      ),
    ).toBeInTheDocument()
    expect(confirm()).toBeDisabled()
  })

  it.each([
    ['delete', false],
    ['delete my account please', false],
    ['delete  my account', false],
    ['', false],
    ['delete my account', true],
    [' Delete My Account ', true],
  ])('with %j the confirm button is enabled: %s, and Enter sends only then', async (typed, enabled) => {
    del.mockResolvedValue(undefined)
    const { user } = await openDialog()
    if (typed) await user.type(field(), typed)
    if (enabled) expect(confirm()).toBeEnabled()
    else expect(confirm()).toBeDisabled()
    await user.type(field(), '{Enter}')
    await waitFor(() => expect(del).toHaveBeenCalledTimes(enabled ? 1 : 0))
  })

  it('calls onDeleted once, after the request resolved, and closes the dialog', async () => {
    let finish: () => void = () => {}
    del.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    const { user, onDeleted } = await openDialog()
    await user.type(field(), 'delete my account')
    await user.click(confirm())
    expect(del).toHaveBeenCalledTimes(1)
    expect(onDeleted).not.toHaveBeenCalled()
    finish()
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(dialog()).not.toBeInTheDocument()
    expect(del).toHaveBeenCalledTimes(1)
  })

  it('locks the dialog while the request runs and ignores a second Enter', async () => {
    let finish: () => void = () => {}
    del.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    const { user, onDeleted } = await openDialog()
    await user.type(field(), 'delete my account')
    await user.click(confirm())
    await waitFor(() => expect(field()).toBeDisabled())
    expect(cancel()).toBeDisabled()
    expect(confirm()).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(dialog()).toBeInTheDocument()
    fireEvent.submit(field())
    expect(del).toHaveBeenCalledTimes(1)
    finish()
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
  })

  it.each([
    ['a 429', new ApiError(429, null, 7), 'Too many requests. Try again in about 7 seconds.'],
    ['a 500', new ApiError(500, null, null), "Couldn't delete your account."],
    ['a network error', new TypeError('offline'), "Couldn't delete your account."],
  ])('keeps the dialog open and the text after %s', async (_name, error, shown) => {
    del.mockImplementation(() => Promise.reject(error))
    const { user, onDeleted } = await openDialog()
    await user.type(field(), 'delete my account')
    await user.click(confirm())
    expect(await within(dialog() as HTMLElement).findByText(shown)).toBeInTheDocument()
    expect(field()).toHaveValue('delete my account')
    expect(confirm()).toBeEnabled()
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('a 401 shows no message and leaves the dialog usable', async () => {
    del.mockImplementation(() => Promise.reject(new ApiError(401, null, null)))
    const { user, onDeleted } = await openDialog()
    await user.type(field(), 'delete my account')
    await user.click(confirm())
    await waitFor(() => expect(del).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(confirm()).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/logged out|Log in|Couldn't delete/)).not.toBeInTheDocument()
    expect(dialog()).toBeInTheDocument()
    expect(field()).toHaveValue('delete my account')
    expect(field()).toBeEnabled()
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('closes on Cancel and on Esc without a request, and reopens clean', async () => {
    del.mockImplementation(() => Promise.reject(new ApiError(500, null, null)))
    const { user } = await openDialog()
    await user.type(field(), 'delete my account')
    await user.click(confirm())
    await screen.findByText("Couldn't delete your account.")
    await user.click(cancel())
    expect(dialog()).not.toBeInTheDocument()
    expect(del).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Delete account' }))
    await screen.findByRole('dialog', { name: 'Delete your account?' })
    expect(field()).toHaveValue('')
    expect(screen.queryByText("Couldn't delete your account.")).not.toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    expect(del).toHaveBeenCalledTimes(1)
  })

  it('sends one request on a double click of confirm', async () => {
    let finish: () => void = () => {}
    del.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    const { user, onDeleted } = await openDialog()
    await user.type(field(), 'delete my account')
    await user.dblClick(confirm())
    expect(del).toHaveBeenCalledTimes(1)
    finish()
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
  })

  it('retries after a 429 and succeeds, with the old failure gone while it runs', async () => {
    let finish: () => void = () => {}
    del.mockImplementationOnce(() => Promise.reject(new ApiError(429, null, 3)))
    del.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))
    const { user, onDeleted } = await openDialog()
    await user.type(field(), 'delete my account')
    await user.click(confirm())
    await screen.findByText('Too many requests. Try again in about 3 seconds.')
    await user.click(confirm())
    await waitFor(() => expect(del).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(/Too many requests/)).not.toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
    finish()
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(dialog()).not.toBeInTheDocument()
  })
})
