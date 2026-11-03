import { useState } from 'react'

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** The stored favicon, or a lettered tile when there is none or the image fails to load. */
export function Favicon({ url, faviconUrl, size = 28 }: { url: string; faviconUrl: string | null; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (!faviconUrl || broken) {
    const host = hostOf(url)
    return (
      <span className="favicon favicon--fallback" data-testid="favicon-tile" style={{ width: size, height: size }} aria-hidden="true" title={host}>
        {host.charAt(0).toUpperCase() || '?'}
      </span>
    )
  }
  return <img className="favicon" src={faviconUrl} alt="" width={size} height={size} onError={() => setBroken(true)} />
}
