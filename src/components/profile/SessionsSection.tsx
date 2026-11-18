import { useState } from 'react'
import { revokeSession } from '../../api/accountSecurity.ts'
import { hasApiErrorCode } from '../../api/client.ts'
import type { AccountSession } from '../../api/contracts/accountSecurity.ts'
import { securityError, sessionTime } from '../../account/securityErrors.ts'
import { useAccountAccess, useAccountCache, useAccountSessions } from '../../account/securityQueries.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { LogoutAllSection } from './LogoutAllSection.tsx'
import styles from '../../pages/ProfilePage.module.css'

/** Где открыт вход в веб-версию: завершить чужой сеанс или выйти везде. */
export function SessionsSection() {
  const { t } = useTranslation()
  const sessions = useAccountSessions()
  // «Сегодня» и «вчера» считаем от момента загрузки списка.
  const [now] = useState(() => new Date())
  return (
    <section id="sessions" className={styles.section} aria-labelledby="sessions-title" aria-busy={sessions.isFetching}>
      <h2 id="sessions-title">{t('sessions.title')}</h2>
      <p className={styles.sectionLead}>{t('sessions.lead')}</p>
      {sessions.isPending ? <p className={styles.rowText} role="status">{t('sessions.loading')}</p> : null}
      {sessions.isError && !sessions.data ? <p className={styles.error} role="alert">
        {t('sessions.loadError')} <button type="button" className={styles.inlineButton}
          onClick={() => void sessions.refetch()}>{t('profile.retry')}</button>
      </p> : null}
      {sessions.data ? (
        <ul className={styles.rows} aria-label={t('sessions.title')}>
          {sessions.data.map((session) => <SessionRow key={session.id} session={session} now={now} />)}
        </ul>
      ) : null}
      <LogoutAllSection />
    </section>
  )
}

function SessionRow({ session, now }: { session: AccountSession; now: Date }) {
  const { t, language } = useTranslation()
  const { token } = useAccountAccess()
  const { removeSession } = useAccountCache()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locale = language === 'ru' ? 'ru-RU' : 'en-US'
  const device = session.device ?? t('sessions.unknownDevice')

  const revoke = async () => {
    if (!token) return
    setBusy(true)
    setError('')
    try {
      await revokeSession(session.id, { accessToken: token })
      removeSession(session.id)
    } catch (failure) {
      // Сеанс уже закончился сам или его завершили с другого устройства.
      if (hasApiErrorCode(failure, 'SESSION_NOT_FOUND')) removeSession(session.id)
      else setError(securityError(failure, t).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <p className={styles.rowTitle}>
          {device}
          {session.current ? <span className={`${styles.pill} ${styles.pillCurrent}`}>{t('sessions.current')}</span> : null}
        </p>
        <p className={styles.rowText}>
          {session.current ? t('sessions.activeNow') : t('sessions.lastUsed', { when: sessionTime(session.last_used_at, now, locale, t) })}
          {' · '}
          {t('sessions.signedIn', { when: sessionTime(session.created_at, now, locale, t) })}
        </p>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </div>
      {!session.current ? (
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => void revoke()}
          aria-label={t('sessions.revokeLabel', { device })}>
          {t(busy ? 'sessions.revoking' : 'sessions.revoke')}
        </button>
      ) : null}
    </li>
  )
}
