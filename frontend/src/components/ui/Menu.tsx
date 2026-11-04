import type { ReactNode } from 'react'
import { Menu as BaseMenu } from '@base-ui/react/menu'

export type MenuItemSpec = {
  key: string
  label: string
  icon?: ReactNode
  danger?: boolean
  /** A disabled item is shown but cannot be chosen. */
  disabled?: boolean
  /** A tooltip, for example to say why the item is disabled. */
  title?: string
} & (
  | { onSelect: () => void; href?: never }
  | { href: string; onSelect?: never }
)

type Props = {
  /** The accessible name of the button that opens the menu. */
  label: string
  /** The button's content, usually an icon. */
  children: ReactNode
  items: MenuItemSpec[]
  disabled?: boolean
  className?: string
}

/**
 * A button that opens a short list of actions. An item is a button, or a link to `href`
 * that opens in a new tab with `noopener noreferrer`. Choosing an item closes the menu.
 */
export function Menu({ label, children, items, disabled = false, className = 'icon-btn' }: Props) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger className={className} aria-label={label} disabled={disabled}>
        {children}
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={4} align="end" className="dropdown-positioner">
          <BaseMenu.Popup className="dropdown">
            {items.map((item) => {
              const className = `dropdown__item${item.danger ? ' dropdown__item--danger' : ''}`
              const content = (
                <>
                  {item.icon}
                  {item.label}
                </>
              )
              return item.href !== undefined ? (
                <BaseMenu.LinkItem
                  key={item.key}
                  className={className}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {content}
                </BaseMenu.LinkItem>
              ) : (
                <BaseMenu.Item
                  key={item.key}
                  className={className}
                  onClick={item.onSelect}
                  disabled={item.disabled}
                  title={item.title}
                >
                  {content}
                </BaseMenu.Item>
              )
            })}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}
