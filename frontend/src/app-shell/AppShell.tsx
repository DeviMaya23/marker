import type { ReactNode } from 'react'
import { Bookmark, Trash2 } from 'lucide-react'
import { NavLink } from 'react-router'
import { FolderSection } from '../features/folder-sidebar/components/FolderSection'

/**
 * The page frame: a sidebar (the app's name, "All bookmarks", "Trash" and the folders) beside
 * the page. Below 768px the sidebar is stacked above the page.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <nav className="sidebar" aria-label="Main">
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
        </nav>
      </aside>
      <div className="app-shell__main">
        <main className="page">{children}</main>
      </div>
    </div>
  )
}
