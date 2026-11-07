import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateBookmark } from '../../../lib/api/bookmarks'
import { hookWrapper } from '../../../test/hookWrapper'
import { testClient } from '../../../test/wrap'
import { useInlineField } from './useInlineField'

vi.mock('../../../lib/api/bookmarks', () => ({ updateBookmark: vi.fn() }))

const update = vi.mocked(updateBookmark)

function setup(field: 'title' | 'note' = 'title', stored = 'Stored') {
  return renderHook(() => useInlineField({ id: 'b-1', field, stored, isFetching: false }), {
    wrapper: hookWrapper(testClient()),
  })
}

describe('useInlineField', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    update.mockReset().mockResolvedValue({} as never)
  })
  afterEach(() => vi.useRealTimers())

  it('shows the stored text until the first change, then the typed text', () => {
    const { result } = setup()
    expect(result.current.value).toBe('Stored')
    act(() => result.current.onChange('Typed'))
    expect(result.current.value).toBe('Typed')
  })

  it('revert goes back to the stored text and sends nothing', async () => {
    const { result } = setup()
    act(() => result.current.onChange('Typed'))
    act(() => result.current.revert())
    expect(result.current.value).toBe('Stored')
    await act(async () => result.current.commit())
    expect(update).not.toHaveBeenCalled()
  })

  it('holds the saved text as the baseline until the page query releases it', async () => {
    const { result } = setup()
    act(() => result.current.onChange('Saved text'))
    await act(async () => result.current.commit())
    expect(update).toHaveBeenCalledExactlyOnceWith('b-1', { title: 'Saved text' })
    // No query is active here, so no fetch started and the stored text is back at once.
    expect(result.current.value).toBe('Stored')
  })

  it('says Saved for 2 seconds and clears the timer on unmount', async () => {
    const { result, unmount } = setup()
    act(() => result.current.onChange('New'))
    await act(async () => result.current.commit())
    expect(result.current.status).toBe('Saved')
    act(() => void vi.advanceTimersByTime(2000))
    expect(result.current.status).toBe('')
    act(() => result.current.onChange('Newer'))
    await act(async () => result.current.commit())
    const spy = vi.spyOn(globalThis, 'clearTimeout')
    unmount()
    expect(spy).toHaveBeenCalled()
  })

  it('dropDraft drops typed text that is not being saved', () => {
    const { result } = setup('note', 'old')
    act(() => result.current.onChange('draft'))
    act(() => result.current.dropDraft())
    expect(result.current.value).toBe('old')
  })
})
