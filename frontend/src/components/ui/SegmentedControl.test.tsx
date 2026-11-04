import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl, type SegmentedOption } from './SegmentedControl'

const OPTIONS: SegmentedOption[] = [
  { value: 'all', label: 'All bookmarks' },
  { value: 'folder', label: 'This folder', title: 'Pick me' },
  { value: 'off', label: 'Off', disabled: true, title: 'Not now' },
]

function setup(value = 'all') {
  const onValueChange = vi.fn()
  render(<SegmentedControl label="Scope" options={OPTIONS} value={value} onValueChange={onValueChange} />)
  return onValueChange
}

describe('SegmentedControl', () => {
  it('names the group and checks the option that matches value', () => {
    setup('folder')
    expect(screen.getByRole('radiogroup', { name: 'Scope' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'This folder' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'All bookmarks' })).not.toBeChecked()
  })

  it('calls onValueChange with the value of the option chosen', async () => {
    const onValueChange = setup('all')
    await userEvent.click(screen.getByRole('radio', { name: 'This folder' }))
    expect(onValueChange).toHaveBeenCalledWith('folder')
  })

  it('marks a disabled option, shows its title, and choosing it calls nothing', async () => {
    const onValueChange = setup('all')
    const off = screen.getByRole('radio', { name: 'Off' })
    expect(off).toHaveAttribute('aria-disabled', 'true')
    expect(off).toHaveAttribute('title', 'Not now')
    await userEvent.click(off)
    expect(onValueChange).not.toHaveBeenCalled()
  })
})
