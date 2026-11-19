import { useId } from 'react'
import { useNotificationSettings, useUpdateNotificationSettings } from '../../account/notificationQueries.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from '../../pages/SettingsPage.module.css'

/** Письма на почту аккаунта. В отличие от темы и языка хранятся на сервере. */
export function NotificationsSection() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const id = useId()
  const settings = useNotificationSettings()
  const update = useUpdateNotificationSettings()
  const enabled = settings.data?.document_ready ?? false

  return (
    <section className={styles.section} aria-labelledby={id + '-title'}>
      <div className={styles.sectionCopy}>
        <h2 id={id + '-title'}>{t('settings.notifications')}</h2>
        <p>{t('settings.notificationsDescription', { email: session?.email ?? '' })}</p>
      </div>
      <div className={styles.options} aria-busy={settings.isPending || update.isPending}>
        {settings.isPending ? <p className={styles.hint} role="status">{t('settings.notificationsLoading')}</p> : null}
        {settings.isError && !settings.data ? (
          <p className={styles.error} role="alert">
            {t('settings.notificationsLoadError')}{' '}
            <button type="button" className={styles.inlineButton} onClick={() => void settings.refetch()}>
              {t('settings.retry')}
            </button>
          </p>
        ) : null}
        {settings.data ? <>
          <label className={`${styles.option} ${enabled ? styles.optionActive : ''}`}>
            <span className={styles.optionCopy}>
              <strong>{t('settings.documentReady')}</strong>
              <small id={id + '-hint'}>{t('settings.documentReadyHint')}</small>
            </span>
            <input type="checkbox" role="switch" checked={enabled} aria-describedby={id + '-hint'}
              onChange={(event) => update.mutate({ document_ready: event.currentTarget.checked })} />
            <span className={styles.switch} aria-hidden="true" />
          </label>
          {session && !session.emailVerified ? (
            <p className={styles.warning}>{t('settings.notificationsUnverified')}</p>
          ) : null}
          {update.isError ? (
            <p className={styles.error} role="alert">
              {t('settings.notificationsSaveError')}{' '}
              <button type="button" className={styles.inlineButton}
                onClick={() => update.variables && update.mutate(update.variables)}>{t('settings.retry')}</button>
            </p>
          ) : null}
          {update.isSuccess ? <p className={styles.hint} role="status">{t('settings.notificationsSaved')}</p> : null}
        </> : null}
      </div>
    </section>
  )
}
