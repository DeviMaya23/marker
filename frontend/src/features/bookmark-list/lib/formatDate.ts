const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * A short, relative date: "just now", "Nm ago", "Nh ago", "Nd ago" (each floored, under 7 days),
 * then a short date, with the year only when it differs from `now`'s. `now` is passed in for tests.
 */
export function formatDate(iso: string, now: Date): string {
  const date = new Date(iso)
  const diff = now.getTime() - date.getTime()
  if (Number.isNaN(diff)) return ''
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  })
}
