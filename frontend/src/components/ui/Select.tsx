import { Check, ChevronDown } from 'lucide-react'
import { Select as BaseSelect } from '@base-ui/react/select'

export type SelectOption = {
  value: string
  /** What the closed control shows and the list item reads, always as text. */
  label: string
  /** Indentation steps in the list only (the closed control shows just the label). */
  level?: number
}

type Props = {
  /** Put on the button, so a `<label htmlFor>` names it. */
  id: string
  options: readonly SelectOption[]
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  /** Shown in the closed control instead of the selected option's label (for example "Loading…"). */
  valueText?: string
  /** Fires as the list opens and closes, so a screen can leave Enter and Esc to the list. */
  onOpenChange?: (open: boolean) => void
}

/**
 * A single-choice select: a button that opens a list of options. Enter and Space on the button
 * open the list, Enter or a click chooses an option, Esc closes it.
 */
export function Select({ id, options, value, onValueChange, disabled = false, valueText, onOpenChange }: Props) {
  return (
    <BaseSelect.Root
      items={options.map(({ value, label }) => ({ value, label }))}
      value={value}
      onValueChange={(next) => {
        if (typeof next === 'string') onValueChange(next)
      }}
      onOpenChange={(open) => onOpenChange?.(open)}
      disabled={disabled}
    >
      <BaseSelect.Trigger id={id} className="input select__trigger">
        <BaseSelect.Value className="select__value">{valueText}</BaseSelect.Value>
        <BaseSelect.Icon className="select__icon">
          <ChevronDown size={14} aria-hidden="true" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} alignItemWithTrigger={false} className="dropdown-positioner">
          <BaseSelect.Popup className="dropdown select__popup">
            <BaseSelect.List>
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  className="dropdown__item select__item"
                  style={{ paddingLeft: `calc(10px + var(--space-3) * ${option.level ?? 0})` }}
                >
                  <BaseSelect.ItemText className="select__item-text">{option.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="select__check">
                    <Check size={14} aria-hidden="true" />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}
