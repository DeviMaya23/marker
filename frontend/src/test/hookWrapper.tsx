import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '../components/ui/Toast'

/** The wrapper for `renderHook`: query client, router at `path`, and the toast provider. */
export function hookWrapper(client: QueryClient, path = '/') {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <ToastProvider>{children}</ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}
