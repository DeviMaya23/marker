import type { ReactNode, RefObject } from 'react'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'

type Props = {
  open: boolean
  title: string
  /** Called for Esc, a click on the backdrop or Close; never while `busy`. */
  onClose: () => void
  /** While busy, Esc and the backdrop do nothing (a request is in flight). */
  busy?: boolean
  /** The element to focus on open; otherwise the first focusable one. */
  initialFocus?: RefObject<HTMLElement | null>
  /** Panel width: the default is 440px. */
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  footer?: ReactNode
}

/**
 * A modal with a title (its accessible name), a body and a footer. Focus returns to what
 * opened it when it closes.
 */
export function Dialog({ open, title, onClose, busy = false, initialFocus, size = 'md', children, footer }: Props) {
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="modal-overlay" />
        <BaseDialog.Viewport className="modal-center">
          <BaseDialog.Popup
            className={`modal-panel${size === 'md' ? '' : ` modal-panel--${size}`}`}
            initialFocus={initialFocus}
          >
            <BaseDialog.Title className="modal-title">{title}</BaseDialog.Title>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
