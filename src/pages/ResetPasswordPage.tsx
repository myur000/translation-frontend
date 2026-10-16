import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { confirmPasswordReset } from '../api/auth.ts'
import { ApiClientError } from '../api/client.ts'
import { useAuth } from '../auth/useAuth.ts'
import { AuthField } from '../components/auth/AuthField.tsx'
import { AuthStatusCard } from '../components/auth/AuthStatusCard.tsx'
import { useTranslation } from '../i18n/useTranslation.ts'
import type { TranslationKey } from '../i18n/translations.ts'
import styles from './AuthPage.module.css'

interface ResetErrors { password?: string; confirmation?: string }
type T = (key: TranslationKey, variables?: Record<string, string | number>) => string
function getResetError(error: unknown, t: T) {
  if (error instanceof ApiClientError) {
    if (error.status === 400 || error.status === 410) return t('reset.invalidLink')
    if (error.status === 429) return t('error.tooManyRequests')
  }
  return t('reset.error')
}

export function ResetPasswordPage() {
  const location = useLocation()
  const { invalidateSession } = useAuth()
  const { t } = useTranslation()
  const token = new URLSearchParams(location.search).get('token')?.trim() ?? ''
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errors, setErrors] = useState<ResetErrors>({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [isComplete, setComplete] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors: ResetErrors = {}
    if (password.length < 8 || password.length > 72) nextErrors.password = t('validation.passwordLength')
    if (confirmation !== password) nextErrors.confirmation = t('validation.passwordMismatch')
    setErrors(nextErrors); setFormError('')
    if (Object.keys(nextErrors).length > 0) return
    setSubmitting(true)
    try { await confirmPasswordReset({ token, password }); invalidateSession(); setComplete(true) }
    catch (error) { setFormError(getResetError(error, t)) }
    finally { setSubmitting(false) }
  }

  if (!token) return (
    <AuthStatusCard tone="error" title={t('reset.invalidTitle')} description={<p>{t('reset.missingToken')}</p>}>
      <Link to="/forgot-password">{t('reset.requestNew')}</Link>
    </AuthStatusCard>
  )

  if (isComplete) return (
    <AuthStatusCard tone="success" title={t('reset.successTitle')} description={<p>{t('reset.successDescription')}</p>}>
      <Link to="/login">{t('register.goToLogin')}</Link>
    </AuthStatusCard>
  )

  return (
    <section aria-labelledby="reset-password-title">
      <header className={styles.header}>
        <Link to="/login" className={styles.backButton} aria-label={t('common.backToLogin')} title={t('common.backToLogin')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6" /></svg></Link>
        <span className={styles.eyebrow}>{t('reset.eyebrow')}</span><h1 id="reset-password-title">{t('reset.title')}</h1><p>{t('reset.description')}</p>
      </header>
      <form className={styles.form} noValidate onSubmit={handleSubmit}>
        <AuthField id="new-password" label={t('reset.newPassword')} type="password" value={password} error={errors.password} autoComplete="new-password" autoFocus onChange={(event) => setPassword(event.currentTarget.value)} />
        <AuthField id="new-password-confirmation" label={t('reset.confirmPassword')} type="password" value={confirmation} error={errors.confirmation} autoComplete="new-password" onChange={(event) => setConfirmation(event.currentTarget.value)} />
        {formError ? <p className={styles.formError} role="alert">{formError}</p> : null}
        <button type="submit" className={styles.submitButton} disabled={isSubmitting}>{t(isSubmitting ? 'reset.submitting' : 'reset.submit')}</button>
      </form>
    </section>
  )
}
