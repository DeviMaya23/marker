import type { ReactNode } from 'react'

type Props = {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

/** A centered panel for "not found", "something went wrong" and similar states. */
export function StatePanel({ icon, title, description, action }: Props) {
  return (
    <div className="state-panel">
      <div className="state-panel__icon">{icon}</div>
      <h2 className="state-panel__title">{title}</h2>
      {description && <p className="state-panel__desc">{description}</p>}
      {action && <div className="state-panel__action">{action}</div>}
    </div>
  )
}
