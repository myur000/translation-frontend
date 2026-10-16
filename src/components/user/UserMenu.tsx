import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { useAuth } from '../../auth/useAuth.ts'
import { useAccount } from '../../account/useAccount.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { useProfile } from '../../profile/useProfile.ts'
import { UserAvatar } from './UserAvatar.tsx'
import styles from './UserMenu.module.css'

interface UserMenuProps {
  isCollapsed: boolean
}

function getDisplayName(
  email: string,
  profile: ReturnType<typeof useProfile>['profile'],
) {
  const profileName =
    profile?.display_name || profile?.nickname || profile?.username
  if (typeof profileName === 'string' && profileName.trim()) return profileName

  const name = email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

  return name || email
}

export function UserMenu({ isCollapsed }: UserMenuProps) {
  const { session, logout } = useAuth()
  const { t } = useTranslation()
  const { profile, avatar } = useProfile()
  const { usage } = useAccount()
  const planLabel = usage.failed ? t('plans.unavailable') : usage.loading
    ? t('plans.loading') : usage.data?.plan_display_name ?? t('plans.unavailable')
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const [isOpen, setOpen] = useState(false)
  const [isLoggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!session) return null

  const displayName = getDisplayName(session.email, profile)
  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
      void navigate('/login', { replace: true })
    } catch {
      // AuthProvider explains the failure; do not claim the server session ended.
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${isCollapsed ? styles.collapsed : ''}`}
    >
      {isOpen ? (
        <div className={styles.popover} role="menu" aria-label={t('user.account')}>
          <div className={styles.accountHeader}>
            <strong>{displayName}</strong>
            <span>{planLabel}</span>
          </div>

          <div className={styles.menuSection}>
            <NavLink
              to="/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={({ isActive }) => isActive ? styles.activeItem : undefined}
            >
              {t('user.profile')}
            </NavLink>
            <NavLink
              to="/plans"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={({ isActive }) => isActive ? styles.activeItem : undefined}
            >
              {t('user.planAndLimits')}
            </NavLink>
            <NavLink
              to="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                isActive ? styles.activeItem : undefined
              }
            >
              {t('user.settings')}
            </NavLink>
          </div>

          <div className={styles.menuSection}>
            <button type="button" role="menuitem" disabled={isLoggingOut} onClick={() => void handleLogout()}>
              {t('user.logout')}
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className={styles.trigger}
        aria-label={t('user.menu')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={isCollapsed ? displayName : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <UserAvatar url={avatar?.url ?? null} name={displayName} />
        <span className={styles.identity}>
          <strong>{displayName}</strong>
          <small>{planLabel}</small>
        </span>
        <span className={styles.chevron} aria-hidden="true">⌃</span>
      </button>
    </div>
  )
}
