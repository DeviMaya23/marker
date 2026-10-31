import { useEffect, useState } from 'react'

type Health = { status: string }

// Throwaway page that proves the Vite proxy reaches the Go server.
// Replaced when the real screens land.
function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    fetch('/healthz', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Health>
      })
      .then(setHealth)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'request failed')
      })

    return () => controller.abort()
  }, [])

  let status = 'checking…'
  if (error) status = `unreachable (${error})`
  else if (health) status = health.status

  return (
    <main>
      <h1>marker</h1>
      <p>Backend health: {status}</p>
    </main>
  )
}

export default App
