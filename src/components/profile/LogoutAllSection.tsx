import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { useProfile } from '../../profile/useProfile.ts'
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx'
import styles from '../../pages/ProfilePage.module.css'

export function LogoutAllSection() {
  const { logoutEverywhere } = useAuth()
  const { isMutating } = useProfile()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const running = useRef(false)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const confirm = async () => {
    if (running.current || isMutating) return
    running.current = true
    setBusy(true)
    setError(false)
    try {
      await logoutEverywhere()
      if (mounted.current) void navigate('/login', { replace: true })
    } catch {
      if (mounted.current) setError(true)
    } finally {
      running.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <section className={styles.logoutSection}>
      <button type="button" className={styles.logoutButton} disabled={isMutating || busy}
        onClick={() => { setError(false); setOpen(true) }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M10 17v3H3V4h7v3M8 12h13m-4-4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t('user.logoutAll')}
      </button>
      <p className={styles.avatarHint}>{t('user.logoutAllDescription')}</p>
      {open ? <ConfirmDialog title={t('user.logoutAllConfirm')}
        description={t('user.logoutAllDescription')} confirmLabel={t(busy ? 'user.loggingOutAll' : 'user.logoutAllAction')}
        busy={busy || isMutating} error={error ? t('user.logoutAllError') : null}
        onConfirm={() => void confirm()} onClose={() => { if (!busy) setOpen(false) }} /> : null}
    </section>
  )
}
