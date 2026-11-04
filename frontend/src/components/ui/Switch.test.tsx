import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './Switch'

describe('Switch', () => {
  it('shows its label as the name, and aria-checked follows checked', () => {
    const { rerender } = render(<Switch label="Include notes" checked={false} onCheckedChange={() => {}} />)
    const control = screen.getByRole('switch', { name: 'Include notes' })
    expect(control).toHaveAttribute('aria-checked', 'false')
    rerender(<Switch label="Include notes" checked onCheckedChange={() => {}} />)
    expect(control).toHaveAttribute('aria-checked', 'true')
  })

  it('calls onCheckedChange with the new value, from the control and from the label', async () => {
    const onCheckedChange = vi.fn()
    const { rerender } = render(<Switch label="Include notes" checked={false} onCheckedChange={onCheckedChange} />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onCheckedChange).toHaveBeenLastCalledWith(true)
    rerender(<Switch label="Include notes" checked onCheckedChange={onCheckedChange} />)
    await userEvent.click(screen.getByText('Include notes'))
    expect(onCheckedChange).toHaveBeenLastCalledWith(false)
    expect(onCheckedChange).toHaveBeenCalledTimes(2)
  })

  it('does not call onCheckedChange when disabled', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch label="Include notes" checked={false} onCheckedChange={onCheckedChange} disabled />)
    await userEvent.click(screen.getByRole('switch'))
    await userEvent.click(screen.getByText('Include notes'))
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})
