import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/ApiError'
import * as bookmarks from '../../../lib/api/bookmarks'
import type { BookmarkSummary, ProblemBody } from '../../../lib/api/types'
import { SavePopup } from './SavePopup'

vi.mock('../../../lib/api/bookmarks')
const createBookmark = vi.mocked(bookmarks.createBookmark)
const created = { id: 'b1' } as BookmarkSummary

let closeSpy: ReturnType<typeof vi.spyOn>

function problem(status: number, body: Partial<ProblemBody>, retryAfter: number | null = null) {
  return new ApiError(status, { type: 'about:blank', title: 't', status, ...body } as ProblemBody, retryAfter)
}

function setup(search = '?url=https%3A%2F%2Fexample.com%2Fpage&title=Prefilled') {
  render(
    <MemoryRouter initialEntries={[`/save${search}`]}>
      <SavePopup />
    </MemoryRouter>,
  )
}

// user-event cannot be driven under Vitest's fake timers, so events are fired directly.
async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

async function press(key: string) {
  await act(async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key })
  })
}

async function typeTitle(value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Title'), { target: { value } })
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  createBookmark.mockReset()
  closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  closeSpy.mockRestore()
  vi.unstubAllEnvs()
})

describe('SavePopup keyboard and focus', () => {
  it('focuses Save and creates nothing on open', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
    expect(createBookmark).not.toHaveBeenCalled()
  })

  it('shows the url read-only and the prefilled title, with a disabled Top level folder', () => {
    setup()
    expect(screen.getByText('https://example.com/page')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Prefilled')
    expect(screen.getByLabelText('Folder')).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Top level' })).toBeInTheDocument()
  })

  it('saves on Enter', async () => {
    createBookmark.mockResolvedValue(created)
    setup()
    await press('Enter')
    expect(createBookmark).toHaveBeenCalledWith({ url: 'https://example.com/page', title: 'Prefilled' })
  })

  it('cancels on Esc', async () => {
    setup()
    await press('Escape')
    expect(closeSpy).toHaveBeenCalledTimes(1)
    expect(createBookmark).not.toHaveBeenCalled()
  })

  it('does not save twice when Enter is pressed twice quickly', async () => {
    createBookmark.mockReturnValue(new Promise(() => {}))
    setup()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(createBookmark).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Title')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  })

  it('leaves Enter on the Cancel button to the button itself', async () => {
    setup()
    act(() => screen.getByRole('button', { name: 'Cancel' }).focus())
    await press('Enter')
    expect(createBookmark).not.toHaveBeenCalled()
  })
})

describe('SavePopup title', () => {
  it('sends the typed title, not the prefilled one', async () => {
    createBookmark.mockResolvedValue(created)
    setup()
    await typeTitle('  My title ')
    await click('Save')
    expect(createBookmark).toHaveBeenCalledWith({ url: 'https://example.com/page', title: 'My title' })
  })

  it('omits the title when it is blank after trimming', async () => {
    createBookmark.mockResolvedValue(created)
    setup()
    await typeTitle('   ')
    await click('Save')
    expect(createBookmark).toHaveBeenCalledWith({ url: 'https://example.com/page' })
  })
})

describe('SavePopup closing', () => {
  it('shows Saved, closes after 1 second, then explains if the window stayed open', async () => {
    createBookmark.mockResolvedValue(created)
    setup()
    await click('Save')
    expect(screen.getByText('Saved')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(999))
    expect(closeSpy).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(closeSpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('You can close this tab now.')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(350))
    expect(screen.getByText('You can close this tab now.')).toBeInTheDocument()
  })

  it('cancels at once, with the same 350 ms fallback', async () => {
    setup()
    await click('Cancel')
    expect(closeSpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('You can close this tab now.')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(350))
    expect(screen.getByText('You can close this tab now.')).toBeInTheDocument()
  })
})

describe('SavePopup failures', () => {
  it.each([
    ['a live duplicate', problem(409, { code: 'duplicate_bookmark', in_trash: false, existing_bookmark_id: 'x' }), 'This link is already saved.'],
    ['a trashed duplicate', problem(409, { code: 'duplicate_bookmark', in_trash: true, existing_bookmark_id: 'x' }), 'This link is in your trash.'],
    ['an invalid url', problem(422, { code: 'invalid_url' }), 'Only http and https links can be saved.'],
    ['the limit', problem(409, { code: 'bookmark_limit_reached' }), "You're at the 1,000 bookmark limit. Empty the trash or delete some bookmarks first."],
    ['a rate limit', problem(429, { code: 'rate_limited' }, 7), 'Too many saves. Try again in about 7 seconds.'],
    ['a network failure', new TypeError('Failed to fetch'), "Couldn't save that link."],
  ])('stays open with the right message for %s, and dismiss keeps the typed title', async (_name, error, message) => {
    createBookmark.mockRejectedValue(error)
    setup()
    await typeTitle('Typed')
    await click('Save')
    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(closeSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    await click('OK')
    expect(screen.getByLabelText('Title')).toHaveValue('Typed')
  })

  it('dismisses an alert on Enter and on Esc without closing the window', async () => {
    createBookmark.mockRejectedValue(problem(409, { code: 'duplicate_bookmark', in_trash: false }))
    setup()
    await click('Save')
    await press('Enter')
    expect(screen.getByLabelText('Title')).toHaveValue('Prefilled')
    expect(createBookmark).toHaveBeenCalledTimes(1)
    await press('Enter')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await press('Escape')
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(closeSpy).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
  })
})

describe('SavePopup url check', () => {
  it.each([
    ['missing', ''],
    ['not http', '?url=javascript%3Aalert(1)'],
    ['not a url', '?url=hello'],
  ])('disables Save and explains when the url is %s', (_name, search) => {
    setup(search)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Only http and https links can be saved.')
  })

  it('does not save on Enter when the url is invalid', async () => {
    setup('?url=ftp%3A%2F%2Fa.test')
    await press('Enter')
    expect(createBookmark).not.toHaveBeenCalled()
  })
})

describe('SavePopup signed out', () => {
  const search = '?url=https%3A%2F%2Fa.test%2F%3Fx%3D1%26y%3D2%23f&title=Hi%20there'
  const returnTo = '/save?url=https%3A%2F%2Fa.test%2F%3Fx%3D1%26y%3D2%23f&title=Hi%20there'

  it('shows the message with a dev-login link in a development build', async () => {
    vi.stubEnv('DEV', true)
    createBookmark.mockRejectedValue(new ApiError(401, null, null))
    setup(search)
    await click('Save')
    expect(screen.getByText("You're logged out. Log in to continue.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      `/auth/dev-login?name=alice&return_to=${encodeURIComponent(returnTo)}`,
    )
  })

  it('points at /auth/login otherwise', async () => {
    vi.stubEnv('DEV', false)
    createBookmark.mockRejectedValue(new ApiError(401, null, null))
    setup(search)
    await click('Save')
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', `/auth/login?return_to=${encodeURIComponent(returnTo)}`)
  })
})
