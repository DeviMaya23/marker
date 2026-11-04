import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { installMatchMedia, resetViewport } from './viewport'

installMatchMedia()

// Vitest does not unmount rendered components between tests on its own.
afterEach(() => {
  cleanup()
  resetViewport()
})
