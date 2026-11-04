import { createContext, useContext } from 'react'

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

export const ToastContext = createContext<ToastApi | null>(null)

/** `show(message, { tone, action })`. Needs a `ToastProvider` above it. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast needs a ToastProvider')
  return api
}
