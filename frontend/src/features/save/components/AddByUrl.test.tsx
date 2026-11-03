import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import * as bookmarks from '../../../lib/api/bookmarks'
import type { BookmarkSummary, ProblemBody } from '../../../lib/api/types'
import { AddByUrl } from './AddByUrl'

vi.mock('../../../lib/api/bookmarks')
const createBookmark = vi.mocked(bookmarks.createBookmark)

function problem(status: number, body: Partial<ProblemBody>, retryAfter: number | null = null) {
  return new ApiError(status, { type: 'about:blank', title: 't', status, ...body } as ProblemBody, retryAfter)
}

function Where() {
  return <p>at {useLocation().pathname}</p>
}

function setup() {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AddByUrl />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
  return { user, input: screen.getByLabelText('URL'), button: screen.getByRole('button', { name: 'Save' }) }
}

beforeEach(() => {
  createBookmark.mockReset()
})

describe('AddByUrl', () => {
  it('disables Save while the URL is empty', async () => {
    const { user, input, button } = setup()
    expect(button).toBeDisabled()
    await user.type(input, 'https://a.test')
    expect(button).toBeEnabled()
    await user.clear(input)
    expect(button).toBeDisabled()
  })

  it('saves on Enter and goes to the new bookmark', async () => {
    createBookmark.mockResolvedValue({ id: 'new-id' } as BookmarkSummary)
    const { user, input } = setup()
    await user.type(input, 'https://a.test/x{Enter}')
    expect(createBookmark).toHaveBeenCalledWith({ url: 'https://a.test/x' })
    expect(await screen.findByText('at /bookmarks/new-id')).toBeInTheDocument()
  })

  it('disables Save while the request is in flight and sends once', async () => {
    createBookmark.mockReturnValue(new Promise(() => {}))
    const { user, input, button } = setup()
    await user.type(input, 'https://a.test{Enter}')
    await user.keyboard('{Enter}')
    expect(button).toBeDisabled()
    expect(createBookmark).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['an invalid url', problem(422, { code: 'invalid_url' }), 'Only http and https links can be saved.'],
    ['a too long url', problem(422, { code: 'validation_error', errors: [{ field: 'url', code: 'too_long' }] }), 'The URL is too long (limit 2,048 characters).'],
    ['the limit', problem(409, { code: 'bookmark_limit_reached' }), "You're at the 1,000 bookmark limit. Empty the trash or delete some bookmarks first."],
    ['a rate limit', problem(429, { code: 'rate_limited' }), 'Too many saves. Try again in a moment.'],
    ['a server error', new ApiError(500, null, null), "Couldn't save that link."],
  ])('shows the message for %s and keeps the input', async (_name, error, message) => {
    createBookmark.mockRejectedValue(error)
    const { user, input, button } = setup()
    await user.type(input, 'ftp://bad{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(input).toHaveValue('ftp://bad')
    expect(button).toBeEnabled()
  })

  it.each([
    ['live', false, 'This link is already saved.'],
    ['trashed', true, 'This link is in your trash.'],
  ])('links to the existing bookmark for a %s duplicate', async (_name, inTrash, message) => {
    createBookmark.mockRejectedValue(problem(409, { code: 'duplicate_bookmark', in_trash: inTrash, existing_bookmark_id: 'old-id' }))
    const { user, input } = setup()
    await user.type(input, 'https://a.test{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('link', { name: 'Open it' })).toHaveAttribute('href', '/bookmarks/old-id')
    expect(input).toHaveValue('https://a.test')
  })

  it('shows the signed-out message on a 401', async () => {
    createBookmark.mockRejectedValue(new ApiError(401, null, null))
    const { user, input } = setup()
    await user.type(input, 'https://a.test{Enter}')
    expect(await screen.findByText("You're logged out. Log in to continue.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument()
    expect(input).toHaveValue('https://a.test')
  })
})
