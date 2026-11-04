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

describe('SidebarContent account menu', () => {
  it('shows a menu button after the folder section and no account link', () => {
    renderApp(<SidebarContent />, { path: '/account' })
    expect(screen.queryByRole('link', { name: 'Account & help' })).not.toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: 'Account & help' })
    const folders = screen.getByText('Folders')
    expect(folders.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('calls onNavigate once when "Account & help" is chosen from the menu', async () => {
    const onNavigate = vi.fn()
    renderApp(<SidebarContent onNavigate={onNavigate} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Account & help' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Account & help' }))
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })
})
