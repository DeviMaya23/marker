import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <main className="page">
      <h1>Page not found</h1>
      <p className="page__lead">
        <Link to="/">Go to the home page</Link>
      </p>
    </main>
  )
}
