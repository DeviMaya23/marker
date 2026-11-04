import { useMemo, type ReactNode } from 'react'
import { Toast as BaseToast } from '@base-ui/react/toast'
import { TOAST_MS, TOAST_WITH_ACTION_MS, ToastContext, type ToastApi, type ToastTone } from './useToast'

type ToastData = { tone: ToastTone }

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
