import type { ReactNode } from 'react'

type Props = {
  tone: 'info' | 'error' | 'warning' | 'trashed'
  /** `alert` interrupts a screen reader; `status` is polite. */
  role?: 'alert' | 'status'
  children: ReactNode
}

export function Banner({ tone, role = 'status', children }: Props) {
  return (
    <div className={`banner banner--${tone}`} role={role}>
      {children}
    </div>
  )
}
