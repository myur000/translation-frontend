import { useId, useState, type FormEvent } from 'react'
import { changePassword } from '../../../api/accountSecurity.ts'
import { passwordProblem, securityError, type SecurityError } from '../../../account/securityErrors.ts'
import { useAccountCache } from '../../../account/securityQueries.ts'
import { useAuth } from '../../../auth/useAuth.ts'
import { useTranslation } from '../../../i18n/useTranslation.ts'
import { AuthField } from '../../auth/AuthField.tsx'
import styles from '../../../pages/ProfilePage.module.css'

/** Смена пароля: бэк завершает все сеансы и выдаёт этому устройству новый. */
export function PasswordChangeRow() {
  const { t } = useTranslation()
  const { replaceSession } = useAuth()
  const { sessionsChanged } = useAccountCache()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<SecurityError | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const close = () => { setOpen(false); setCurrent(''); setNext(''); setError(null) }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!current) { setError({ message: t('validation.passwordRequired'), field: 'password' }); return }
    const problem = passwordProblem(next, t)
    if (problem) { setError({ message: problem, field: 'newPassword' }); return }
    setBusy(true)
    setError(null)
    try {
      await replaceSession((accessToken) => changePassword({ currentPassword: current, newPassword: next }, { accessToken }))
      close()
      setDone(true)
      sessionsChanged()
    } catch (failure) {
      setError(securityError(failure, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <p className={styles.rowTitle}>{t('security.password')}</p>
        <p className={styles.rowText}>{t('security.passwordHint')}</p>
      </div>
      {!open ? (
        <button type="button" className={styles.secondary} onClick={() => { setOpen(true); setDone(false) }}>
          {t('security.changePassword')}
        </button>
      ) : null}
      {done ? <p className={styles.notice} role="status">{t('security.passwordChanged')}</p> : null}
      {open ? (
        <form className={styles.panel} noValidate aria-label={t('security.changePassword')} aria-busy={busy}
          onSubmit={(event) => void submit(event)}>
          <div className={styles.panelFields}>
            <AuthField id={id + '-current'} label={t('security.currentPassword')} type="password" value={current}
              autoComplete="current-password" autoFocus disabled={busy}
              error={error?.field === 'password' ? error.message : undefined}
              onChange={(event) => { setCurrent(event.currentTarget.value); setError(null) }} />
            <AuthField id={id + '-new'} label={t('security.newPassword')} type="password" value={next}
              autoComplete="new-password" disabled={busy}
              error={error?.field === 'newPassword' ? error.message : undefined}
              onChange={(event) => { setNext(event.currentTarget.value); setError(null) }} />
          </div>
          <p className={styles.rowText}>{t('security.newPasswordHint')}</p>
          {error && !error.field ? <p className={styles.error} role="alert">{error.message}</p> : null}
          <div className={styles.panelActions}>
            <button type="button" className={styles.secondary} disabled={busy} onClick={close}>{t('common.cancel')}</button>
            <button type="submit" className={styles.primary} disabled={busy}>
              {t(busy ? 'security.saving' : 'security.savePassword')}
            </button>
          </div>
        </form>
      ) : null}
    </li>
  )
}
