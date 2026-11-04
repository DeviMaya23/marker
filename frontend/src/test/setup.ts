import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { installMatchMedia, resetViewport } from './viewport'

installMatchMedia()

// Vitest does not unmount rendered components between tests on its own.
// loginRedirect is imported here, after a test file's own mocks (such as lib/goTo) are in place.
afterEach(async () => {
  cleanup()
  resetViewport()
  const { resetLoginRedirectForTests } = await import('../lib/api/loginRedirect')
  resetLoginRedirectForTests()
  // Some files (stylelint config) run in the node environment, with no window.
  if (typeof window !== 'undefined') window.history.pushState({}, '', '/')
})
