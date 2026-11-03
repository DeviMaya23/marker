import { AddUrlForm } from '../features/bookmark-list/components/AddUrlForm'

/** Temporary home page: stands in for the list screen until it exists. */
export function HomePage() {
  return (
    <main className="page home">
      <h1>marker</h1>
      <p className="home__lead">Save a link and find it again. Paste one below.</p>
      <AddUrlForm />
    </main>
  )
}
