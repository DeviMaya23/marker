import { useParams } from 'react-router'
import { BookmarkView } from '../features/bookmark-detail/components/BookmarkView'

export function BookmarkPage() {
  const { id } = useParams()
  return (
    <main className="page">
      {/* The route always has an :id; the key gives each bookmark a fresh view. */}
      {id && <BookmarkView key={id} id={id} />}
    </main>
  )
}
