import type { MouseEvent } from 'react'
import { Bookmark, CircleUser, Trash2 } from 'lucide-react'
import { NavLink } from 'react-router'
import { FolderSection } from '../features/folder-sidebar/components/FolderSection'

/**
 * The sidebar's content: the app name, "All bookmarks", "Trash", the Folders section and the "Account & help" link.
 * `onNavigate` is called when a link inside it is clicked, including the current page's.
 */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  function handleClick(event: MouseEvent<HTMLElement>) {
    // Dialogs and menus render in portals but still bubble here through React; only a click
    // on a link that is really inside the sidebar counts.
    const target = event.target
    if (!(target instanceof Element) || !event.currentTarget.contains(target)) return
    if (target.closest('a[href]')) onNavigate?.()
  }
  return (
    <nav className="sidebar" aria-label="Main" onClick={handleClick}>
      <span className="sidebar__brand">marker</span>
      <div className="sidebar__scroll">
        <div className="sidebar__top-links">
          <NavLink to="/" end className="sidebar__top-link">
            <Bookmark size={16} aria-hidden="true" />
            All bookmarks
          </NavLink>
          <NavLink to="/trash" className="sidebar__top-link">
            <Trash2 size={16} aria-hidden="true" />
            Trash
          </NavLink>
        </div>
        <FolderSection />
      </div>
      <div className="sidebar__footer">
        <NavLink to="/account" className="sidebar__top-link">
          <CircleUser size={16} aria-hidden="true" />
          Account &amp; help
        </NavLink>
      </div>
    </nav>
  )
}
