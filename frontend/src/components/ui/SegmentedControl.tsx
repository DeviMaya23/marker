import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'

export type SegmentedOption = {
  value: string
  /** The visible text of the segment. */
  label: string
  disabled?: boolean
  /** A native tooltip, also on a disabled segment. */
  title?: string
}

type Props = {
  /** The accessible name of the group. */
  label: string
  options: readonly SegmentedOption[]
  value: string
  onValueChange: (value: string) => void
}

/** A row of mutually exclusive segments (a radio group): exactly one is chosen. */
export function SegmentedControl({ label, options, value, onValueChange }: Props) {
  return (
    <RadioGroup
      className="segmented"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        if (typeof next === 'string') onValueChange(next)
      }}
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          className="segmented__btn"
          value={option.value}
          disabled={option.disabled}
          title={option.title}
        >
          <span className="segmented__label">{option.label}</span>
        </Radio.Root>
      ))}
    </RadioGroup>
  )
}
