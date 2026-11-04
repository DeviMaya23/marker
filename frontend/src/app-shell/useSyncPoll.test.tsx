import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import { StrictMode, useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api/ApiError'
import { getSyncVersion } from '../lib/api/sync'
import { BOOKMARK_LIST_KEY } from '../lib/bookmarks/queryKeys'
import { FOLDERS_KEY } from '../lib/folders/queryKeys'
import { testClient } from '../test/wrap'
import { SYNC_POLL_MS, useSyncPoll } from './useSyncPoll'

vi.mock('../lib/api/sync', () => ({ getSyncVersion: vi.fn() }))
const poll = vi.mocked(getSyncVersion)

function Harness() {
  useSyncPoll()
  return null
}

function mount(client: QueryClient, ui: ReactNode = <Harness />) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
/** Advances time, then 1 ms more so the query's batched notification reaches the component. */
const tick = async (ms: number) => {
  await advance(ms)
  await act(() => vi.advanceTimersByTimeAsync(1))
}
const answer = (...versions: number[]) => {
  for (const version of versions) poll.mockResolvedValueOnce({ version })
}
const keys = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey)

function setVisibility(state: 'hidden' | 'visible') {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
  window.dispatchEvent(new Event('visibilitychange'))
}

let client: QueryClient
let invalidate: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers()
  poll.mockReset()
  client = testClient()
  invalidate = vi.spyOn(client, 'invalidateQueries')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useSyncPoll', () => {
  it('polls on mount and again 2500 ms after the previous poll settles', async () => {
    poll.mockResolvedValue({ version: 1 })
    mount(client)
    await advance(0)
    expect(poll).toHaveBeenCalledTimes(1)
    await advance(SYNC_POLL_MS - 1)
    expect(poll).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(poll).toHaveBeenCalledTimes(2)
    await tick(SYNC_POLL_MS)
    expect(poll).toHaveBeenCalledTimes(3)
    expect(SYNC_POLL_MS).toBe(2500)
  })

  it('remembers the first answer and ignores equal ones', async () => {
    poll.mockResolvedValue({ version: 7 })
    mount(client)
    await tick(0)
    expect(invalidate).not.toHaveBeenCalled()
    await tick(SYNC_POLL_MS * 3)
    expect(poll).toHaveBeenCalledTimes(4)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('invalidates the folders then the lists once when the number changes', async () => {
    answer(3, 4)
    poll.mockResolvedValue({ version: 4 })
    mount(client)
    await tick(0)
    await tick(SYNC_POLL_MS)
    expect(keys(invalidate)).toEqual([FOLDERS_KEY, BOOKMARK_LIST_KEY])
    await tick(SYNC_POLL_MS)
    expect(invalidate).toHaveBeenCalledTimes(2)
  })

  it('treats a lower number as a change', async () => {
    answer(4, 2)
    mount(client)
    await tick(0)
    await tick(SYNC_POLL_MS)
    expect(keys(invalidate)).toEqual([FOLDERS_KEY, BOOKMARK_LIST_KEY])
  })

  it('treats a first answer of 0 as a baseline', async () => {
    answer(0, 0, 1)
    mount(client)
    await tick(0)
    expect(invalidate).not.toHaveBeenCalled()
    await tick(SYNC_POLL_MS)
    expect(invalidate).not.toHaveBeenCalled()
    await tick(SYNC_POLL_MS)
    expect(invalidate).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['a network failure', () => new TypeError('offline')],
    ['a 500', () => new ApiError(500, null, null)],
  ])('ignores %s, keeps polling, and compares with the number from before it', async (_n, makeError) => {
    answer(5)
    poll.mockRejectedValueOnce(makeError())
    poll.mockRejectedValueOnce(makeError())
    answer(5, 6)
    mount(client)
    await tick(0)
    await tick(SYNC_POLL_MS) // fails
    await tick(SYNC_POLL_MS) // fails
    expect(poll).toHaveBeenCalledTimes(3)
    await tick(SYNC_POLL_MS) // 5 again
    expect(poll).toHaveBeenCalledTimes(4)
    expect(invalidate).not.toHaveBeenCalled()
    await tick(SYNC_POLL_MS) // 6
    expect(keys(invalidate)).toEqual([FOLDERS_KEY, BOOKMARK_LIST_KEY])
  })

  it('stops after a 401, refreshing once', async () => {
    answer(1)
    poll.mockRejectedValue(new ApiError(401, null, null))
    const view = mount(client)
    await tick(0)
    await tick(SYNC_POLL_MS)
    expect(keys(invalidate)).toEqual([FOLDERS_KEY, BOOKMARK_LIST_KEY])
    const calls = poll.mock.calls.length
    await tick(SYNC_POLL_MS * 10)
    setVisibility('visible')
    await tick(0)
    view.rerender(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
    await tick(0)
    expect(poll).toHaveBeenCalledTimes(calls)
    expect(invalidate).toHaveBeenCalledTimes(2)
  })

  it('pauses while the tab is hidden and polls once at once when it is shown', async () => {
    poll.mockResolvedValue({ version: 1 })
    mount(client)
    await tick(0)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await tick(SYNC_POLL_MS * 2 + 10)
    const before = poll.mock.calls.length
    await tick(SYNC_POLL_MS * 2)
    expect(poll).toHaveBeenCalledTimes(before)
    setVisibility('visible')
    await tick(0)
    expect(poll).toHaveBeenCalledTimes(before + 1)
  })

  it('stops polling on unmount, and ignores an answer that arrives after it', async () => {
    answer(1)
    mount(client).unmount()
    let resolve: (v: { version: number }) => void = () => {}
    poll.mockReset()
    poll.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    const view = mount(client)
    await tick(0)
    view.unmount()
    await tick(SYNC_POLL_MS * 3)
    expect(poll).toHaveBeenCalledTimes(1)
    resolve({ version: 99 })
    await tick(0)
    expect(invalidate).not.toHaveBeenCalled()
  })

  function Swap() {
    const [id, setId] = useState('a')
    return (
      <>
        <button onClick={() => setId('b')}>swap</button>
        <Keyed key={id} />
      </>
    )
  }
  function Keyed() {
    useSyncPoll()
    return null
  }

  it('gives a mount in the same commit as an unmount its own baseline', async () => {
    answer(1, 2)
    const view = mount(client, <Swap />)
    await tick(0)
    act(() => view.getByText('swap').click())
    await tick(0)
    expect(poll).toHaveBeenCalledTimes(2)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('does not show a new mount the old 401', async () => {
    poll.mockRejectedValueOnce(new ApiError(401, null, null))
    const view = mount(client, <Swap />)
    await tick(0)
    expect(poll).toHaveBeenCalledTimes(1)
    poll.mockResolvedValue({ version: 1 })
    act(() => view.getByText('swap').click())
    await tick(0)
    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('does not overlap polls', async () => {
    poll.mockReturnValue(new Promise(() => {}))
    mount(client)
    await tick(SYNC_POLL_MS * 3)
    expect(poll).toHaveBeenCalledTimes(1)
  })

  it('makes a single baseline under StrictMode', async () => {
    answer(1)
    poll.mockResolvedValue({ version: 1 })
    mount(client, <StrictMode><Harness /></StrictMode>)
    await tick(0)
    expect(poll).toHaveBeenCalledTimes(1)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('calls only getSyncVersion, with no arguments', async () => {
    poll.mockResolvedValue({ version: 1 })
    mount(client)
    await tick(0)
    expect(poll).toHaveBeenCalledWith()
    expect(poll.mock.calls[0]).toHaveLength(0)
  })
})
