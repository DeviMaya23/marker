import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listFolders } from '../lib/api/folders'
import { renderApp } from '../test/wrap'
import { SidebarContent } from './SidebarContent'

vi.mock('../lib/api/folders', () => ({ listFolders: vi.fn() }))

beforeEach(() => {
  vi.mocked(listFolders).mockReset().mockResolvedValue({ items: [] })
})

describe('SidebarContent account link', () => {
  it('points to /account, comes after the folder section and is current only there', () => {
    renderApp(<SidebarContent />, { path: '/account' })
    const link = screen.getByRole('link', { name: 'Account & help' })
    expect(link).toHaveAttribute('href', '/account')
    expect(link).toHaveAttribute('aria-current', 'page')
    const folders = screen.getByText('Folders')
    expect(folders.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is not the current page at /', () => {
    renderApp(<SidebarContent />, { path: '/' })
    expect(screen.getByRole('link', { name: 'Account & help' })).not.toHaveAttribute('aria-current')
  })

  it('calls onNavigate once when clicked', async () => {
    const onNavigate = vi.fn()
    renderApp(<SidebarContent onNavigate={onNavigate} />)
    await userEvent.setup().click(screen.getByRole('link', { name: 'Account & help' }))
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })
})
