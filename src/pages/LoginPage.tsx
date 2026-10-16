import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { ApiClientError } from '../api/client.ts'
import { useAuth } from '../auth/useAuth.ts'
import { AuthField } from '../components/auth/AuthField.tsx'
import { useTranslation } from '../i18n/useTranslation.ts'
import type { TranslationKey } from '../i18n/translations.ts'
import styles from './AuthPage.module.css'

interface LoginErrors { email?: string; password?: string }
type T = (key: TranslationKey, variables?: Record<string, string | number>) => string

function getReturnPath(state: unknown) {
  if (typeof state !== 'object' || state === null || !('from' in state)) return '/'
  const from = (state as { from?: unknown }).from
  if (typeof from !== 'object' || from === null) return '/'
  const location = from as { pathname?: unknown; search?: unknown; hash?: unknown }
  return typeof location.pathname === 'string'
    ? `${location.pathname}${typeof location.search === 'string' ? location.search : ''}${typeof location.hash === 'string' ? location.hash : ''}`
    : '/'
}

function getLoginErrorMessage(error: unknown, t: T) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return t('error.invalidCredentials')
    if (error.status === 429) {
      return error.retryAfterSeconds
        ? t('error.tooManyWithRetry', { seconds: error.retryAfterSeconds })
        : t('error.tooMany')
    }
    return error.message
  }
  return t('error.connection')
}

export function LoginPage() {
  const { login, isAuthenticated, isRestoring } = useAuth()
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<LoginErrors>({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors: LoginErrors = {}
    if (!email.trim() || !email.includes('@')) nextErrors.email = t('validation.email')
    if (!password) nextErrors.password = t('validation.passwordRequired')
    else if (password.length > 72) nextErrors.password = t('validation.passwordMax')
    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      await login({ email: email.trim(), password })
      void navigate(getReturnPath(location.state), { replace: true })
    } catch (error) {
      if (error instanceof ApiClientError && error.details?.fieldErrors) setErrors(error.details.fieldErrors)
      setFormError(getLoginErrorMessage(error, t))
    } finally { setSubmitting(false) }
  }

  if (isAuthenticated) return <Navigate to={getReturnPath(location.state)} replace />

  return (
    <section aria-labelledby="login-title">
      <header className={styles.header}>
        <span className={styles.eyebrow}>{t('login.eyebrow')}</span>
        <h1 id="login-title">{t('login.title')}</h1>
        <p>{t('login.description')}</p>
      </header>
      <form className={styles.form} noValidate onSubmit={handleSubmit}>
        <AuthField id="login-email" label={t('common.email')} type="email" value={email} error={errors.email} autoComplete="email" inputMode="email" autoFocus onChange={(event) => setEmail(event.currentTarget.value)} />
        <AuthField id="login-password" label={t('common.password')} type="password" value={password} error={errors.password} autoComplete="current-password" onChange={(event) => setPassword(event.currentTarget.value)} />
        <div className={styles.formOptions}><Link className={styles.textLink} to="/forgot-password">{t('login.forgot')}</Link></div>
        {formError ? <p className={styles.formError} role="alert">{formError}</p> : null}
        <button type="submit" className={styles.submitButton} disabled={isSubmitting || isRestoring}>{t(isRestoring ? 'auth.restoringSession' : isSubmitting ? 'login.submitting' : 'login.submit')}</button>
      </form>
      <p className={styles.footer}>{t('login.noAccount')} <Link to="/register">{t('login.register')}</Link></p>
    </section>
  )
}
