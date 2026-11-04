import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { setReducedMotion } from '../../test/viewport'
import { Drawer } from './Drawer'

function Harness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Drawer
        open={open}
        title="Menu"
        onClose={() => {
          onClose()
          setOpen(false)
        }}
      >
        <a href="/x">Inside</a>
      </Drawer>
    </>
  )
}

async function open() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Open' }))
  await screen.findByRole('dialog', { name: 'Menu' })
  return user
}

describe('Drawer', () => {
  it('is named by its hidden title and holds its children', async () => {
    render(<Harness />)
    await open()
    expect(screen.getByRole('dialog', { name: 'Menu' })).toContainElement(screen.getByRole('link', { name: 'Inside' }))
  })

  it('puts focus on Close menu, keeps it inside on Tab, and calls onClose once for Close menu', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const user = await open()
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus()
    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Open', hidden: true })).not.toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
  })

  it('turns the slide on by default', async () => {
    render(<Harness />)
    await open()
    expect(screen.getByRole('dialog')).toHaveClass('drawer--animated')
    expect(document.querySelector('.drawer-backdrop')).toHaveClass('drawer--animated')
  })

  it('applies no animation class under reduced motion', async () => {
    setReducedMotion(true)
    render(<Harness />)
    await open()
    expect(screen.getByRole('dialog')).not.toHaveClass('drawer--animated')
    expect(document.querySelector('.drawer-backdrop')).not.toHaveClass('drawer--animated')
  })
})
