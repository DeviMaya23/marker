import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest does not unmount rendered components between tests on its own.
afterEach(() => {
  cleanup()
})
