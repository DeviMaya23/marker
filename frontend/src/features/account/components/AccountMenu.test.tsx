import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import { logout } from '../../../lib/api/auth'
import { goTo } from '../../../lib/goTo'
import { renderApp } from '../../../test/wrap'
import { AccountMenu } from './AccountMenu'

vi.mock('../../../lib/api/auth', () => ({ logout: vi.fn() }))
vi.mock('../../../lib/goTo', () => ({ goTo: vi.fn() }))

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

function setup(path = '/') {
  const onNavigate = vi.fn()
  renderApp(
    <>
      <AccountMenu onNavigate={onNavigate} />
      <Where />
    </>,
    { path },
  )
  return { onNavigate, user: userEvent.setup(), trigger: screen.getByRole('button', { name: 'Account & help' }) }
}

const noMenu = () => waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())

beforeEach(() => {
  vi.mocked(logout).mockReset()
  vi.mocked(goTo).mockReset()
})

describe('AccountMenu', () => {
  it('has a sidebar__top-link trigger and lists its two items once opened', async () => {
    const { user, trigger } = setup()
    expect(trigger).toHaveClass('sidebar__top-link')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await user.click(trigger)
    await screen.findByRole('menu')
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Account & help', 'Log out'])
    expect(screen.getByRole('menuitem', { name: 'Account & help' })).not.toHaveAttribute('href')
  })

  it.each(['/', '/account'])('"Account & help" goes to /account from %s through the router', async (path) => {
    const { user, trigger, onNavigate } = setup(path)
    await user.click(trigger)
    await user.click(await screen.findByRole('menuitem', { name: 'Account & help' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/account')
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(goTo).not.toHaveBeenCalled()
    await noMenu()
  })

  it('"Log out" logs out once, does not call onNavigate and closes', async () => {
    vi.mocked(logout).mockResolvedValue({ logout_url: 'https://id.example/out' })
    const { user, trigger, onNavigate } = setup()
    await user.click(trigger)
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }))
    expect(logout).toHaveBeenCalledTimes(1)
    expect(onNavigate).not.toHaveBeenCalled()
    await noMenu()
  })

  it('is disabled while pending, enabled after a failure and disabled after a success', async () => {
    let fail: (e: unknown) => void = () => {}
    vi.mocked(logout).mockReturnValueOnce(new Promise((_, reject) => (fail = reject)))
    const { user, trigger } = setup()
    await user.click(trigger)
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }))
    await waitFor(() => expect(trigger).toBeDisabled())
    await act(async () => fail(new ApiError(500, null, null)))
    await waitFor(() => expect(trigger).toBeEnabled())

    vi.mocked(logout).mockResolvedValueOnce({ logout_url: 'https://id.example/out' })
    await user.click(trigger)
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledTimes(1))
    expect(trigger).toBeDisabled()
  })

  it('opens on Enter, reaches Log out with ArrowDown and closes on Esc with focus back', async () => {
    const { user, trigger } = setup()
    trigger.focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('menu')
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Account & help' })).toHaveFocus())
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus()
    await user.keyboard('{Escape}')
    await noMenu()
    expect(trigger).toHaveFocus()
  })
})
