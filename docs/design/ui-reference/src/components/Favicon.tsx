import * as React from "react";
import { hostOf } from "../lib/api/normalize";

export function Favicon({ url, faviconUrl, size = 18 }: { url: string; faviconUrl: string | null; size?: number }) {
  const [broken, setBroken] = React.useState(false);
  const host = hostOf(url);
  if (!faviconUrl || broken) {
    return (
      <span
        className="favicon favicon--fallback"
        style={{ width: size, height: size }}
        aria-hidden="true"
        title={host}
      >
        {host.charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    <img
      className="favicon"
      src={faviconUrl}
      alt=""
      width={size}
      height={size}
      onError={() => setBroken(true)}
    />
  );
}
