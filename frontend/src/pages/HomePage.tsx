import { AddByUrl } from '../features/save/components/AddByUrl'

/** Temporary home: stands in for the add field of the real top bar until the list screen exists. */
export function HomePage() {
  return (
    <main className="page">
      <h1>marker</h1>
      <p className="page__lead">Save a link, then find it again.</p>
      <AddByUrl />
    </main>
  )
}
