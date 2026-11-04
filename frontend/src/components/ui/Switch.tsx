import { Switch as BaseSwitch } from '@base-ui/react/switch'

type Props = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** The visible text that names the switch. */
  label: string
  disabled?: boolean
}

/** An on/off switch with a visible text label; clicking the label toggles it too. */
export function Switch({ checked, onCheckedChange, label, disabled = false }: Props) {
  return (
    <label className="switch-field">
      <BaseSwitch.Root
        className="switch"
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        disabled={disabled}
      >
        <BaseSwitch.Thumb className="switch__thumb" />
      </BaseSwitch.Root>
      <span>{label}</span>
    </label>
  )
}
