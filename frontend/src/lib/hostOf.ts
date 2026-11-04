/** The host name of a URL, or the whole text when it cannot be parsed (or has no host). */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname || url
  } catch {
    return url
  }
}
