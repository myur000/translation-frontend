import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { register } from '../api/auth.ts'
import { ApiClientError } from '../api/client.ts'
import { AuthField } from '../components/auth/AuthField.tsx'
import { useTranslation } from '../i18n/useTranslation.ts'
import type { TranslationKey } from '../i18n/translations.ts'
import styles from './AuthPage.module.css'

interface RegisterErrors { email?: string; password?: string; passwordConfirmation?: string }
type T = (key: TranslationKey, variables?: Record<string, string | number>) => string
function getRegisterErrorMessage(error: unknown, t: T) {
  if (error instanceof ApiClientError) {
    if (error.status === 409) return t('error.accountExists')
    if (error.status === 429) return t('error.tooManyRequests')
    return error.message
  }
  return t('error.connection')
}

export function RegisterPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [errors, setErrors] = useState<RegisterErrors>({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors: RegisterErrors = {}
    if (!email.trim() || !email.includes('@')) nextErrors.email = t('validation.email')
    if (password.length < 8 || password.length > 72) nextErrors.password = t('validation.passwordLength')
    if (passwordConfirmation !== password) nextErrors.passwordConfirmation = t('validation.passwordMismatch')
    setErrors(nextErrors); setFormError('')
    if (Object.keys(nextErrors).length > 0) return
    setSubmitting(true)
    try { const response = await register({ email: email.trim(), password }); setRegisteredEmail(response.email) }
    catch (error) {
      if (error instanceof ApiClientError && error.details?.fieldErrors) setErrors(error.details.fieldErrors)
      setFormError(getRegisterErrorMessage(error, t))
    } finally { setSubmitting(false) }
  }

  if (registeredEmail) return (
    <section className={styles.success} role="status">
      <div className={styles.successIcon} aria-hidden="true">✓</div>
      <h1>{t('register.successTitle')}</h1>
      <p>{t('register.successDescription', { email: registeredEmail })}</p>
      <Link to="/login">{t('register.goToLogin')}</Link>
    </section>
  )

  return (
    <section aria-labelledby="register-title">
      <header className={styles.header}>
        <Link to="/login" className={styles.backButton} aria-label={t('common.backToLogin')} title={t('common.backToLogin')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6" /></svg></Link>
        <span className={styles.eyebrow}>{t('register.eyebrow')}</span><h1 id="register-title">{t('register.title')}</h1><p>{t('register.description')}</p>
      </header>
      <form className={styles.form} noValidate onSubmit={handleSubmit}>
        <AuthField id="register-email" label={t('common.email')} type="email" value={email} error={errors.email} autoComplete="email" inputMode="email" autoFocus onChange={(event) => setEmail(event.currentTarget.value)} />
        <AuthField id="register-password" label={t('common.password')} type="password" value={password} error={errors.password} autoComplete="new-password" onChange={(event) => setPassword(event.currentTarget.value)} />
        <AuthField id="register-password-confirmation" label={t('register.confirmPassword')} type="password" value={passwordConfirmation} error={errors.passwordConfirmation} autoComplete="new-password" onChange={(event) => setPasswordConfirmation(event.currentTarget.value)} />
        {formError ? <p className={styles.formError} role="alert">{formError}</p> : null}
        <button type="submit" className={styles.submitButton} disabled={isSubmitting}>{t(isSubmitting ? 'register.submitting' : 'register.submit')}</button>
      </form>
      <p className={styles.footer}>{t('register.hasAccount')} <Link to="/login">{t('register.signIn')}</Link></p>
    </section>
  )
}
