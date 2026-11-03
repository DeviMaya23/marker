import { useState } from 'react'
import { hostOf } from '../lib/hostOf'

type Props = { url: string; faviconUrl: string | null; size?: number }

/** The site's icon, or a lettered tile when there is none or the image fails to load. */
export function Favicon({ url, faviconUrl, size = 18 }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  if (!faviconUrl || failedUrl === faviconUrl) {
    const host = hostOf(url)
    return (
      <span
        className="favicon favicon--fallback"
        style={{ width: size, height: size }}
        aria-hidden="true"
        title={host}
        data-testid="favicon-tile"
      >
        {host.charAt(0).toUpperCase() || '?'}
      </span>
    )
  }
  return (
    <img
      className="favicon"
      src={faviconUrl}
      alt=""
      width={size}
      height={size}
      onError={() => setFailedUrl(faviconUrl)}
    />
  )
}
