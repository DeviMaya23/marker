import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { Toast as BaseToast } from '@base-ui/react/toast'

export type ToastTone = 'neutral' | 'success' | 'error'

export type ToastOptions = {
  tone?: ToastTone
  /** A button in the toast. It runs `onClick` and dismisses the toast. */
  action?: { label: string; onClick: () => void }
}

export type ToastApi = {
  show: (message: string, options?: ToastOptions) => void
}

export const TOAST_MS = 3500
export const TOAST_WITH_ACTION_MS = 6000

type ToastData = { tone: ToastTone }

const ToastContext = createContext<ToastApi | null>(null)

/** `show(message, { tone, action })`. Needs a `ToastProvider` above it. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast needs a ToastProvider')
  return api
}

function ToastBridge({ children }: { children: ReactNode }) {
  const manager = BaseToast.useToastManager<ToastData>()
  const { add, close } = manager
  const api = useMemo<ToastApi>(
    () => ({
      show(message, { tone = 'neutral', action } = {}) {
        const id = add({
          description: message,
          data: { tone },
          timeout: action ? TOAST_WITH_ACTION_MS : TOAST_MS,
          actionProps: action
            ? {
                children: action.label,
                className: 'toast__action',
                onClick: () => {
                  action.onClick()
                  close(id)
                },
              }
            : undefined,
        })
      },
    }),
    [add, close],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <BaseToast.Portal>
        {/* One polite live region; the toasts stack inside it. */}
        <BaseToast.Viewport className="toast-region" role="status" aria-live="polite">
          {manager.toasts.map((toast) => (
            <BaseToast.Root key={toast.id} toast={toast} className={`toast toast--${toast.data?.tone ?? 'neutral'}`}>
              <BaseToast.Content className="toast__content">
                <BaseToast.Description className="toast__message" />
                <BaseToast.Action />
              </BaseToast.Content>
            </BaseToast.Root>
          ))}
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </ToastContext.Provider>
  )
}

/** Wraps the app once, above everything that shows toasts. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <BaseToast.Provider limit={10}>
      <ToastBridge>{children}</ToastBridge>
    </BaseToast.Provider>
  )
}
