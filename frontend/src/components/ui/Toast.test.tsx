import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from './Toast'
import { useToast, type ToastOptions } from './useToast'

function Shower({ message, options }: { message: string; options?: ToastOptions }) {
  const toast = useToast()
  return <button onClick={() => toast.show(message, options)}>show {message}</button>
}

function setup(...shows: Array<[string, ToastOptions?]>) {
  return render(
    <ToastProvider>
      {shows.map(([message, options]) => (
        <Shower key={message} message={message} options={options} />
      ))}
    </ToastProvider>,
  )
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows in one polite status region and disappears after 3.5 s', () => {
    setup(['hello'])
    click('show hello')
    expect(screen.getByRole('status')).toHaveTextContent('hello')
    advance(3499)
    expect(screen.queryByText('hello')).toBeInTheDocument()
    advance(1)
    advance(1000)
    expect(screen.queryByText('hello')).not.toBeInTheDocument()
  })

  it('stays 6 s when it carries an action', () => {
    setup(['undo me', { action: { label: 'Undo', onClick: vi.fn() } }])
    click('show undo me')
    advance(5900)
    expect(screen.getByText('undo me')).toBeInTheDocument()
    advance(100)
    advance(1000)
    expect(screen.queryByText('undo me')).not.toBeInTheDocument()
  })

  it('runs the action once and dismisses the toast', () => {
    const onClick = vi.fn()
    setup(['gone', { action: { label: 'Undo', onClick } }])
    click('show gone')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    advance(1000)
    expect(screen.queryByText('gone')).not.toBeInTheDocument()
  })

  it('stacks two toasts, each with its tone', () => {
    setup(['one', { tone: 'success' }], ['two', { tone: 'error' }])
    click('show one')
    click('show two')
    expect(screen.getByText('one').closest('.toast')).toHaveClass('toast--success')
    expect(screen.getByText('two').closest('.toast')).toHaveClass('toast--error')
    expect(screen.getByRole('status').querySelectorAll('.toast')).toHaveLength(2)
  })

  it('clears its timers when the provider unmounts', () => {
    const { unmount } = setup(['bye'])
    click('show bye')
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
