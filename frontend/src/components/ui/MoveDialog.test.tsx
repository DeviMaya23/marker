import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/api/ApiError'
import type { Folder } from '../../lib/api/folders'
import { folder } from '../../test/builders'
import { testClient } from '../../test/wrap'
import { DISABLED_ROW_TITLE, MoveDialog } from './MoveDialog'

const f = (id: string, parent: string | null, depth: number) => folder({ id, parent_id: parent, depth, name: `Name ${id}` })
// a(1) > b(2) > c(3);  d(1) > e(2);  g(1)
const FOLDERS = [f('a', null, 1), f('b', 'a', 2), f('c', 'b', 3), f('d', null, 1), f('e', 'd', 2), f('g', null, 1)]

type Props = Parameters<typeof MoveDialog>[0]

function props(over: Partial<Props> = {}): Props {
  return {
    open: true,
    itemName: 'My bookmark',
    currentLocation: null,
    folders: { items: FOLDERS, pending: false, error: null, retry: vi.fn() },
    working: false,
    failure: null,
    onConfirm: vi.fn().mockResolvedValue(true),
    onClose: vi.fn(),
    ...over,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={testClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

function show(p: Props) {
  const view = render(<MoveDialog {...p} />, { wrapper })
  return { ...view, again: (next: Props) => view.rerender(<MoveDialog {...next} />) }
}

const radio = (name: string) => screen.getByRole('radio', { name })
const moveButton = () => screen.getByRole('button', { name: /^Mov(e|ing…)$/ })

describe('MoveDialog', () => {
  it('names what is moving, says moves cannot be undone, and selects the current location', () => {
    show(props({ itemName: 'My bookmark', currentLocation: 'd' }))
    expect(screen.getByRole('dialog', { name: 'Move bookmark' })).toBeInTheDocument()
    expect(screen.getByText('My bookmark')).toHaveAttribute('title', 'My bookmark')
    expect(screen.getByText("Moves can't be undone.")).toBeInTheDocument()
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
    expect(radio('Name d')).toBeChecked()
    expect(radio('Top level')).not.toBeChecked()
  })

  it('titles a folder move "Move folder"', () => {
    show(props({ folder: FOLDERS[3], itemName: 'Name d' }))
    expect(screen.getByRole('dialog', { name: 'Move folder' })).toBeInTheDocument()
  })

  it('keeps Move disabled until another target is chosen, then sends that folder', async () => {
    const onConfirm = vi.fn().mockResolvedValue(true)
    const onClose = vi.fn()
    show(props({ currentLocation: 'a', onConfirm, onClose }))
    const user = userEvent.setup()
    expect(moveButton()).toBeDisabled()
    await user.click(radio('Name g'))
    expect(moveButton()).toBeEnabled()
    await user.click(radio('Name a'))
    expect(moveButton()).toBeDisabled()
    await user.click(radio('Name g'))
    await user.click(moveButton())
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(FOLDERS[5])
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('sends null for "Top level"', async () => {
    const onConfirm = vi.fn().mockResolvedValue(true)
    show(props({ currentLocation: 'a', onConfirm }))
    const user = userEvent.setup()
    await user.click(radio('Top level'))
    await user.click(moveButton())
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('stays open when the move fails (onConfirm resolves false)', async () => {
    const onClose = vi.fn()
    show(props({ currentLocation: 'a', onConfirm: vi.fn().mockResolvedValue(false), onClose }))
    const user = userEvent.setup()
    await user.click(radio('Top level'))
    await user.click(moveButton())
    expect(onClose).not.toHaveBeenCalled()
    expect(radio('Top level')).toBeChecked()
  })

  it('a bookmark move disables no row', () => {
    show(props())
    for (const r of screen.getAllByRole('radio')) {
      expect(r).not.toHaveAttribute('aria-disabled', 'true')
      expect(r).not.toBeDisabled()
    }
  })

  describe('moving a folder', () => {
    // d has one level of children: only a depth-1 row can host it; d and e are blocked.
    const moving = FOLDERS[3]

    it('disables the folder, its descendants and too-deep rows, with the reason as title', () => {
      show(props({ folder: moving, itemName: 'Name d', currentLocation: null }))
      for (const name of ['Name b', 'Name c', 'Name d', 'Name e']) {
        const r = radio(name)
        expect(r).toHaveAttribute('aria-disabled', 'true')
        expect(r.closest('[title]')).toHaveAttribute('title', DISABLED_ROW_TITLE)
      }
      for (const name of ['Top level', 'Name a', 'Name g']) expect(radio(name)).not.toHaveAttribute('aria-disabled', 'true')
    })

    it('cannot select a disabled row', async () => {
      const onConfirm = vi.fn()
      show(props({ folder: moving, currentLocation: null, onConfirm }))
      const user = userEvent.setup()
      await user.click(radio('Name e'))
      expect(radio('Name e')).not.toBeChecked()
      expect(radio('Top level')).toBeChecked()
      expect(moveButton()).toBeDisabled()
    })

    it('skips disabled rows with the arrow keys', async () => {
      show(props({ folder: moving, currentLocation: null }))
      const user = userEvent.setup()
      // Clicking the selected radio puts focus in the group without changing the selection.
      await user.click(radio('Top level'))
      expect(radio('Top level')).toHaveFocus()
      await user.keyboard('{ArrowDown}')
      await waitFor(() => expect(radio('Name a')).toBeChecked())
      await user.keyboard('{ArrowDown}')
      await waitFor(() => expect(radio('Name g')).toBeChecked())
      await user.keyboard('{ArrowUp}')
      await waitFor(() => expect(radio('Name a')).toBeChecked())
    })
  })

  it('shows loading text and keeps Move disabled', () => {
    show(props({ folders: { items: undefined, pending: true, error: null, retry: vi.fn() } }))
    expect(screen.getByText('Loading folders…')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(moveButton()).toBeDisabled()
  })

  it('shows a failed list with a working Try again, and Move disabled', async () => {
    const retry = vi.fn()
    show(props({ folders: { items: undefined, pending: false, error: new ApiError(500, null, null), retry } }))
    expect(screen.getByText("Couldn't load your folders.")).toBeInTheDocument()
    expect(moveButton()).toBeDisabled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('shows the signed-out message in place of the list on a 401', () => {
    show(props({ folders: { items: undefined, pending: false, error: new ApiError(401, null, null), retry: vi.fn() } }))
    expect(screen.getByText("You're logged out. Log in to continue.")).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your folders.")).not.toBeInTheDocument()
    expect(moveButton()).toBeDisabled()
  })

  describe('closing', () => {
    it('Esc and Cancel close it', async () => {
      const onClose = vi.fn()
      show(props({ onClose }))
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onClose).toHaveBeenCalledTimes(1)
      await user.keyboard('{Escape}')
      expect(onClose).toHaveBeenCalledTimes(2)
    })

    it('the backdrop closes it', async () => {
      const onClose = vi.fn()
      show(props({ onClose }))
      await userEvent.setup().click(document.querySelector('.modal-overlay') as Element)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('while working, Esc and the backdrop do nothing, everything is disabled and the button says Moving…', async () => {
      const onClose = vi.fn()
      show(props({ working: true, currentLocation: 'a', onClose }))
      const user = userEvent.setup()
      await user.keyboard('{Escape}')
      await user.click(document.querySelector('.modal-overlay') as Element)
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Moving…' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      for (const r of screen.getAllByRole('radio')) expect(r).toHaveAttribute('aria-disabled', 'true')
    })

    it('a second click on Move while the first is unanswered sends nothing more', async () => {
      let finish: (ok: boolean) => void = () => {}
      const onConfirm = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)))
      show(props({ currentLocation: 'a', onConfirm }))
      const user = userEvent.setup()
      await user.click(radio('Top level'))
      await user.dblClick(moveButton())
      expect(onConfirm).toHaveBeenCalledTimes(1)
      finish(false)
    })
  })

  describe('a failure', () => {
    it('shows its message in an alert above the list, keeps the dialog and the selection', async () => {
      show(props({ currentLocation: 'a', failure: { signedOut: false, message: 'A folder with this name already exists there.' } }))
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent('A folder with this name already exists there.')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(radio('Name a')).toBeChecked()
      const user = userEvent.setup()
      await user.click(radio('Name g'))
      expect(radio('Name g')).toBeChecked()
      expect(within(screen.getByRole('dialog')).getByRole('alert')).toBeInTheDocument()
    })

    it('shows the signed-out message for a 401', () => {
      show(props({ failure: { signedOut: true, message: "You're logged out." } }))
      expect(screen.getByText("You're logged out. Log in to continue.")).toBeInTheDocument()
    })
  })

  describe('opening again and a list that changes', () => {
    it('starts from the current location, not from the earlier selection', async () => {
      const first = props({ currentLocation: 'a' })
      const { again } = show(first)
      const user = userEvent.setup()
      await user.click(radio('Name g'))
      again({ ...first, open: false })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      again({ ...first, open: true })
      expect(await screen.findByRole('radio', { name: 'Name a' })).toBeChecked()
    })

    it('falls back to "Top level" when the current location is gone from the list', () => {
      const first = props({ currentLocation: 'g' })
      const { again } = show(first)
      expect(radio('Name g')).toBeChecked()
      again({ ...first, folders: { ...first.folders, items: FOLDERS.filter((x) => x.id !== 'g') } })
      expect(radio('Top level')).toBeChecked()
      expect(moveButton()).toBeEnabled()
    })

    it('falls back to "Top level" and does not crash when the folder being moved is gone', async () => {
      const moving = FOLDERS[3]
      const first = props({ folder: moving, itemName: 'Name d', currentLocation: 'a' })
      const { again } = show(first)
      await userEvent.setup().click(radio('Name g'))
      again({ ...first, folders: { ...first.folders, items: FOLDERS.filter((x) => x.id !== 'd' && x.id !== 'e') } })
      expect(radio('Top level')).toBeChecked()
      expect(moveButton()).toBeEnabled()
    })

    it('stays disabled when the current location is the top level and it is gone-proof', () => {
      const first = props({ currentLocation: null })
      const { again } = show(first)
      again({ ...first, folders: { ...first.folders, items: [] as Folder[] } })
      expect(radio('Top level')).toBeChecked()
      expect(moveButton()).toBeDisabled()
    })
  })

  it('lists 30 folders and keeps a 100-character name whole in its title', async () => {
    const long = 'n'.repeat(100)
    const many = Array.from({ length: 30 }, (_, i) => folder({ id: `f${i}`, depth: 1, name: i === 29 ? long : `Folder ${i}` }))
    const onConfirm = vi.fn().mockResolvedValue(true)
    show(props({ folders: { items: many, pending: false, error: null, retry: vi.fn() }, onConfirm }))
    expect(screen.getAllByRole('radio')).toHaveLength(31)
    expect(screen.getByText(long)).toHaveAttribute('title', long)
    await userEvent.click(radio(long))
    await userEvent.click(moveButton())
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ id: 'f29' }))
  })

  it('renders names as text, not HTML', () => {
    const hostile = folder({ id: 'x', name: '<img src=x onerror=alert(1)>' })
    show(props({ folders: { items: [hostile], pending: false, error: null, retry: vi.fn() } }))
    expect(radio('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })
})
