import type { ReactNode } from 'react'
import { NavLink } from 'react-router'

/** The top navigation and page frame for the list and the trash view. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <nav className="app-nav" aria-label="Main">
        <span className="app-nav__name">marker</span>
        <NavLink to="/" end className="app-nav__link">
          All bookmarks
        </NavLink>
        <NavLink to="/trash" className="app-nav__link">
          Trash
        </NavLink>
      </nav>
      <main className="page">{children}</main>
    </>
  )
}
