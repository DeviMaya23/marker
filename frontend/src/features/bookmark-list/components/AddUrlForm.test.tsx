import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../../../lib/api/ApiError'
import { createBookmark, listBookmarks } from '../../../lib/api/bookmarks'
import { page } from '../../../test/builders'
import { AddUrlForm } from './AddUrlForm'
import { BookmarkList } from './BookmarkList'

vi.mock('../../../lib/api/bookmarks', () => ({ createBookmark: vi.fn(), listBookmarks: vi.fn() }))

const created = { id: 'new-1' } as Awaited<ReturnType<typeof createBookmark>>

function problem(status: number, code: ProblemBody['code'], extra: Partial<ProblemBody> = {}) {
  return new ApiError(status, { type: 'about:blank', title: 't', status, code, ...extra }, null)
}

let client: QueryClient

function renderForm() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <AddUrlForm />
                <BookmarkList />
              </>
            }
          />
          <Route path="/bookmarks/:id" element={<p>bookmark page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const input = () => screen.getByLabelText('Link to save')
const button = () => screen.getByRole('button', { name: /^Sav/ })

describe('AddUrlForm', () => {
  beforeEach(() => {
    vi.mocked(createBookmark).mockReset()
    vi.mocked(listBookmarks).mockReset()
    vi.mocked(listBookmarks).mockResolvedValue(page([]))
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

    it('saves on Enter, clears the field, refetches the list and stays on the page', async () => {
      vi.mocked(createBookmark).mockResolvedValue(created)
      const user = renderForm()
      await screen.findByText('No bookmarks yet')
      expect(listBookmarks).toHaveBeenCalledTimes(1)

      await user.type(input(), '  https://a.test/x?y=1&z=2#f {Enter}')
      expect(createBookmark).toHaveBeenCalledWith({ url: 'https://a.test/x?y=1&z=2#f' })
      await waitFor(() => expect(input()).toHaveValue(''))
      await waitFor(() => expect(listBookmarks).toHaveBeenCalledTimes(2))
      expect(screen.queryByText('bookmark page')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Link to save')).toBeInTheDocument()
    })

    it('refreshes the folder list (the sidebar counts) after a successful save', async () => {
      vi.mocked(createBookmark).mockResolvedValue(created)
      const user = renderForm()
      const invalidate = vi.spyOn(client, 'invalidateQueries')
      await user.type(input(), 'https://a.test{Enter}')
      await waitFor(() => expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toContainEqual(['folders']))
    })

    it('does not refresh the folder list after a failed save', async () => {
      vi.mocked(createBookmark).mockRejectedValue(problem(409, 'duplicate_bookmark'))
      const user = renderForm()
      const invalidate = vi.spyOn(client, 'invalidateQueries')
      await user.type(input(), 'https://a.test{Enter}')
      await screen.findByRole('alert')
      expect(invalidate).not.toHaveBeenCalled()
    })

    it('saves when the button is clicked', async () => {
      vi.mocked(createBookmark).mockResolvedValue(created)
      const user = renderForm()
      await user.type(input(), 'https://a.test')
      await user.click(button())
      await waitFor(() => expect(input()).toHaveValue(''))
      expect(createBookmark).toHaveBeenCalledTimes(1)
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
      await waitFor(() => expect(input()).toHaveValue(''))
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
      ['a folder that was deleted meanwhile', problem(404, 'not_found'), 'That folder no longer exists.'],
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

    it('shows nothing on a 401, keeps the input and lets the user type again', async () => {
      vi.mocked(createBookmark).mockRejectedValue(problem(401, 'unauthenticated'))
      const user = renderForm()
      await user.type(input(), 'https://a.test{Enter}')
      await waitFor(() => expect(createBookmark).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(input()).toBeEnabled())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByText(/logged out|Couldn't save/)).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
      expect(input()).toHaveValue('https://a.test')
      await user.type(input(), 'x')
      expect(input()).toHaveValue('https://a.testx')
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

describe('AddUrlForm in a folder', () => {
  beforeEach(() => {
    vi.mocked(createBookmark).mockReset()
    vi.mocked(createBookmark).mockResolvedValue(created)
  })

  it.each([
    ['with a folder id', 'f-1', { url: 'https://a.test', folder_id: 'f-1' }],
    ['without one', undefined, { url: 'https://a.test' }],
  ])('saves %s', async (_label, folderId, request) => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <AddUrlForm folderId={folderId} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const user = userEvent.setup()
    await user.type(input(), 'https://a.test')
    await user.click(button())
    await waitFor(() => expect(createBookmark).toHaveBeenCalledExactlyOnceWith(request))
    expect(vi.mocked(createBookmark).mock.calls[0][0]).toEqual(request)
    if (folderId === undefined) expect(vi.mocked(createBookmark).mock.calls[0][0]).not.toHaveProperty('folder_id')
  })
})
