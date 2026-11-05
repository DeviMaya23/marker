import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../../lib/api/ApiError'
import { updateBookmark, type BookmarkChanges } from '../../lib/api/bookmarks'
import { describeFailure, type FailureDisplay } from '../../lib/bookmarks/describeFailure'
import { useEditBookmark } from '../../lib/bookmarks/useEditBookmark'
import { renderApp } from '../../test/wrap'
import { EditBookmarkDialog } from './EditBookmarkDialog'

vi.mock('../../lib/api/bookmarks', () => ({ updateBookmark: vi.fn() }))

type HarnessProps = {
  title?: string
  note?: string | null
  onSave?: (changes: BookmarkChanges) => Promise<boolean>
  saving?: boolean
  failure?: FailureDisplay | null
}

function Harness({ title = 'Stored', note = 'stored note', onSave = async () => true, saving, failure = null }: HarnessProps) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState({ title, note })
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <button onClick={() => setCurrent({ title: 'Changed elsewhere', note: null })}>Change stored</button>
      <EditBookmarkDialog
        open={open}
        title={current.title}
        note={current.note}
        onClose={() => setOpen(false)}
        onSave={onSave}
        saving={saving ?? false}
        failure={failure}
      />
    </>
  )
}

async function open(props: HarnessProps = {}) {
  renderApp(<Harness {...props} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Open' }))
  await screen.findByRole('dialog', { name: 'Edit bookmark' })
  return user
}

const titleField = () => screen.getByLabelText('Title')
const noteField = () => screen.getByLabelText('Note')
const save = () => screen.getByRole('button', { name: 'Save' })

/** Sets a long value at once; typing 500 characters one by one is slow. */
function setValue(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } })
}

describe('EditBookmarkDialog fields', () => {
  it('opens prefilled, with the title focused, counters and the note placeholder', async () => {
    await open({ title: 'Stored', note: 'stored note' })
    expect(titleField()).toHaveValue('Stored')
    await waitFor(() => expect(titleField()).toHaveFocus())
    expect(noteField()).toHaveValue('stored note')
    expect(noteField()).toHaveAttribute('rows', '4')
    expect(screen.getByText('6/300')).toBeInTheDocument()
    expect(screen.getByText('11/500')).toBeInTheDocument()
  })

  it('shows the placeholder for a missing note', async () => {
    await open({ note: null })
    expect(noteField()).toHaveValue('')
    expect(noteField()).toHaveAttribute('placeholder', 'Optional note…')
  })

  it('starts with Save disabled and enables it once something changes', async () => {
    const user = await open()
    expect(save()).toBeDisabled()
    await user.type(titleField(), 'x')
    expect(save()).toBeEnabled()
    await user.type(titleField(), '{Backspace}')
    expect(save()).toBeDisabled()
  })

  it.each([
    [300, true],
    [301, false],
  ])('a title of %i characters: Save enabled is %s', async (n, enabled) => {
    await open()
    setValue(titleField(), 'a'.repeat(n))
    expect(save().hasAttribute('disabled')).toBe(!enabled)
    expect(screen.queryByText('Title is too long (300 characters at most).') !== null).toBe(!enabled)
    expect(screen.getByText(`${n}/300`)).toBeInTheDocument()
  })

  it.each([
    [500, true],
    [501, false],
  ])('a note of %i characters: Save enabled is %s', async (n, enabled) => {
    await open()
    setValue(noteField(), 'n'.repeat(n))
    expect(save().hasAttribute('disabled')).toBe(!enabled)
    expect(screen.queryByText('Note is too long (500 characters at most).') !== null).toBe(!enabled)
  })

  it('counts an emoji once, and does not use maxLength', async () => {
    await open()
    setValue(titleField(), '😀'.repeat(300))
    expect(save()).toBeEnabled()
    expect(screen.getByText('300/300')).toBeInTheDocument()
    setValue(titleField(), '😀'.repeat(301))
    expect(save()).toBeDisabled()
    expect(titleField()).not.toHaveAttribute('maxlength')
    expect(noteField()).not.toHaveAttribute('maxlength')
  })
})

