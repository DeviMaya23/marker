import type { BookmarkDetail } from '../../../lib/api/types'

const LABELS: Record<BookmarkDetail['fetch_status'], string> = {
  pending: 'Pending',
  ok: 'Complete',
  failed: 'Failed',
}

export function FetchStatusChip({ status }: { status: BookmarkDetail['fetch_status'] }) {
  return <span className={`status-chip status-chip--${status}`}>{LABELS[status]}</span>
}
