import { useParams } from 'react-router'
import { BookmarkView } from '../features/bookmark-detail/components/BookmarkView'

export function BookmarkPage() {
  const { id = '' } = useParams()
  // The key restarts the view (and its polling clock) for a different bookmark.
  return (
    <main className="page">
      <BookmarkView key={id} id={id} />
    </main>
  )
}
