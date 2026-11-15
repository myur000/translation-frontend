import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { useAuth } from '../../auth/useAuth.ts'
import { useAccount } from '../../account/useAccount.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { useProfile } from '../../profile/useProfile.ts'
import { UserAvatar } from './UserAvatar.tsx'
import styles from './UserMenu.module.css'
import { GlyphIcon } from '../ui/GlyphIcon.tsx'

/** Осталось меньше этой доли лимита — полоска красная: пора смотреть тарифы. */
const LOW_SHARE = 0.1

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
  const { t, language } = useTranslation()
  const { profile, avatar } = useProfile()
  const { usage } = useAccount()
  const planLabel = usage.failed ? t('plans.unavailable') : usage.loading
    ? t('plans.loading') : usage.data?.plan_display_name ?? t('plans.unavailable')
  const [thisYear] = useState(() => new Date().getFullYear())
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
      // Причину сбоя объясняет AuthProvider; не утверждаем, что сессия на сервере завершена.
    } finally {
      setLoggingOut(false)
    }
  }

  const data = usage.data
  const limit = data && !data.unlimited ? data.limit_units ?? 0 : 0
  const left = data && !data.unlimited ? Math.max(0, data.remaining_units ?? limit - data.used_units) : 0
  const number = (value: number) => value.toLocaleString(language)
  const resets = data ? new Date(data.resets_at) : null
  const resetsLabel = resets && !Number.isNaN(resets.getTime())
    ? new Intl.DateTimeFormat(language, {
        day: 'numeric', month: 'long', ...(resets.getFullYear() !== thisYear ? { year: 'numeric' } : {}),
      }).format(resets)
    : null
  const item = (to: string, icon: 'user' | 'card' | 'gear', label: string) => (
    <NavLink
      to={to}
      role="menuitem"
      onClick={() => setOpen(false)}
      className={({ isActive }) => isActive ? styles.activeItem : undefined}
    >
      <GlyphIcon name={icon} className={styles.itemIcon} />
      {label}
    </NavLink>
  )

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${isCollapsed ? styles.collapsed : ''}`}
    >
      {isOpen ? (
        <div className={styles.popover} role="menu" aria-label={t('user.account')}>
          <div className={styles.accountHeader}>
            <UserAvatar medium url={avatar?.url ?? null} name={displayName} />
            <span className={styles.accountText}>
              <strong>{displayName}</strong>
              <span>{session.email}</span>
            </span>
          </div>

          {/* Сколько страниц осталось в этом периоде: полоска убывает, как запас. */}
          <div className={styles.plan}>
            <div className={styles.planRow}>
              <span className={styles.planName}>{planLabel}</span>
              {data?.unlimited ? <span className={styles.planLeft}>{t('user.unlimited')}</span>
                : data && limit ? <span className={styles.planLeft}>{t('user.pagesLeft', { left: number(left), limit: number(limit) })}</span>
                  : null}
            </div>
            {data && !data.unlimited && limit ? (
              <progress
                className={`${styles.meter} ${left / limit <= LOW_SHARE ? styles.meterLow : ''}`}
                max={limit}
                value={left}
                aria-label={t('user.pagesLeftLabel', { left: number(left), limit: number(limit) })}
              />
            ) : null}
            {resetsLabel && data && !data.unlimited ? <span className={styles.resets}>{t('user.resets', { date: resetsLabel })}</span> : null}
          </div>

          <div className={styles.menuSection}>
            {item('/profile', 'user', t('user.profile'))}
            {item('/plans', 'card', t('user.planAndLimits'))}
            {item('/settings', 'gear', t('user.settings'))}
          </div>

          <div className={styles.menuSection}>
            <button type="button" role="menuitem" className={styles.logout} disabled={isLoggingOut} onClick={() => void handleLogout()}>
              <GlyphIcon name="logout" className={styles.itemIcon} />
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
        <GlyphIcon name="chevronUp" className={styles.chevron} />
      </button>
    </div>
  )
}
