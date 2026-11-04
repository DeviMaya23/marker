import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Select, type SelectOption } from './Select'

const OPTIONS: SelectOption[] = [
  { value: '', label: 'Top level' },
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta', level: 1 },
]

function Harness({ onOpenChange, disabled, valueText }: { onOpenChange?: (open: boolean) => void; disabled?: boolean; valueText?: string }) {
  const [value, setValue] = useState('')
  return (
    <>
      <label htmlFor="pick">Folder</label>
      <Select id="pick" options={OPTIONS} value={value} onValueChange={setValue} onOpenChange={onOpenChange} disabled={disabled} valueText={valueText} />
    </>
  )
}

describe('Select', () => {
  it('is named by its label and shows the selected option as text', () => {
    render(<Harness />)
    expect(screen.getByRole('combobox', { name: 'Folder' })).toHaveTextContent('Top level')
  })

  it('opens on click, chooses an option, closes, and the closed control shows just its name', async () => {
    const onOpenChange = vi.fn()
    render(<Harness onOpenChange={onOpenChange} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Folder' }))
    expect(await screen.findAllByRole('option')).toHaveLength(3)
    await user.click(screen.getByRole('option', { name: 'Beta' }))
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(screen.getByRole('combobox', { name: 'Folder' })).toHaveTextContent('Beta')
    expect(onOpenChange.mock.calls.map(([open]) => open)).toEqual([true, false])
  })

  it('Esc closes an open list and reports it', async () => {
    const onOpenChange = vi.fn()
    render(<Harness onOpenChange={onOpenChange} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Folder' }))
    await screen.findByRole('listbox')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('shows valueText in place of the selected label, and a disabled control cannot be opened', async () => {
    render(<Harness disabled valueText="Loading…" />)
    const control = screen.getByRole('combobox', { name: 'Folder' })
    expect(control).toHaveTextContent('Loading…')
    await userEvent.setup().click(control)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows names as text, not HTML', async () => {
    render(
      <Select id="x" options={[{ value: 'h', label: '<img src=x onerror=alert(1)>' }]} value="h" onValueChange={() => {}} />,
    )
    expect(screen.getByRole('combobox')).toHaveTextContent('<img src=x onerror=alert(1)>')
    expect(document.querySelector('img')).toBeNull()
  })
})
