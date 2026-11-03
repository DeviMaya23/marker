import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../../../lib/api/ApiError'
import { createBookmark } from '../../../lib/api/bookmarks'
import { AddUrlForm } from './AddUrlForm'

vi.mock('../../../lib/api/bookmarks', () => ({ createBookmark: vi.fn() }))

const created = { id: 'new-1' } as Awaited<ReturnType<typeof createBookmark>>

function problem(status: number, code: ProblemBody['code'], extra: Partial<ProblemBody> = {}) {
  return new ApiError(status, { type: 'about:blank', title: 't', status, code, ...extra }, null)
}

function renderForm() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AddUrlForm />} />
        <Route path="/bookmarks/:id" element={<p>bookmark page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

const input = () => screen.getByLabelText('Link to save')
const button = () => screen.getByRole('button', { name: /^Sav/ })

describe('AddUrlForm', () => {
  beforeEach(() => {
    vi.mocked(createBookmark).mockReset()
  })

  describe('submitting', () => {
    it('disables the button while the URL is empty or only spaces', async () => {
      const user = renderForm()
      expect(button()).toBeDisabled()
      await user.type(input(), '   ')
      expect(button()).toBeDisabled()
      await user.type(input(), 'https://a.test')
      expect(button()).toBeEnabled()
    })

    it('saves on Enter and goes to the new bookmark', async () => {
      vi.mocked(createBookmark).mockResolvedValue(created)
      const user = renderForm()
      await user.type(input(), '  https://a.test/x?y=1&z=2#f {Enter}')
      expect(createBookmark).toHaveBeenCalledWith({ url: 'https://a.test/x?y=1&z=2#f' })
      expect(await screen.findByText('bookmark page')).toBeInTheDocument()
    })

    it('saves when the button is clicked', async () => {
      vi.mocked(createBookmark).mockResolvedValue(created)
      const user = renderForm()
      await user.type(input(), 'https://a.test')
      await user.click(button())
      expect(await screen.findByText('bookmark page')).toBeInTheDocument()
    })

    it('does nothing on Enter with an empty field', async () => {
      const user = renderForm()
      await user.type(input(), '{Enter}')
      expect(createBookmark).not.toHaveBeenCalled()
    })

    it('disables the button and saves once while the request is in flight', async () => {
      let resolve: (b: typeof created) => void = () => {}
      vi.mocked(createBookmark).mockReturnValue(new Promise((r) => (resolve = r)))
      const user = renderForm()
      await user.type(input(), 'https://a.test{Enter}{Enter}')
      expect(createBookmark).toHaveBeenCalledTimes(1)
      expect(button()).toBeDisabled()
      resolve(created)
      await screen.findByText('bookmark page')
    })
  })

  describe('failures', () => {
    it.each([
      [
        'a live duplicate',
        problem(409, 'duplicate_bookmark', { existing_bookmark_id: 'old-9', in_trash: false }),
        'This link is already saved.',
      ],
      [
        'a trashed duplicate',
        problem(409, 'duplicate_bookmark', { existing_bookmark_id: 'old-9', in_trash: true }),
        'This link is in your trash.',
      ],
      ['an invalid url', problem(422, 'invalid_url'), 'Only http and https links can be saved.'],
      [
        'a url that is too long',
        problem(422, 'validation_error', { errors: [{ field: 'url', code: 'too_long' }] }),
        'That URL is too long. The limit is 2,048 characters.',
      ],
      [
        'the bookmark limit',
        problem(409, 'bookmark_limit_reached'),
        "You're at the 1,000 bookmark limit. Empty the trash or delete some bookmarks first.",
      ],
      ['a rate limit', problem(429, 'rate_limited'), 'Too many saves. Try again in a moment.'],
      ['a server error', new ApiError(500, null, null), "Couldn't save that link."],
      ['a network failure', new TypeError('Failed to fetch'), "Couldn't save that link."],
    ])('shows the message for %s and keeps what was typed', async (_name, error, message) => {
      vi.mocked(createBookmark).mockRejectedValue(error)
      const user = renderForm()
      await user.type(input(), 'https://a.test/keep-me{Enter}')

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(input()).toHaveValue('https://a.test/keep-me')
      expect(button()).toBeEnabled()
    })

    it('puts an invalid-url message under the field', async () => {
      vi.mocked(createBookmark).mockRejectedValue(problem(422, 'invalid_url'))
      const user = renderForm()
      await user.type(input(), 'ftp://a.test{Enter}')
      const alert = await screen.findByRole('alert')
      expect(input()).toHaveAccessibleDescription('Only http and https links can be saved.')
      expect(alert).toHaveClass('field__error')
    })

    it.each([
      ['a live duplicate', false],
      ['a trashed duplicate', true],
    ])('links %s to the existing bookmark', async (_name, inTrash) => {
      vi.mocked(createBookmark).mockRejectedValue(
        problem(409, 'duplicate_bookmark', { existing_bookmark_id: 'old-9', in_trash: inTrash }),
      )
      const user = renderForm()
      await user.type(input(), 'https://a.test{Enter}')
      const link = await screen.findByRole('link', { name: 'Open it' })
      expect(link).toHaveAttribute('href', '/bookmarks/old-9')
      await user.click(link)
      expect(await screen.findByText('bookmark page')).toBeInTheDocument()
    })

    it('shows the signed-out message on a 401 and keeps the input', async () => {
      vi.mocked(createBookmark).mockRejectedValue(problem(401, 'unauthenticated'))
      const user = renderForm()
      await user.type(input(), 'https://a.test{Enter}')
      expect(await screen.findByText("You're logged out. Log in to continue.")).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument()
      expect(input()).toHaveValue('https://a.test')
    })

    it('clears the message when the user edits the field', async () => {
      vi.mocked(createBookmark).mockRejectedValue(new ApiError(500, null, null))
      const user = renderForm()
      await user.type(input(), 'https://a.test{Enter}')
      await screen.findByRole('alert')
      await user.type(input(), 'x')
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    })
  })
})
