import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Where the Go server listens in development (HTTP_ADDR in .env.example).
const backend = 'http://localhost:8085'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Fixed port: the OIDC callback URL and the CSRF origin check will depend on it.
    port: 5175,
    strictPort: true,
    // The browser only talks to this origin; Vite forwards API traffic to the Go server.
    proxy: {
      '/api': { target: backend },
      '/auth': { target: backend },
      '/health': { target: backend },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
