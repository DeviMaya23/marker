import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProblemBody } from '../../../lib/api/ApiError'
import { createBookmark } from '../../../lib/api/bookmarks'
import { SavePopup } from './SavePopup'

vi.mock('../../../lib/api/bookmarks', () => ({ createBookmark: vi.fn() }))

const created = { id: 'new-1' } as Awaited<ReturnType<typeof createBookmark>>

function problem(
  status: number,
  code: ProblemBody['code'],
  extra: Partial<ProblemBody> = {},
  retryAfter: number | null = null,
) {
  return new ApiError(status, { type: 'about:blank', title: 't', status, code, ...extra }, retryAfter)
}

function openPopup(search = '?url=https%3A%2F%2Fexample.com%2Fa&title=Example') {
  render(
    <MemoryRouter initialEntries={[`/save${search}`]}>
      <SavePopup />
    </MemoryRouter>,
  )
}

const saveButton = () => screen.getByRole('button', { name: /^Sav(e|ing)/ })
const titleInput = () => screen.getByLabelText('Title')

/** Presses Save and lets the (mocked) request settle. */
async function pressSave() {
  await act(async () => {
    fireEvent.click(saveButton())
  })
}

describe('SavePopup', () => {
  let closeSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(createBookmark).mockReset()
    closeSpy = vi.fn()
    vi.stubGlobal('close', closeSpy)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe('opening and the keyboard', () => {
    it('focuses Save on open and creates nothing', () => {
      openPopup()
      expect(saveButton()).toHaveFocus()
      expect(createBookmark).not.toHaveBeenCalled()
    })

    it('shows the URL read-only, the prefilled title, and a disabled folder picker with only "Top level"', () => {
      openPopup()
      expect(screen.getByText('https://example.com/a')).toBeInTheDocument()
      expect(titleInput()).toHaveValue('Example')
      const folder = screen.getByLabelText('Folder')
      expect(folder).toBeDisabled()
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Top level'])
    })

    it('saves on Enter', async () => {
      vi.mocked(createBookmark).mockResolvedValue(created)
      openPopup()
      await act(async () => {
        fireEvent.keyDown(saveButton(), { key: 'Enter' })
      })
      expect(createBookmark).toHaveBeenCalledTimes(1)
      expect(screen.getByText('Saved')).toBeInTheDocument()
    })

    it('saves on Enter typed in the title field', async () => {
      vi.mocked(createBookmark).mockResolvedValue(created)
      openPopup()
      await act(async () => {
        fireEvent.keyDown(titleInput(), { key: 'Enter' })
      })
      expect(createBookmark).toHaveBeenCalledTimes(1)
    })

    it('cancels on Esc', () => {
      openPopup()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(closeSpy).toHaveBeenCalledTimes(1)
      expect(createBookmark).not.toHaveBeenCalled()
    })

    it('presses Cancel, not Save, when Enter is pressed on Cancel', () => {
      openPopup()
      fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Enter' })
      expect(createBookmark).not.toHaveBeenCalled()
    })

    it.each(['Enter', 'Escape'])('dismisses an alert on %s instead of saving or closing', async (key) => {
      vi.mocked(createBookmark).mockRejectedValue(
        problem(409, 'duplicate_bookmark', { existing_bookmark_id: 'x', in_trash: false }),
      )
      openPopup()
      await pressSave()
      expect(screen.getByRole('alert')).toHaveTextContent('This link is already saved.')

      fireEvent.keyDown(document, { key })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(saveButton()).toBeEnabled()
      expect(createBookmark).toHaveBeenCalledTimes(1)
      expect(closeSpy).not.toHaveBeenCalled()
    })

    it('saves once when Enter is pressed twice before the request returns', async () => {
      let resolve: (b: typeof created) => void = () => {}
      vi.mocked(createBookmark).mockReturnValue(new Promise((r) => (resolve = r)))
      openPopup()
      await act(async () => {
        fireEvent.keyDown(saveButton(), { key: 'Enter' })
        fireEvent.keyDown(saveButton(), { key: 'Enter' })
      })
      expect(createBookmark).toHaveBeenCalledTimes(1)

      // While saving the fields and buttons are disabled, and a third Enter does nothing.
      expect(titleInput()).toBeDisabled()
      expect(saveButton()).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
      fireEvent.keyDown(document, { key: 'Enter' })
      expect(createBookmark).toHaveBeenCalledTimes(1)

      await act(async () => resolve(created))
    })

    it('does not cancel on Esc while saving', async () => {
      vi.mocked(createBookmark).mockReturnValue(new Promise(() => {}))
      openPopup()
      await pressSave()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(closeSpy).not.toHaveBeenCalled()
    })
  })

  describe('what is sent', () => {
    it('sends the url and the prefilled title, and never a folder', async () => {
      vi.mocked(createBookmark).mockResolvedValue(created)
      openPopup()
      await pressSave()
      expect(createBookmark).toHaveBeenCalledWith({ url: 'https://example.com/a', title: 'Example' })
    })

    it('sends the title the user typed, trimmed, not the prefilled one', async () => {
      vi.mocked(createBookmark).mockResolvedValue(created)
      openPopup()
      fireEvent.change(titleInput(), { target: { value: '  My own title  ' } })
      await pressSave()
      expect(createBookmark).toHaveBeenCalledWith({ url: 'https://example.com/a', title: 'My own title' })
    })

    it.each([
      ['cleared', '?url=https%3A%2F%2Fexample.com%2Fa&title=Example', ''],
      ['only spaces', '?url=https%3A%2F%2Fexample.com%2Fa&title=Example', '   '],
    ])('omits the title when it is %s', async (_name, search, typed) => {
      vi.mocked(createBookmark).mockResolvedValue(created)
      openPopup(search)
      fireEvent.change(titleInput(), { target: { value: typed } })
      await pressSave()
      expect(createBookmark).toHaveBeenCalledWith({ url: 'https://example.com/a' })
    })

    it('omits the title when there is no title parameter', async () => {
      vi.mocked(createBookmark).mockResolvedValue(created)
      openPopup('?url=https%3A%2F%2Fexample.com%2Fa')
      await pressSave()
      expect(createBookmark).toHaveBeenCalledWith({ url: 'https://example.com/a' })
    })

    it('sends a url containing & and # exactly as given', async () => {
      vi.mocked(createBookmark).mockResolvedValue(created)
      openPopup(`?url=${encodeURIComponent('https://a.test/p?x=1&y=2#frag')}`)
      await pressSave()
      expect(createBookmark).toHaveBeenCalledWith({ url: 'https://a.test/p?x=1&y=2#frag' })
    })

    it('limits the title field to 300 characters and cuts a longer prefilled one', () => {
      openPopup(`?url=https%3A%2F%2Fa.test&title=${'t'.repeat(301)}`)
      expect(titleInput()).toHaveAttribute('maxlength', '300')
      expect((titleInput() as HTMLInputElement).value).toHaveLength(300)
    })

    it('lets the server judge a very long url, and shows its answer', async () => {
      const url = `https://a.test/${'a'.repeat(2049 - 'https://a.test/'.length)}`
      vi.mocked(createBookmark).mockRejectedValue(
        problem(422, 'validation_error', { errors: [{ field: 'url', code: 'too_long' }] }),
      )
      openPopup(`?url=${encodeURIComponent(url)}`)
      await pressSave()
      expect(createBookmark).toHaveBeenCalledWith({ url })
      expect(screen.getByRole('alert')).toHaveTextContent(
        'That URL is too long. The limit is 2,048 characters.',
      )
    })
  })

  describe('closing', () => {
    it('shows Saved, closes after 1 s, then says the tab can be closed 350 ms later', async () => {
      vi.mocked(createBookmark).mockResolvedValue(created)
      openPopup()
      await pressSave()
      expect(screen.getByText('Saved')).toBeInTheDocument()

      act(() => vi.advanceTimersByTime(999))
      expect(closeSpy).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(1))
      expect(closeSpy).toHaveBeenCalledTimes(1)

      act(() => vi.advanceTimersByTime(349))
      expect(screen.queryByText('You can close this tab now.')).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(1))
      expect(screen.getByText('You can close this tab now.')).toBeInTheDocument()
    })

    it('closes at once on Cancel, with the same 350 ms fallback', () => {
      openPopup()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(closeSpy).toHaveBeenCalledTimes(1)
      act(() => vi.advanceTimersByTime(349))
      expect(screen.queryByText('You can close this tab now.')).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(1))
      expect(screen.getByText('You can close this tab now.')).toBeInTheDocument()
      expect(createBookmark).not.toHaveBeenCalled()
    })
  })

  describe('failures stay open', () => {
    it.each([
      [
        'a live duplicate',
        problem(409, 'duplicate_bookmark', { existing_bookmark_id: 'x', in_trash: false }),
        'This link is already saved.',
      ],
      [
        'a trashed duplicate',
        problem(409, 'duplicate_bookmark', { existing_bookmark_id: 'x', in_trash: true }),
        'This link is in your trash.',
      ],
      ['an invalid url', problem(422, 'invalid_url'), 'Only http and https links can be saved.'],
      [
        'a title that is too long',
        problem(422, 'validation_error', { errors: [{ field: 'title', code: 'too_long' }] }),
        'That title is too long. The limit is 300 characters.',
      ],
      [
        'the bookmark limit',
        problem(409, 'bookmark_limit_reached'),
        "You're at the 1,000 bookmark limit. Empty the trash or delete some bookmarks first.",
      ],
      [
        'a rate limit with Retry-After',
        problem(429, 'rate_limited', {}, 12),
        'Too many saves. Try again in about 12 seconds.',
      ],
      [
        'a rate limit without Retry-After',
        problem(429, 'rate_limited'),
        'Too many saves. Try again in a moment.',
      ],
      ['a server error', new ApiError(500, null, null), "Couldn't save that link."],
      ['a network failure', new TypeError('Failed to fetch'), "Couldn't save that link."],
    ])('shows the message for %s, offers only OK, and does not close', async (_name, error, message) => {
      vi.mocked(createBookmark).mockRejectedValue(error)
      openPopup()
      await pressSave()

      expect(screen.getByRole('alert')).toHaveTextContent(message)
      expect(screen.getByRole('button', { name: 'OK' })).toHaveFocus()
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Restore/ })).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(5000))
      expect(closeSpy).not.toHaveBeenCalled()
    })

    it('uses an info alert for a duplicate and an error alert for the rest', async () => {
      vi.mocked(createBookmark).mockRejectedValueOnce(
        problem(409, 'duplicate_bookmark', { existing_bookmark_id: 'x', in_trash: false }),
      )
      openPopup()
      await pressSave()
      expect(screen.getByRole('alert')).toHaveClass('banner--info')
      fireEvent.click(screen.getByRole('button', { name: 'OK' }))

      vi.mocked(createBookmark).mockRejectedValueOnce(new ApiError(500, null, null))
      await pressSave()
      expect(screen.getByRole('alert')).toHaveClass('banner--error')
    })

    it('returns to the form with what was typed when OK is pressed', async () => {
      vi.mocked(createBookmark).mockRejectedValue(new ApiError(500, null, null))
      openPopup()
      fireEvent.change(titleInput(), { target: { value: 'Typed by hand' } })
      await pressSave()
      fireEvent.click(screen.getByRole('button', { name: 'OK' }))
      expect(titleInput()).toHaveValue('Typed by hand')
      expect(saveButton()).toHaveFocus()
    })
  })

  describe('a url that cannot be saved', () => {
    it.each([
      ['missing', ''],
      ['not a url', '?url=not-a-url'],
      ['javascript:', `?url=${encodeURIComponent('javascript:alert(1)')}`],
      ['ftp', `?url=${encodeURIComponent('ftp://example.com/file')}`],
    ])('disables Save and says why when the url is %s', async (_name, search) => {
      openPopup(search)
      expect(saveButton()).toBeDisabled()
      expect(screen.getByRole('alert')).toHaveTextContent('Only http and https links can be saved.')

      fireEvent.keyDown(document, { key: 'Enter' })
      await act(async () => {})
      expect(createBookmark).not.toHaveBeenCalled()
    })
  })

  describe('signed out', () => {
    it('shows the signed-out message on a 401, with a login link that returns to this popup', async () => {
      vi.mocked(createBookmark).mockRejectedValue(problem(401, 'unauthenticated'))
      const query = `?url=${encodeURIComponent('https://a.test/p?x=1&y=2#f')}&title=Hello%20there`
      openPopup(query)
      await pressSave()

      expect(screen.getByText("You're logged out. Log in to continue.")).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument()
      const href = screen.getByRole('link', { name: 'Log in' }).getAttribute('href') ?? ''
      expect(new URL(href, 'http://x').searchParams.get('return_to')).toBe(`/save${query}`)
    })
  })
})