describe('EditBookmarkDialog saving', () => {
  it.each([
    ['title only', 'Stored!', 'stored note', { title: 'Stored!' }],
    ['note only', 'Stored', 'other', { note: 'other' }],
    ['both', 'T2', 'N2', { title: 'T2', note: 'N2' }],
    ['a trimmed title', '  T2  ', 'stored note', { title: 'T2' }],
    ['an emptied note', 'Stored', '', { note: null }],
    ['a spaces-only note', 'Stored', '   ', { note: null }],
  ])('sends only %s', async (_name, title, note, expected) => {
    const onSave = vi.fn().mockResolvedValue(true)
    await open({ onSave })
    setValue(titleField(), title)
    setValue(noteField(), note)
    fireEvent.click(save())
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith(expected)
  })

  it('sends nothing for a title changed only by surrounding spaces, nor for an empty note on a bookmark without one', async () => {
    const user = await open({ note: null })
    setValue(titleField(), ' Stored ')
    setValue(noteField(), '  ')
    expect(save()).toBeDisabled()
    await user.type(titleField(), '{Enter}')
  })

  it('submits with Enter in the title, and closes when saved', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    const user = await open({ onSave })
    await user.type(titleField(), '!{Enter}')
    expect(onSave).toHaveBeenCalledWith({ title: 'Stored!' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('does not submit with Enter when nothing changed', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    const user = await open({ onSave })
    await user.type(titleField(), '{Enter}')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('stays open when saving fails, keeping what was typed', async () => {
    const onSave = vi.fn().mockResolvedValue(false)
    const user = await open({ onSave })
    await user.type(titleField(), '!{Enter}')
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(titleField()).toHaveValue('Stored!')
  })

  it('discards the edits on Esc and on Cancel', async () => {
    const onSave = vi.fn()
    const user = await open({ onSave })
    await user.type(titleField(), 'zzz')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Open' }))
    await screen.findByRole('dialog')
    expect(titleField()).toHaveValue('Stored')
    await user.type(titleField(), 'yyy')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onSave).not.toHaveBeenCalled()
  })

  it('reopens from the current values of the bookmark', async () => {
    const user = await open()
    await user.type(titleField(), 'zzz')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Change stored' }))
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await screen.findByRole('dialog')
    expect(titleField()).toHaveValue('Changed elsewhere')
    expect(noteField()).toHaveValue('')
  })

  it('a second Enter while saving sends nothing more', async () => {
    let finish: (ok: boolean) => void = () => {}
    const onSave = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)))
    const user = await open({ onSave })
    await user.type(titleField(), '!')
    fireEvent.submit(titleField().closest('form') as HTMLFormElement)
    fireEvent.submit(titleField().closest('form') as HTMLFormElement)
    expect(onSave).toHaveBeenCalledTimes(1)
    finish(false)
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  })
})

describe('EditBookmarkDialog while saving', () => {
  it('disables the fields and both buttons, and ignores Esc', async () => {
    const user = await open({ saving: true })
    expect(titleField()).toBeDisabled()
    expect(noteField()).toBeDisabled()
    expect(save()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('EditBookmarkDialog failures', () => {
  const problem = (status: number, code: string, extra: Partial<ProblemBody> = {}) =>
    new ApiError(status, { type: 'x', title: 't', status, code, ...extra } as ProblemBody, null)

  it('puts a title error under the title and a note error under the note', async () => {
    const failure = describeFailure(
      problem(422, 'validation_error', { errors: [{ field: 'title', code: 'too_long' }, { field: 'note', code: 'too_long' }] } as Partial<ProblemBody>),
      'edit',
    )
    await open({ failure })
    expect(titleField().parentElement).toHaveTextContent('Title is too long (300 characters at most).')
    expect(noteField().parentElement).toHaveTextContent('Note is too long (500 characters at most).')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['409 in trash', problem(409, 'bookmark_in_trash'), "This bookmark is in the trash and can't be edited."],
    ['404', problem(404, 'not_found'), 'This bookmark no longer exists.'],
    ['429', new ApiError(429, null, 5), 'Too many requests. Try again in about 5 seconds.'],
    ['network', new TypeError('x'), "Couldn't save your changes."],
  ])('shows %s in a banner with role alert, keeping the fields', async (_name, error, message) => {
    await open({ failure: describeFailure(error, 'edit') })
    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(titleField()).toHaveValue('Stored')
  })

})

function EditHarness() {
  const edit = useEditBookmark('b-1')
  return (
    <EditBookmarkDialog
      open
      title="Stored"
      note={null}
      onClose={() => {}}
      onSave={edit.save}
      saving={edit.pending}
      failure={edit.failure}
    />
  )
}

describe('EditBookmarkDialog with the real save', () => {
  it('a 401 shows no banner and no text, and the dialog stays usable', async () => {
    vi.mocked(updateBookmark).mockRejectedValue(new ApiError(401, null, null))
    renderApp(<EditHarness />)
    const user = userEvent.setup()
    await user.type(titleField(), 'x')
    await user.click(save())
    await waitFor(() => expect(updateBookmark).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(save()).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/logged out|Log in|Couldn't save/)).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit bookmark' })).toBeInTheDocument()
    expect(titleField()).toHaveValue('Storedx')
    expect(titleField()).toBeEnabled()
  })
})
