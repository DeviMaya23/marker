import { CircleAlert, Clock } from 'lucide-react'
import type { BookmarkDetail } from '../../lib/api/bookmarks'

/** The fetch state as a chip: pending, complete or failed. */
export function FetchStatusChip({ status }: { status: BookmarkDetail['fetch_status'] }) {
  if (status === 'ok') return <span className="status-chip status-chip--ok">Complete</span>
  if (status === 'pending') {
    return (
      <span className="status-chip status-chip--pending" title="Still fetching the page">
        <Clock size={11} aria-hidden="true" /> Fetching…
      </span>
    )
  }
  return (
    <span
      className="status-chip status-chip--failed"
      title="Couldn't fetch this page; the link still works"
    >
      <CircleAlert size={11} aria-hidden="true" /> Fetch failed
    </span>
  )
}
