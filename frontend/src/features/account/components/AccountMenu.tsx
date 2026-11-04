import { CircleHelp, CircleUser, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Menu } from '../../../components/ui/Menu'
import { useLogout } from '../hooks/useLogout'

/** The sidebar footer's menu: "Account & help" (the account page) and "Log out". */
export function AccountMenu({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const { logout, disabled } = useLogout()
  return (
    <Menu
      label="Account & help"
      className="sidebar__top-link"
      side="top"
      align="start"
      disabled={disabled}
      items={[
        {
          key: 'account',
          label: 'Account & help',
          icon: <CircleHelp size={16} aria-hidden="true" />,
          onSelect: () => {
            void navigate('/account')
            onNavigate?.()
          },
        },
        {
          key: 'logout',
          label: 'Log out',
          icon: <LogOut size={16} aria-hidden="true" />,
          onSelect: () => void logout(),
        },
      ]}
    >
      <CircleUser size={16} aria-hidden="true" />
      Account &amp; help
    </Menu>
  )
}
