// There's no real network fetch in this prototype (see DECISIONS.md), so favicons
// are deterministic colored-letter SVGs keyed by host, standing in for FR-5's
// "store the site's favicon". A handful of hosts are deliberately mapped to `null`
// so the UI's "missing favicon" fallback (brief, screen 2) has something to show.
const PALETTE = ["#5B63E0", "#1A8A5E", "#B4790A", "#C23B3B", "#3B41A3", "#0E7490", "#9333EA"];

const NO_FAVICON_HOSTS = new Set(["old-blog.example", "personal-wiki.example"]);

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function faviconUrlFor(host: string): string | null {
  if (NO_FAVICON_HOSTS.has(host)) return null;
  const letter = host.replace(/^www\./, "")[0]?.toUpperCase() ?? "?";
  const color = PALETTE[hash(host) % PALETTE.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="7" fill="${color}"/><text x="16" y="21" font-family="system-ui,sans-serif" font-size="15" fill="white" text-anchor="middle" font-weight="600">${letter}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
