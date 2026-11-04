import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildFolderTree } from '../../../lib/folders/buildFolderTree'
import { folder } from '../../../test/builders'
import { renderApp } from '../../../test/wrap'
import { FolderTree } from './FolderTree'

const items = [
  folder({ id: 'a', name: 'Recipes', depth: 1, bookmark_count: 1 }),
  folder({ id: 'b', name: 'Soups', parent_id: 'a', depth: 2, bookmark_count: 2 }),
  folder({ id: 'c', name: 'Winter', parent_id: 'b', depth: 3, bookmark_count: 0 }),
  folder({ id: 'd', name: 'Empty', depth: 1, bookmark_count: 0 }),
]

function setup(path = '/', data = items) {
  const actions = { onNewSubfolder: vi.fn(), onRename: vi.fn(), onDelete: vi.fn() }
  renderApp(<FolderTree nodes={buildFolderTree(data).roots} {...actions} />, { path })
  return { user: userEvent.setup(), ...actions }
}

const link = (name: string) => screen.getByRole('link', { name })

describe('FolderTree', () => {
  it('shows every folder expanded by default, each a link to its page', () => {
    setup()
    for (const [name, id] of [['Recipes', 'a'], ['Soups', 'b'], ['Winter', 'c'], ['Empty', 'd']]) {
      expect(link(name)).toHaveAttribute('href', `/folder/${id}`)
    }
    expect(screen.getByRole('button', { name: 'Collapse Recipes' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('the chevron collapses and expands, and its label and aria-expanded follow', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Collapse Recipes' }))
    const expand = screen.getByRole('button', { name: 'Expand Recipes' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Soups' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Winter' })).not.toBeInTheDocument()
    await user.click(expand)
    expect(screen.getByRole('button', { name: 'Collapse Recipes' })).toHaveAttribute('aria-expanded', 'true')
    expect(link('Winter')).toBeInTheDocument()
  })

  it('a folder without children has no chevron button', () => {
    setup()
    expect(screen.queryByRole('button', { name: /Collapse Empty|Expand Empty|Collapse Winter/ })).not.toBeInTheDocument()
  })

  it('indents one step per level', () => {
    setup()
    const indent = (name: string) => link(name).closest<HTMLElement>('.folder-row')?.style.paddingLeft
    expect(indent('Recipes')).toBe('calc(var(--space-3) * 0)')
    expect(indent('Soups')).toBe('calc(var(--space-3) * 1)')
    expect(indent('Winter')).toBe('calc(var(--space-3) * 2)')
  })

  it('shows each subtree count and hides it at 0', () => {
    setup()
    const count = (name: string) => link(name).closest('.folder-row')?.querySelector('.folder-row__count')
    expect(count('Recipes')).toHaveTextContent('3')
    expect(count('Soups')).toHaveTextContent('2')
    expect(count('Winter')).toBeNull()
    expect(count('Empty')).toBeNull()
  })

  it('carries the full name in title and cuts it in one line', () => {
    const long = 'A very long folder name that will not fit in the sidebar at all'
    setup('/', [folder({ id: 'x', name: long })])
    expect(link(long)).toHaveAttribute('title', long)
    expect(within(link(long)).getByText(long)).toHaveClass('folder-row__name')
  })

  it.each([
    ['a folder', '/folder/b', 'Soups'],
    ['another folder', '/folder/d', 'Empty'],
  ])('marks %s as the current page', (_label, path, name) => {
    setup(path)
    expect(link(name)).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')).toHaveLength(1)
  })

  it('marks nothing on another page', () => {
    setup('/trash')
    expect(screen.getAllByRole('link').some((l) => l.hasAttribute('aria-current'))).toBe(false)
  })

  it('the row menu holds New subfolder, Rename, Delete in order, and no Move to…', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Actions for folder Recipes' }))
    const labels = (await screen.findAllByRole('menuitem')).map((i) => i.textContent)
    expect(labels).toEqual(['New subfolder', 'Rename', 'Delete'])
    expect(screen.queryByText(/Move to/)).not.toBeInTheDocument()
  })

  it.each([
    ['depth 1', 'Recipes', false],
    ['depth 2', 'Soups', false],
    ['depth 3', 'Winter', true],
  ])('New subfolder at %s: disabled is %s', async (_label, name, disabled) => {
    const { user, onNewSubfolder } = setup()
    await user.click(screen.getByRole('button', { name: `Actions for folder ${name}` }))
    const item = await screen.findByRole('menuitem', { name: 'New subfolder' })
    if (disabled) {
      expect(item).toHaveAttribute('aria-disabled', 'true')
      expect(item).toHaveAttribute('title', 'Folders can only be nested 3 levels deep.')
      await user.click(item)
      expect(onNewSubfolder).not.toHaveBeenCalled()
    } else {
      expect(item).not.toHaveAttribute('aria-disabled', 'true')
      await user.click(item)
      expect(onNewSubfolder).toHaveBeenCalledWith(expect.objectContaining({ name }))
    }
  })

  it('Rename and Delete call back with the folder', async () => {
    const { user, onRename, onDelete } = setup()
    await user.click(screen.getByRole('button', { name: 'Actions for folder Soups' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
    await user.click(screen.getByRole('button', { name: 'Actions for folder Empty' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'd' }))
  })

  it('renders a name as text, never as HTML', () => {
    setup('/', [folder({ id: 'x', name: '<img src=x onerror=alert(1)>' })])
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
  })
})
