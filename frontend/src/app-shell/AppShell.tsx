import { useRef, useState, type ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { useLocation } from 'react-router'
import { Drawer } from '../components/ui/Drawer'
import { useMediaQuery } from '../lib/useMediaQuery'
import { SidebarContent } from './SidebarContent'

/**
 * The page frame. Wide (768px and up): the sidebar sits beside the page. Narrow: a top bar
 * with a menu button, and the sidebar opens as a drawer. The sidebar content exists once:
 * the inline `aside` and the drawer are alternatives.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const narrow = useMediaQuery('(max-width: 767px)')
  const { key } = useLocation()
  // The location the drawer was opened at; any other location (or a wide viewport) closes it.
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  if (openedAt !== null && (openedAt !== key || !narrow)) setOpenedAt(null)
  const open = openedAt !== null
  const menuButton = useRef<HTMLButtonElement>(null)
  const close = () => setOpenedAt(null)

  return (
    <div className="app-shell">
      {narrow ? (
        <>
          <div className="app-shell__main">
            <header className="app-shell__topbar">
              <span className="app-shell__topbar-title">marker</span>
              <button
                ref={menuButton}
                type="button"
                className="icon-btn app-shell__menu-btn"
                aria-label="Open menu"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpenedAt(key)}
              >
                <Menu size={20} aria-hidden="true" />
              </button>
            </header>
            <main className="page">{children}</main>
          </div>
          <Drawer open={open} onClose={close} title="Menu" returnFocus={menuButton}>
            {open && <SidebarContent onNavigate={close} />}
          </Drawer>
        </>
      ) : (
        <>
          <aside className="app-shell__sidebar">
            <SidebarContent />
          </aside>
          <div className="app-shell__main">
            <main className="page">{children}</main>
          </div>
        </>
      )}
    </div>
  )
}
