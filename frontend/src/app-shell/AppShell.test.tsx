/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useNavigate } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useToast } from '../components/ui/useToast'
import { ApiError } from '../lib/api/ApiError'
import { deleteFolder, listFolders } from '../lib/api/folders'
import { folder } from '../test/builders'
import { setViewport } from '../test/viewport'
import { renderApp } from '../test/wrap'
import { AppShell } from './AppShell'

vi.mock('../lib/api/folders', () => ({ listFolders: vi.fn(), createFolder: vi.fn(), deleteFolder: vi.fn() }))
const list = vi.mocked(listFolders)

beforeEach(() => {
  list.mockReset()
})

describe('AppShell', () => {
  it.each([
    ['loading', () => list.mockReturnValue(new Promise(() => {}))],
    ['loaded', () => list.mockResolvedValue({ items: [folder({ id: 'a', name: 'Recipes' })] })],
    ['empty', () => list.mockResolvedValue({ items: [] })],
    ['failed', () => list.mockRejectedValue(new TypeError('offline'))],
    ['signed out', () => list.mockRejectedValue(new ApiError(401, null, null))],
  ])('keeps the All bookmarks and Trash links when the folders are %s', async (_state, arrange) => {
    arrange()
    renderApp(<AppShell>content</AppShell>)
    expect(screen.getByRole('link', { name: 'All bookmarks' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Trash' })).toHaveAttribute('href', '/trash')
    await vi.waitFor(() => expect(list).toHaveBeenCalled())
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it.each([
    ['/', 'All bookmarks', 'Trash'],
    ['/trash', 'Trash', 'All bookmarks'],
  ])('at %s marks %s as the current page and not %s', (path, current, other) => {
    list.mockReturnValue(new Promise(() => {}))
    renderApp(<AppShell>content</AppShell>, { path })
    expect(screen.getByRole('link', { name: current })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: other })).not.toHaveAttribute('aria-current')
  })

  it('at /folder/:id marks neither top link', () => {
    list.mockReturnValue(new Promise(() => {}))
    renderApp(<AppShell>content</AppShell>, { path: '/folder/x' })
    expect(screen.getByRole('link', { name: 'All bookmarks' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Trash' })).not.toHaveAttribute('aria-current')
  })

  it('puts the app name, the two links and the Folders section in the sidebar, in that order', () => {
    list.mockReturnValue(new Promise(() => {}))
    renderApp(<AppShell>content</AppShell>)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const order = ['marker', 'All bookmarks', 'Trash', 'Folders']
    const text = nav.textContent ?? ''
    expect(order.map((s) => text.indexOf(s))).toEqual([...order.map((s) => text.indexOf(s))].sort((x, y) => x - y))
    expect(order.every((s) => text.includes(s))).toBe(true)
  })
})

const NARROW = 500
const folders = [folder({ id: 'a', name: 'Recipes', depth: 1 }), folder({ id: 'b', name: 'Other', depth: 1 })]

function Tools() {
  const navigate = useNavigate()
  const toast = useToast()
  return (
    <>
      <button onClick={() => void navigate('/trash')}>go trash</button>
      <button onClick={() => toast.show('Saved it')}>show toast</button>
    </>
  )
}

function narrow(path = '/') {
  setViewport(NARROW)
  list.mockResolvedValue({ items: folders })
  const view = renderApp(
    <AppShell>
      <Tools />
      content
    </AppShell>,
    { path },
  )
  return { user: userEvent.setup(), ...view }
}

// While the drawer is open the page behind it is hidden from the accessibility tree.
const menuButton = () => screen.getByRole('button', { name: 'Open menu', hidden: true })
const dialogs = () => screen.getAllByRole('dialog', { hidden: true })
// Under a dialog opened from inside it, the drawer is hidden from the accessibility tree and
// loses its name there, so it is found by its class.
const drawer = () => {
  const found = dialogs().find((d) => d.classList.contains('drawer-panel'))
  if (!found) throw new Error('the drawer is not open')
  return found
}
const trashLinks = () => screen.getAllByRole('link', { name: 'Trash' })

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(menuButton())
  await screen.findByRole('dialog', { name: 'Menu' })
}

// Vitest does not load CSS into the test, so the layering is read from the stylesheet itself.
const css = readFileSync(resolve(process.cwd(), 'src/styles/components.css'), 'utf8')

describe('AppShell layout', () => {
  beforeEach(() => list.mockResolvedValue({ items: folders }))

  it('wide: the sidebar is inline, with no top bar and no menu button', () => {
    renderApp(<AppShell>content</AppShell>)
    expect(screen.getByRole('complementary')).toContainElement(screen.getByRole('navigation', { name: 'Main' }))
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument()
  })

  it('narrow: a top bar with the app name and the menu button, no sidebar, the page', () => {
    narrow()
    const bar = screen.getByRole('banner')
    expect(within(bar).getByText('marker')).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Trash' })).not.toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('treats 767px as narrow and 768px as wide', () => {
    setViewport(767)
    const { unmount } = renderApp(<AppShell>content</AppShell>)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    unmount()
    setViewport(768)
    renderApp(<AppShell>content</AppShell>)
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
  })

  it('switches layouts as the viewport changes, keeping one Trash link', () => {
    renderApp(<AppShell>content</AppShell>)
    expect(trashLinks()).toHaveLength(1)
    setViewport(NARROW)
    expect(screen.queryByRole('link', { name: 'Trash' })).not.toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    setViewport(1200)
    expect(trashLinks()).toHaveLength(1)
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
  })
})

describe('AppShell drawer', () => {
  beforeEach(() => {
    list.mockReset()
    vi.mocked(deleteFolder).mockReset()
  })

  it('opens from the menu button with the sidebar content, mounted once', async () => {
    const { user } = narrow()
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    await openDrawer(user)
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true')
    const panel = within(drawer())
    expect(panel.getByText('marker')).toBeInTheDocument()
    expect(panel.getByRole('link', { name: 'All bookmarks' })).toBeInTheDocument()
    expect(panel.getByRole('heading', { name: 'Folders' })).toBeInTheDocument()
    expect(trashLinks()).toHaveLength(1)
    expect(await panel.findByRole('link', { name: /Recipes/ })).toBeInTheDocument()
  })

  it('focuses Close menu on open and gives focus back to Open menu on close', async () => {
    const { user } = narrow()
    await openDrawer(user)
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(menuButton()).toHaveFocus()
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Trash' })).not.toBeInTheDocument()
  })

  it('closes on Esc', async () => {
    const { user } = narrow()
    await openDrawer(user)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(menuButton()).toHaveFocus()
  })

  it('closes on a backdrop click', async () => {
    const { user } = narrow()
    await openDrawer(user)
    const backdrop = document.querySelector('.drawer-backdrop')
    if (!backdrop) throw new Error('no backdrop')
    fireEvent.pointerDown(backdrop)
    fireEvent.mouseDown(backdrop)
    fireEvent.pointerUp(backdrop)
    fireEvent.mouseUp(backdrop)
    fireEvent.click(backdrop)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it.each([
    ['All bookmarks', '/trash', '/'],
    ['Trash', '/', '/trash'],
    ['All bookmarks', '/', '/'],
    ['Trash', '/trash', '/trash'],
  ])('closes when %s is clicked (from %s)', async (name, from) => {
    const { user } = narrow(from)
    await openDrawer(user)
    await user.click(screen.getByRole('link', { name }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes when a folder is clicked, also the folder already open', async () => {
    const { user } = narrow('/folder/a')
    await openDrawer(user)
    await user.click(await within(drawer()).findByRole('link', { name: /Recipes/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes on a location change from outside', async () => {
    const { user } = narrow()
    await openDrawer(user)
    // The page behind the drawer is inert, so the navigation is triggered programmatically.
    fireEvent.click(screen.getByRole('button', { name: 'go trash', hidden: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes when the viewport becomes wide and shows the inline sidebar', async () => {
    const { user } = narrow()
    await openDrawer(user)
    setViewport(1000)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(trashLinks()).toHaveLength(1)
    setViewport(NARROW)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('stays open when a folder menu opens', async () => {
    const { user } = narrow()
    await openDrawer(user)
    await user.click(await screen.findByRole('button', { name: 'Actions for folder Recipes' }))
    await screen.findByRole('menuitem', { name: 'Rename' })
    expect(drawer()).toBeInTheDocument()
  })

  it.each([
    ['New folder', null],
    ['Rename', 'Recipes'],
    ['Move to…', 'Recipes'],
    ['Delete', 'Recipes'],
  ])('stays open under the %s dialog; Esc closes only the dialog and focus returns', async (item, folderName) => {
    const { user } = narrow()
    await openDrawer(user)
    let opener: HTMLElement
    if (folderName === null) {
      opener = screen.getByRole('button', { name: 'New folder' })
      await user.click(opener)
    } else {
      opener = await screen.findByRole('button', { name: `Actions for folder ${folderName}` })
      await user.click(opener)
      await user.click(await screen.findByRole('menuitem', { name: item }))
    }
    await waitFor(() => expect(dialogs()).toHaveLength(2))
    expect(drawer()).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(dialogs()).toHaveLength(1))
    expect(drawer()).toBeInTheDocument()
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('deleting the folder in view goes to / and closes the drawer', async () => {
    vi.mocked(deleteFolder).mockResolvedValue({ deleted_folders: 1, trashed_bookmarks: 0 })
    const { user } = narrow('/folder/a')
    await openDrawer(user)
    await user.click(await screen.findByRole('button', { name: 'Actions for folder Recipes' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Delete folder' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument())
    expect(screen.queryByText('Delete folder?')).not.toBeInTheDocument()
    expect(deleteFolder).toHaveBeenCalledWith('a')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps a dialog open and the drawer open when a dialog finishes elsewhere than the viewed folder', async () => {
    vi.mocked(deleteFolder).mockResolvedValue({ deleted_folders: 1, trashed_bookmarks: 0 })
    const { user } = narrow('/folder/a')
    await openDrawer(user)
    await user.click(await screen.findByRole('button', { name: 'Actions for folder Other' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Delete folder' }))
    await waitFor(() => expect(screen.queryByText('Delete folder?')).not.toBeInTheDocument())
    expect(deleteFolder).toHaveBeenCalledWith('b')
    expect(drawer()).toBeInTheDocument()
  })

  it('shows a toast outside the drawer, and layers the drawer below dialogs, menus and toasts', async () => {
    const { user } = narrow()
    await openDrawer(user)
    fireEvent.click(screen.getByRole('button', { name: 'show toast', hidden: true }))
    const toast = await screen.findByText('Saved it')
    expect(toast).toBeInTheDocument()
    expect(drawer()).not.toContainElement(toast)

    const z = (selector: string) => {
      const rule = new RegExp(`${selector.replace('.', '\\.')}\\s*\\{[^}]*z-index:\\s*(\\d+)`).exec(css)
      return Number(rule?.[1])
    }
    expect(z('.drawer-backdrop')).toBeLessThan(z('.modal-overlay'))
    expect(z('.drawer-panel')).toBeLessThan(z('.modal-center'))
    expect(z('.drawer-panel')).toBeLessThan(z('.dropdown-positioner'))
    expect(z('.drawer-panel')).toBeLessThan(z('.toast-region'))
    expect([z('.modal-overlay'), z('.dropdown-positioner'), z('.toast-region')]).toEqual([60, 70, 80])
  })

  it('survives opening and closing ten times', async () => {
    const { user } = narrow()
    for (let i = 0; i < 10; i++) {
      await user.click(menuButton())
      await screen.findByRole('dialog', { name: 'Menu' })
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    }
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    act(() => {})
  })
})
