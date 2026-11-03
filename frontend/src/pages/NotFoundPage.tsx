import { TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { StatePanel } from '../components/ui/StatePanel'

export function NotFoundPage() {
  return (
    <main className="page">
      <StatePanel
        icon={<TriangleAlert size={28} aria-hidden="true" />}
        title="Page not found"
        action={<Link to="/">Go to the home page</Link>}
      />
    </main>
  )
}
