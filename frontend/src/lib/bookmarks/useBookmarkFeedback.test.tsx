import { act, fireEvent, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/ApiError'
import { goTo } from '../goTo'
import { hookWrapper } from '../../test/hookWrapper'
import { testClient } from '../../test/wrap'
import { useBookmarkFeedback } from './useBookmarkFeedback'

vi.mock('../goTo', () => ({ goTo: vi.fn() }))

function setup(id?: string) {
  const client = testClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const setData = vi.spyOn(client, 'setQueryData')
  const hook = renderHook(() => useBookmarkFeedback(id), { wrapper: hookWrapper(client, '/bookmarks/b-1') })
  return { ...hook, invalidate, setData }
}

beforeEach(() => {
  vi.mocked(goTo).mockReset()
})

describe('useBookmarkFeedback', () => {
  it('refresh invalidates the lists and the one bookmark, and writes nothing to the cache', async () => {
    const { result, invalidate, setData } = setup('b-1')
    await act(() => result.current.refresh())
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([['bookmark-list'], ['bookmark', 'b-1']])
    expect(setData).not.toHaveBeenCalled()
  })

  it('refresh without an id invalidates every bookmark page', async () => {
    const { result, invalidate } = setup()
    await act(() => result.current.refresh())
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([['bookmark-list'], ['bookmark']])
  })

  it('a failure toast uses the neutral tone for "already done" and the error tone otherwise', async () => {
    const { result } = setup('b-1')
    act(() => void result.current.toastFailure(new TypeError('x'), 'restore'))
    expect(await screen.findByText("Couldn't restore it.")).toBeInTheDocument()
    expect(screen.getByText("Couldn't restore it.").closest('.toast')).toHaveClass('toast--error')
    act(() => void result.current.toastFailure(new ApiError(409, { type: 'x', title: 't', status: 409, code: 'bookmark_not_in_trash' }, null), 'restore'))
    expect(screen.getByText('It was already restored.').closest('.toast')).toHaveClass('toast--neutral')
  })

  it('a custom message replaces the text but keeps the error tone', async () => {
    const { result } = setup('b-1')
    act(() => void result.current.toastFailure(new ApiError(409, { type: 'x', title: 't', status: 409, code: 'bookmark_not_in_trash' }, null), 'restore', 'Custom.'))
    expect(screen.getByText('Custom.').closest('.toast')).toHaveClass('toast--error')
  })

  it('a 401 toast offers Log in, which goes to the login link for this page', async () => {
    const { result } = setup('b-1')
    act(() => void result.current.toastFailure(new ApiError(401, null, null), 'delete'))
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }))
    expect(vi.mocked(goTo).mock.calls[0][0]).toContain('return_to=%2Fbookmarks%2Fb-1')
  })

  it('does not refresh for a failure that changed nothing (a 422)', () => {
    const { result, invalidate } = setup('b-1')
    act(() => void result.current.toastFailure(new ApiError(422, { type: 'x', title: 't', status: 422, code: 'validation_error', errors: [{ field: 'title', code: 'too_long' }] }, null), 'edit'))
    expect(invalidate).not.toHaveBeenCalled()
  })
})
