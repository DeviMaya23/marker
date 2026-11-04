import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api/ApiError'
import { listFolders } from '../lib/api/folders'
import { folder } from '../test/builders'
import { renderApp } from '../test/wrap'
import { AppShell } from './AppShell'

vi.mock('../lib/api/folders', () => ({ listFolders: vi.fn() }))
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
