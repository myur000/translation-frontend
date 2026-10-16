import { useEffect, useState } from 'react'
import { requestEmailVerification } from '../../api/auth.ts'
import { ApiClientError } from '../../api/client.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './EmailVerificationBanner.module.css'

type RequestState = 'idle' | 'loading' | 'success' | 'error'

const DISMISSED_BANNER_KEY_PREFIX = 'doctranslate.email-verification.dismissed.'

function getDismissedBannerKey(email: string) {
  return `${DISMISSED_BANNER_KEY_PREFIX}${email.trim().toLowerCase()}`
}

function wasDismissed(email: string) {
  try {
    return sessionStorage.getItem(getDismissedBannerKey(email)) === 'true'
  } catch {
    return false
  }
}

function rememberDismissal(email: string) {
  try {
    sessionStorage.setItem(getDismissedBannerKey(email), 'true')
  } catch {
    // The banner can still be dismissed in memory when storage is unavailable.
  }
}

export function EmailVerificationBanner() {
  const { session } = useAuth()
  const { t } = useTranslation()
  const [requestState, setRequestState] = useState<RequestState>('idle')
  const [dismissedEmail, setDismissedEmail] = useState<string | null>(null)

  useEffect(() => {
    if (requestState !== 'success') return

    const timeoutId = window.setTimeout(() => setRequestState('idle'), 5_000)
    return () => window.clearTimeout(timeoutId)
  }, [requestState])

  if (
    !session ||
    session.emailVerified ||
    dismissedEmail === session.email ||
    wasDismissed(session.email)
  ) {
    return null
  }

  const handleResend = async () => {
    setRequestState('loading')
    try {
      await requestEmailVerification({ email: session.email })
      setRequestState('success')
    } catch (error) {
      setRequestState('error')
      if (error instanceof ApiClientError && error.status === 429) return
    }
  }

  const handleDismiss = () => {
    rememberDismissal(session.email)
    setDismissedEmail(session.email)
  }

  return (
    <section className={styles.banner} aria-label={t('auth.verifyLabel')}>
      <div className={styles.message}>
        <strong>{t('auth.verifyTitle')}</strong>
        <span>{t('auth.verifyDescription', { email: session.email })}</span>
        {requestState === 'success' ? <small role="status">{t('auth.verifySent')}</small> : null}
        {requestState === 'error' ? <small role="alert">{t('auth.verifyError')}</small> : null}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.resendButton}
          disabled={requestState === 'loading'}
          onClick={() => void handleResend()}
        >
          {requestState === 'loading' ? t('auth.sending') : t('auth.resend')}
        </button>
        <button
          type="button"
          className={styles.dismissButton}
          aria-label={t('auth.dismissVerification')}
          title={t('auth.dismissVerification')}
          onClick={handleDismiss}
        >
          ×
        </button>
      </div>
    </section>
  )
}
