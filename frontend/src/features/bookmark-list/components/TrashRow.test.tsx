import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../../../lib/api/ApiError'
import { restoreBookmark } from '../../../lib/api/bookmarks'
import { goTo } from '../../../lib/goTo'
import { bookmark } from '../../../test/builders'
import { renderApp } from '../../../test/wrap'
import { TrashRow } from './TrashRow'

vi.mock('../../../lib/api/bookmarks', () => ({ restoreBookmark: vi.fn() }))
vi.mock('../../../lib/goTo', () => ({ goTo: vi.fn() }))

const restore = vi.mocked(restoreBookmark)
const problem = (status: number, code: string) =>
  new ApiError(status, { type: 'x', title: 't', status, code } as ProblemBody, null)
const trashed = bookmark({ id: 't-1', title: 'Gone', url: 'https://example.com/g', deleted_at: '2026-01-02T00:00:00Z' })

function setup() {
  const view = renderApp(<TrashRow bookmark={trashed} />)
  return { ...view, invalidate: vi.spyOn(view.client, 'invalidateQueries') }
}

beforeEach(() => {
  restore.mockReset()
  vi.mocked(goTo).mockReset()
})

describe('TrashRow', () => {
  it('has an Open original link to a new tab and a Restore button', () => {
    setup()
    const link = screen.getByRole('link', { name: 'Open original link' })
    expect(link).toHaveAttribute('href', 'https://example.com/g')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
  })

  it('restores once, refreshes and says so; the button is disabled meanwhile', async () => {
    let finish: () => void = () => {}
    restore.mockImplementation(() => new Promise((resolve) => (finish = () => resolve(trashed))))
    const { invalidate } = setup()
    const button = screen.getByRole('button', { name: 'Restore' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(restore).toHaveBeenCalledExactlyOnceWith('t-1')
    finish()
    expect(await screen.findByText('Restored to the top level.')).toBeInTheDocument()
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([['bookmark-list'], ['bookmark', 't-1']])
    expect(button).toBeEnabled()
  })

  it.each([
    ['409 not in trash', problem(409, 'bookmark_not_in_trash'), 'It was already restored.'],
    ['404', problem(404, 'not_found'), 'That bookmark no longer exists.'],
    ['429', new ApiError(429, null, null), 'Too many requests. Try again in a moment.'],
    ['network', new TypeError('x'), "Couldn't restore it."],
  ])('%s: shows its toast and refreshes', async (_name, error, message) => {
    restore.mockRejectedValue(error)
    const { invalidate } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(invalidate).toHaveBeenCalledTimes(2)
  })

  it('401: the logged-out toast with a Log in action', async () => {
    restore.mockRejectedValue(new ApiError(401, null, null))
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(await screen.findByText("You're logged out.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(goTo).toHaveBeenCalledTimes(1)
  })
})
