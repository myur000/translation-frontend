import { useId, useState, type FormEvent } from 'react'
import { requestEmailChange } from '../../../api/accountSecurity.ts'
import { securityError, type SecurityError } from '../../../account/securityErrors.ts'
import { useAccountAccess } from '../../../account/securityQueries.ts'
import { useTranslation } from '../../../i18n/useTranslation.ts'
import { AuthField } from '../../auth/AuthField.tsx'
import styles from '../../../pages/ProfilePage.module.css'

type View = { mode: 'closed' } | { mode: 'open' } | { mode: 'sent'; to: string }

/**
 * Почта и её смена. Бэк ничего не меняет до перехода по ссылке из письма и не
 * сообщает, ждёт ли смена подтверждения (docs/backend-issues.md, п. 1), поэтому
 * «письмо отправлено» видно только сразу после отправки.
 */
export function EmailChangeRow({ email }: { email: string }) {
  const { t } = useTranslation()
  const { token } = useAccountAccess()
  const id = useId()
  const [view, setView] = useState<View>({ mode: 'closed' })
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<SecurityError | null>(null)
  const [busy, setBusy] = useState(false)

  const close = () => { setView({ mode: 'closed' }); setNewEmail(''); setPassword(''); setError(null) }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const address = newEmail.trim()
    if (!address.includes('@') || address.length > 320) { setError({ message: t('validation.email'), field: 'email' }); return }
    if (!password) { setError({ message: t('validation.passwordRequired'), field: 'password' }); return }
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      await requestEmailChange({ newEmail: address, currentPassword: password }, { accessToken: token })
      setPassword('')
      setNewEmail('')
      setView({ mode: 'sent', to: address })
    } catch (failure) {
      setError(securityError(failure, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <p className={styles.rowTitle}>{t('security.email')}</p>
        <p className={styles.rowValue}>{email}</p>
        <p className={styles.rowText}>{t('security.emailHint')}</p>
      </div>
      {view.mode !== 'open' ? (
        <button type="button" className={styles.secondary} onClick={() => { setView({ mode: 'open' }); setError(null) }}>
          {t('security.changeEmail')}
        </button>
      ) : null}
      {view.mode === 'sent' ? <p className={styles.notice} role="status">{t('security.emailSent', { email: view.to })}</p> : null}
      {view.mode === 'open' ? (
        <form className={styles.panel} noValidate aria-label={t('security.changeEmail')} aria-busy={busy}
          onSubmit={(event) => void submit(event)}>
          <div className={styles.panelFields}>
            <AuthField id={id + '-email'} label={t('security.newEmail')} type="email" value={newEmail} autoComplete="email"
              inputMode="email" autoFocus disabled={busy} error={error?.field === 'email' ? error.message : undefined}
              onChange={(event) => { setNewEmail(event.currentTarget.value); setError(null) }} />
            <AuthField id={id + '-password'} label={t('security.currentPassword')} type="password" value={password}
              autoComplete="current-password" disabled={busy} error={error?.field === 'password' ? error.message : undefined}
              onChange={(event) => { setPassword(event.currentTarget.value); setError(null) }} />
          </div>
          <p className={styles.rowText}>{t('security.emailChangeHint')}</p>
          {error && !error.field ? <p className={styles.error} role="alert">{error.message}</p> : null}
          <div className={styles.panelActions}>
            <button type="button" className={styles.secondary} disabled={busy} onClick={close}>{t('common.cancel')}</button>
            <button type="submit" className={styles.primary} disabled={busy}>
              {t(busy ? 'security.sending' : 'security.sendLink')}
            </button>
          </div>
        </form>
      ) : null}
    </li>
  )
}
