import { useRef, type ReactNode, type RefObject } from 'react'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { useMediaQuery } from '../../lib/useMediaQuery'

type Props = {
  open: boolean
  /** Called for Esc, a click on the backdrop and the close button. */
  onClose: () => void
  /** The accessible name of the panel; it is visually hidden. */
  title: string
  /** The element to focus on close, usually the button that opened the drawer. */
  returnFocus?: RefObject<HTMLElement | null>
  children: ReactNode
}

/**
 * A modal panel that slides in from the left over a backdrop. Focus starts on the close
 * button and stays inside; the page behind does not scroll. Dialogs and menus opened from
 * inside it sit above it.
 */
export function Drawer({ open, onClose, title, returnFocus, children }: Props) {
  const close = useRef<HTMLButtonElement>(null)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const motion = reduced ? '' : ' drawer--animated'
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={`drawer-backdrop${motion}`} />
        <BaseDialog.Popup className={`drawer-panel${motion}`} initialFocus={close} finalFocus={returnFocus}>
          <BaseDialog.Title className="sr-only">{title}</BaseDialog.Title>
          <BaseDialog.Close ref={close} className="icon-btn drawer-panel__close" aria-label="Close menu">
            <X size={18} aria-hidden="true" />
          </BaseDialog.Close>
          <div className="drawer-panel__body">{children}</div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
