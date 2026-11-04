import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Menu } from './Menu'

function setup() {
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(
    <>
      <button>outside</button>
      <Menu
        label="Actions"
        items={[
          { key: 'open', label: 'Open link', href: 'https://example.com/x' },
          { key: 'edit', label: 'Edit', onSelect: onEdit },
          { key: 'delete', label: 'Delete', onSelect: onDelete, danger: true },
        ]}
      >
        …
      </Menu>
    </>,
  )
  return { user: userEvent.setup(), onEdit, onDelete, button: screen.getByRole('button', { name: 'Actions' }) }
}

const items = () => screen.getAllByRole('menuitem')

describe('Menu', () => {
  it('toggles on the button, and aria-expanded follows', async () => {
    const { user, button } = setup()
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-expanded', 'true')
    await user.click(button)
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('lists the items in order, the link opening in a new tab safely', async () => {
    const { user, button } = setup()
    await user.click(button)
    await screen.findByRole('menu')
    expect(items().map((i) => i.textContent)).toEqual(['Open link', 'Edit', 'Delete'])
    const link = screen.getByRole('menuitem', { name: 'Open link' })
    expect(link).toHaveAttribute('href', 'https://example.com/x')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('closes on Esc and returns focus to the button', async () => {
    const { user, button } = setup()
    await user.click(button)
    await screen.findByRole('menu')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(button).toHaveFocus()
  })

  it('moves with Down, Up, Home and End', async () => {
    const { user, button } = setup()
    button.focus()
    await user.keyboard('{ArrowDown}')
    await screen.findByRole('menu')
    await waitFor(() => expect(items()[0]).toHaveFocus())
    await user.keyboard('{ArrowDown}')
    expect(items()[1]).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(items()[0]).toHaveFocus()
    await user.keyboard('{End}')
    expect(items()[2]).toHaveFocus()
    await user.keyboard('{Home}')
    expect(items()[0]).toHaveFocus()
  })

  it('closes on a click outside', async () => {
    const { user, button } = setup()
    await user.click(button)
    await screen.findByRole('menu')
    await user.click(screen.getByRole('button', { name: 'outside' }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('runs the chosen item and closes', async () => {
    const { user, button, onEdit, onDelete } = setup()
    await user.click(button)
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onDelete).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })
})
