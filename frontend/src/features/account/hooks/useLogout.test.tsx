import { act, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import { logout as requestLogout } from '../../../lib/api/auth'
import { suppressLoginRedirect } from '../../../lib/api/loginRedirect'
import { goTo } from '../../../lib/goTo'
import { hookWrapper } from '../../../test/hookWrapper'
import { testClient } from '../../../test/wrap'
import { useLogout } from './useLogout'

vi.mock('../../../lib/api/auth', () => ({ logout: vi.fn() }))
vi.mock('../../../lib/api/loginRedirect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/loginRedirect')>()),
  suppressLoginRedirect: vi.fn(),
}))
vi.mock('../../../lib/goTo', () => ({ goTo: vi.fn() }))

const URL_OK = 'https://id.example/logout?x=1'

function setup(path = '/') {
  const client = testClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const view = renderHook(() => useLogout(), { wrapper: hookWrapper(client, path) })
  return { ...view, invalidate }
}

const tone = (text: string) => screen.getByText(text).closest('.toast')

beforeEach(() => {
  vi.mocked(requestLogout).mockReset()
  vi.mocked(goTo).mockReset()
  vi.mocked(suppressLoginRedirect).mockReset()
})

describe('useLogout', () => {
  it('on 200 goes to the URL once, shows no toast and stays disabled', async () => {
    let finish: (v: { logout_url: string }) => void = () => {}
    vi.mocked(requestLogout).mockReturnValue(new Promise((r) => (finish = r)))
    const { result, invalidate } = setup()
    expect(result.current.disabled).toBe(false)
    let run: Promise<void> = Promise.resolve()
    act(() => {
      run = result.current.logout()
    })
    expect(result.current.disabled).toBe(true)
    expect(goTo).not.toHaveBeenCalled()
    await act(async () => {
      finish({ logout_url: URL_OK })
      await run
    })
    expect(goTo).toHaveBeenCalledTimes(1)
    expect(goTo).toHaveBeenCalledWith(URL_OK)
    expect(result.current.disabled).toBe(true)
    expect(document.querySelector('.toast')).toBeNull()
    expect(invalidate).not.toHaveBeenCalled()
  })

  it.each(['', 'javascript:alert(1)'])('goes to / for the bad logout_url %j', async (bad) => {
    vi.mocked(requestLogout).mockResolvedValue({ logout_url: bad })
    const { result } = setup()
    await act(() => result.current.logout())
    expect(goTo).toHaveBeenCalledTimes(1)
    expect(goTo).toHaveBeenCalledWith('/')
  })

  it('sends nothing for a second logout in flight or after a success', async () => {
    let finish: (v: { logout_url: string }) => void = () => {}
    vi.mocked(requestLogout).mockReturnValue(new Promise((r) => (finish = r)))
    const { result } = setup()
    let first: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.logout()
    })
    await act(() => result.current.logout())
    expect(requestLogout).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish({ logout_url: URL_OK })
      await first
    })
    await act(() => result.current.logout())
    expect(requestLogout).toHaveBeenCalledTimes(1)
    expect(goTo).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['403', new ApiError(403, null, null)],
    ['501', new ApiError(501, null, null)],
    ['500', new ApiError(500, null, null)],
    ['a network error', new TypeError('Failed to fetch')],
  ])('toasts "Couldn\'t log out." on %s and re-enables', async (_name, error) => {
    vi.mocked(requestLogout).mockRejectedValue(error)
    const { result, invalidate } = setup()
    await act(() => result.current.logout())
    expect(tone("Couldn't log out.")).toHaveClass('toast--error')
    expect(goTo).not.toHaveBeenCalled()
    expect(result.current.disabled).toBe(false)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('words a 429 from Retry-After and re-enables', async () => {
    vi.mocked(requestLogout).mockRejectedValue(new ApiError(429, null, 3))
    const { result } = setup()
    await act(() => result.current.logout())
    expect(tone('Too many requests. Try again in about 3 seconds.')).toHaveClass('toast--error')
    expect(result.current.disabled).toBe(false)
  })

  it('on 401 toasts with a Log in action back to the current location', async () => {
    vi.mocked(requestLogout).mockRejectedValue(new ApiError(401, null, null))
    const { result } = setup('/trash?x=1')
    await act(() => result.current.logout())
    expect(tone("You're logged out.")).toHaveClass('toast--error')
    expect(result.current.disabled).toBe(false)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Log in' }))
    expect(goTo).toHaveBeenCalledTimes(1)
    const href = vi.mocked(goTo).mock.calls[0][0]
    expect(href).toContain(encodeURIComponent('/trash?x=1'))
    expect(href).toContain('return_to=')
  })

  it('works again after a failure', async () => {
    vi.mocked(requestLogout)
      .mockRejectedValueOnce(new ApiError(500, null, null))
      .mockResolvedValueOnce({ logout_url: URL_OK })
    const { result } = setup()
    await act(() => result.current.logout())
    await act(() => result.current.logout())
    expect(requestLogout).toHaveBeenCalledTimes(2)
    expect(goTo).toHaveBeenCalledWith(URL_OK)
  })

  it('suppresses the login redirect right before goTo on a 200, for a URL and for the / fallback', async () => {
    const order: string[] = []
    vi.mocked(suppressLoginRedirect).mockImplementation(() => void order.push('suppress'))
    vi.mocked(goTo).mockImplementation(() => void order.push('goTo'))
    vi.mocked(requestLogout).mockResolvedValueOnce({ logout_url: URL_OK })
    const first = setup()
    await act(() => first.result.current.logout())
    expect(order).toEqual(['suppress', 'goTo'])
    first.unmount()
    order.length = 0
    vi.mocked(requestLogout).mockResolvedValueOnce({ logout_url: '' })
    const second = setup()
    await act(() => second.result.current.logout())
    expect(order).toEqual(['suppress', 'goTo'])
    expect(goTo).toHaveBeenLastCalledWith('/')
  })

  it.each([
    new ApiError(401, null, null),
    new ApiError(403, null, null),
    new ApiError(429, null, 3),
    new ApiError(500, null, null),
    new TypeError('Failed to fetch'),
  ])('does not suppress the login redirect on a failure (%s)', async (error) => {
    vi.mocked(requestLogout).mockRejectedValue(error)
    const { result } = setup()
    await act(() => result.current.logout())
    expect(suppressLoginRedirect).not.toHaveBeenCalled()
  })
})
