import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { requestPasswordReset } from '../api/auth.ts'
import { ApiClientError } from '../api/client.ts'
import { AuthField } from '../components/auth/AuthField.tsx'
import { AuthStatusCard } from '../components/auth/AuthStatusCard.tsx'
import { useTranslation } from '../i18n/useTranslation.ts'
import styles from './AuthPage.module.css'

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [isComplete, setComplete] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email.trim() || !email.includes('@')) { setEmailError(t('validation.email')); return }
    setEmailError(''); setFormError(''); setSubmitting(true)
    try { await requestPasswordReset({ email: email.trim() }); setComplete(true) }
    catch (error) { setFormError(error instanceof ApiClientError && error.status === 429 ? t('error.tooManyRequests') : t('error.sendEmail')) }
    finally { setSubmitting(false) }
  }

  if (isComplete) return (
    <AuthStatusCard tone="success" title={t('forgot.successTitle')} description={<p>{t('forgot.successDescription', { email: email.trim() })}</p>}>
      <Link to="/login">{t('common.backToLogin')}</Link>
    </AuthStatusCard>
  )

  return (
    <section aria-labelledby="forgot-password-title">
      <header className={styles.header}>
        <Link to="/login" className={styles.backButton} aria-label={t('common.backToLogin')} title={t('common.backToLogin')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6" /></svg></Link>
        <span className={styles.eyebrow}>{t('forgot.eyebrow')}</span><h1 id="forgot-password-title">{t('forgot.title')}</h1><p>{t('forgot.description')}</p>
      </header>
      <form className={styles.form} noValidate onSubmit={handleSubmit}>
        <AuthField id="password-reset-email" label={t('common.email')} type="email" value={email} error={emailError} autoComplete="email" inputMode="email" autoFocus onChange={(event) => setEmail(event.currentTarget.value)} />
        {formError ? <p className={styles.formError} role="alert">{formError}</p> : null}
        <button type="submit" className={styles.submitButton} disabled={isSubmitting}>{t(isSubmitting ? 'auth.sending' : 'forgot.submit')}</button>
      </form>
    </section>
  )
}
