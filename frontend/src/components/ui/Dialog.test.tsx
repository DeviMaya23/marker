import { useRef, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'

function Harness({ busy = false, onClose = vi.fn() }: { busy?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog
        open={open}
        title="Edit it"
        busy={busy}
        initialFocus={field}
        onClose={() => {
          onClose()
          setOpen(false)
        }}
        footer={<button>Save</button>}
      >
        <input aria-label="first" />
        <input aria-label="second" ref={field} />
      </Dialog>
    </>
  )
}

async function open() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Open' }))
  await screen.findByRole('dialog', { name: 'Edit it' })
  return user
}

/** The backdrop is the dialog's outside: a click on it is an outside press. */
function clickBackdrop() {
  const backdrop = document.querySelector('.modal-overlay')
  if (!backdrop) throw new Error('no backdrop')
  fireEvent.pointerDown(backdrop)
  fireEvent.mouseDown(backdrop)
  fireEvent.pointerUp(backdrop)
  fireEvent.mouseUp(backdrop)
  fireEvent.click(backdrop)
}

describe('Dialog', () => {
  it('is named by its title and focuses the marked field, not the first one', async () => {
    render(<Harness />)
    await open()
    expect(screen.getByRole('dialog', { name: 'Edit it' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('second')).toHaveFocus())
  })

  it('closes on Esc and gives focus back to the opener', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const user = await open()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
  })

  it('closes on a backdrop click', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await open()
    clickBackdrop()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores Esc and the backdrop while busy', async () => {
    const onClose = vi.fn()
    render(<Harness busy onClose={onClose} />)
    const user = await open()
    await user.keyboard('{Escape}')
    clickBackdrop()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
