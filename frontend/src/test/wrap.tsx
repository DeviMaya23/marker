import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '../components/ui/Toast'

/** A client for tests: no retries, so a failed request fails at once. */
export function testClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

/** Renders inside everything a screen needs: query client, router and toast provider. */
export function renderApp(ui: ReactElement, { path = '/', client = testClient() } = {}) {
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, ...result }
}
