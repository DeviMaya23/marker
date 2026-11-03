// URL normalization per FR-22.
const TRACKING_PARAM_PATTERNS = [/^utm_/i, /^fbclid$/i, /^gclid$/i, /^mc_eid$/i, /^igshid$/i];

export function isTrackingParam(key: string): boolean {
  return TRACKING_PARAM_PATTERNS.some((re) => re.test(key));
}

export function parseUrlLoose(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u;
  } catch {
    return null;
  }
}

/** Normalized key used for duplicate detection. Not a URL meant for display/fetching. */
export function normalizeUrl(raw: string): string {
  const u = new URL(raw.trim());
  const host = u.hostname.toLowerCase();
  const path = u.pathname.replace(/\/+$/, "") || "";
  const params = Array.from(u.searchParams.entries()).filter(([k]) => !isTrackingParam(k));
  params.sort(([a], [b]) => a.localeCompare(b));
  const query = params.map(([k, v]) => `${k}=${v}`).join("&");
  return `${host}${path}${query ? `?${query}` : ""}`;
}

export function hostOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return rawUrl;
  }
}
