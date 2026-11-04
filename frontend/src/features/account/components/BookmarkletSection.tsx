import { useCallback } from 'react'
import { Bookmark } from 'lucide-react'
import { bookmarkletHref } from '../lib/bookmarklet'

/** The bookmarklet link to drag to the bookmarks bar, with steps for four browsers. */
export function BookmarkletSection() {
  // React 19 refuses a `javascript:` URL in the `href` prop, so the attribute is set on the node.
  const linkRef = useCallback((node: HTMLAnchorElement | null) => {
    node?.setAttribute('href', bookmarkletHref(window.location.origin))
  }, [])

  return (
    <section className="account-section">
      <h2 className="account-section__title">Install the bookmarklet</h2>
      <p className="account-section__desc">
        Drag this link to your browser's bookmarks bar. Click it on any page to save that page here. A small window
        opens where you can confirm the title and folder before anything is saved.
      </p>
      <a ref={linkRef} className="bookmarklet-link" onClick={(event) => event.preventDefault()}>
        <Bookmark size={14} aria-hidden="true" /> Save to marker
      </a>
      <ol className="account-section__steps">
        <li>Chrome: show the bookmarks bar (Ctrl+Shift+B, or Cmd+Shift+B on a Mac), then drag the link above onto it.</li>
        <li>Firefox: show the bookmarks toolbar, then drag the link above onto it.</li>
        <li>Opera: open the bookmarks bar from the menu, then drag the link above onto it.</li>
        <li>
          Safari: show the Favorites bar, then drag the link above onto it. If dragging does not work, add any bookmark
          and change its address to match this link.
        </li>
      </ol>
    </section>
  )
}
