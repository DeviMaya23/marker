import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { FolderFailure } from '../../../lib/folders/folderFailureMessage'
import { renderApp } from '../../../test/wrap'
import { FolderFormDialog } from './FolderFormDialog'

type HarnessProps = {
  mode?: 'create' | 'rename'
  parentName?: string
  initialName?: string
  saving?: boolean
  failure?: FolderFailure | null
  onSubmit?: (name: string) => Promise<boolean>
  onEdit?: () => void
}

function Harness({
  mode = 'create',
  parentName,
  initialName = '',
  saving = false,
  failure = null,
  onSubmit = async () => true,
  onEdit = () => {},
}: HarnessProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <FolderFormDialog
        open={open}
        mode={mode}
        parentName={parentName}
        initialName={initialName}
        saving={saving}
        failure={failure}
        onSubmit={onSubmit}
        onEdit={onEdit}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

async function open(props: HarnessProps = {}) {
  const view = renderApp(<Harness {...props} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Open' }))
  await screen.findByRole('dialog')
  return { user, ...view }
}

const nameField = () => screen.getByLabelText('Name')
const saveButton = (label = 'Create') => screen.getByRole('button', { name: label })
const dialogGone = () => waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

describe('FolderFormDialog titles and fields', () => {
  it('New folder: empty field with its placeholder, focused, Create disabled, no message', async () => {
    await open()
    expect(screen.getByRole('dialog', { name: 'New folder' })).toBeInTheDocument()
    expect(nameField()).toHaveValue('')
    expect(nameField()).toHaveAttribute('placeholder', 'Folder name')
    expect(nameField()).toHaveFocus()
    expect(saveButton()).toBeDisabled()
    expect(screen.queryByText('Give the folder a name.')).not.toBeInTheDocument()
    expect(screen.getByText('0/100')).toBeInTheDocument()
  })

  it('New subfolder shows the parent under the title', async () => {
    await open({ parentName: 'Recipes' })
    expect(screen.getByRole('dialog', { name: 'New subfolder' })).toBeInTheDocument()
    expect(screen.getByText('In Recipes')).toBeInTheDocument()
  })

  it('Rename is prefilled; Save is disabled while unchanged and enabled for a case-only change', async () => {
    const { user } = await open({ mode: 'rename', initialName: 'Recipes' })
    expect(screen.getByRole('dialog', { name: 'Rename folder' })).toBeInTheDocument()
    expect(nameField()).toHaveValue('Recipes')
    expect(saveButton('Save')).toBeDisabled()
    await user.type(nameField(), '{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}recipes')
    expect(saveButton('Save')).toBeEnabled()
    await user.clear(nameField())
    await user.type(nameField(), '  Recipes  ')
    expect(saveButton('Save')).toBeDisabled()
  })

  it('starts from the current values each time it opens', async () => {
    const { user } = await open({ mode: 'rename', initialName: 'Recipes' })
    await user.type(nameField(), ' extra')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await dialogGone()
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(await screen.findByLabelText('Name')).toHaveValue('Recipes')
  })
})

describe('FolderFormDialog name rules', () => {
  it('sends the trimmed name', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const { user } = await open({ onSubmit })
    await user.type(nameField(), '   Recipes   ')
    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Recipes')
  })

  it('a spaces-only name disables Create and shows "Give the folder a name." once typed', async () => {
    const { user } = await open()
    await user.type(nameField(), '   ')
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('Give the folder a name.')).toBeInTheDocument()
  })

  it('clearing a rename field shows the message too', async () => {
    const { user } = await open({ mode: 'rename', initialName: 'Recipes' })
    await user.clear(nameField())
    expect(saveButton('Save')).toBeDisabled()
    expect(screen.getByText('Give the folder a name.')).toBeInTheDocument()
  })

  it.each([
    ['100 characters', 'a'.repeat(100), true, '100/100'],
    ['101 characters', 'a'.repeat(101), false, '101/100'],
    ['100 emoji (each counts once)', '😀'.repeat(100), true, '100/100'],
    ['101 emoji', '😀'.repeat(101), false, '101/100'],
  ])('%s', async (_name, text, allowed, counter) => {
    await open()
    fireEvent.change(nameField(), { target: { value: text } })
    expect(screen.getByText(counter)).toBeInTheDocument()
    expect(nameField()).not.toHaveAttribute('maxlength')
    if (allowed) {
      expect(saveButton()).toBeEnabled()
      expect(screen.queryByText('Name is too long (100 characters at most).')).not.toBeInTheDocument()
    } else {
      expect(saveButton()).toBeDisabled()
      expect(screen.getByText('Name is too long (100 characters at most).')).toBeInTheDocument()
    }
  })

  it('counts the trimmed name', async () => {
    await open()
    fireEvent.change(nameField(), { target: { value: `  ${'a'.repeat(100)}  ` } })
    expect(screen.getByText('100/100')).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })
})

describe('FolderFormDialog submitting', () => {
  it('Enter submits, and a successful save closes the dialog', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const { user } = await open({ onSubmit })
    await user.type(nameField(), 'Recipes{Enter}')
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Recipes')
    await dialogGone()
  })

  it('Enter does nothing while Create is disabled', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const { user } = await open({ onSubmit })
    await user.type(nameField(), '   {Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('a failed save keeps the dialog open and the typed name', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    const { user } = await open({ onSubmit })
    await user.type(nameField(), 'Recipes{Enter}')
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(nameField()).toHaveValue('Recipes')
  })

  it('a second Enter in the same tick sends nothing more', async () => {
    let finish: (saved: boolean) => void = () => {}
    const onSubmit = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)))
    await open({ onSubmit })
    fireEvent.change(nameField(), { target: { value: 'Recipes' } })
    fireEvent.submit(nameField())
    fireEvent.submit(nameField())
    expect(onSubmit).toHaveBeenCalledTimes(1)
    finish(false)
  })

  it('Esc and Cancel close and discard', async () => {
    const onSubmit = vi.fn()
    const { user } = await open({ onSubmit })
    await user.type(nameField(), 'Recipes')
    await user.keyboard('{Escape}')
    await dialogGone()
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(await screen.findByLabelText('Name')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await dialogGone()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('while saving: field and both buttons are disabled, Esc is ignored', async () => {
    const { user } = await open({ saving: true, initialName: 'Recipes', mode: 'rename' })
    expect(nameField()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(saveButton('Save')).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('returns focus to the opener when it closes', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await dialogGone()
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
  })
})

describe('FolderFormDialog failures', () => {
  const field: FolderFailure = { kind: 'field', message: 'A folder with this name already exists here.', refresh: false }
  const banner: FolderFailure = { kind: 'dialog', message: 'Folders can only be nested 3 levels deep.', refresh: false }

  it('a field failure sits under the name, keeps the text, and goes away when the user types', async () => {
    const onEdit = vi.fn()
    const { user } = await open({ failure: field, onEdit, initialName: 'Soups', mode: 'rename' })
    expect(screen.getByText(field.message).closest('.field')).toContainElement(nameField())
    expect(nameField()).toHaveValue('Soups')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.type(nameField(), 'x')
    expect(onEdit).toHaveBeenCalled()
  })

  it('a dialog failure is a banner with role alert, outside the field', async () => {
    await open({ failure: banner })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(banner.message)
    expect(alert.closest('.field')).toBeNull()
  })

  it('a signed-out failure shows the signed-out message', async () => {
    await open({ failure: { kind: 'signed-out', message: "You're logged out.", refresh: true } })
    expect(screen.getByText("You're logged out. Log in to continue.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument()
  })
})
