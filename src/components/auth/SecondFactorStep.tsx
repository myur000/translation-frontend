import { useState, type FormEvent } from 'react'
import { hasApiErrorCode, ApiClientError } from '../../api/client.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from '../../pages/AuthPage.module.css'
import { AuthField } from './AuthField.tsx'

interface SecondFactorStepProps {
  challenge: string
  email: string
  onSignedIn: () => void
  /** Код не успели ввести или пользователь вернулся к паролю: `expired` — по истечении срока. */
  onRestart: (reason: 'expired' | 'back') => void
}

const APP_CODE = /^\d{6}$/
// Резервный код бэк выдаёт как `abcd-efgh-ijkl`; регистр и дефисы он нормализует сам.
const RECOVERY_CODE = /^[a-z0-9]{4}-?[a-z0-9]{4}-?[a-z0-9]{4}$/i

/** Второй шаг входа для аккаунта с двухэтапной проверкой. */
export function SecondFactorStep({ challenge, email, onSignedIn, onRestart }: SecondFactorStepProps) {
  const { completeSecondFactor } = useAuth()
  const { t } = useTranslation()
  const [useRecovery, setUseRecovery] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const code = useRecovery ? value.trim() : value.replace(/\s/g, '')
    if (!(useRecovery ? RECOVERY_CODE : APP_CODE).test(code)) {
      setError(t(useRecovery ? 'login.recoveryCodeFormat' : 'login.codeFormat'))
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await completeSecondFactor(useRecovery ? { challenge, recoveryCode: code } : { challenge, code }, email)
      onSignedIn()
    } catch (failure) {
      if (hasApiErrorCode(failure, 'LOGIN_CHALLENGE_EXPIRED')) {
        onRestart('expired')
        return
      }
      setError(hasApiErrorCode(failure, 'INVALID_SECOND_FACTOR_CODE') ? t('login.codeInvalid')
        : failure instanceof ApiClientError && failure.status === 429
          ? failure.retryAfterSeconds ? t('error.tooManyWithRetry', { seconds: failure.retryAfterSeconds }) : t('error.tooMany')
          : failure instanceof ApiClientError ? failure.message : t('error.connection'))
    } finally {
      setSubmitting(false)
    }
  }

  const switchMode = () => {
    setUseRecovery((current) => !current)
    setValue('')
    setError('')
  }

  return (
    <section aria-labelledby="second-factor-title">
      <header className={styles.header}>
        <span className={styles.eyebrow}>{email}</span>
        <h1 id="second-factor-title">{t('login.secondFactorTitle')}</h1>
        <p>{t(useRecovery ? 'login.recoveryDescription' : 'login.secondFactorDescription')}</p>
      </header>
      <form className={styles.form} noValidate onSubmit={(event) => void submit(event)}>
        <AuthField
          key={useRecovery ? 'recovery' : 'app'}
          id="login-second-factor"
          className={styles.codeInput}
          label={t(useRecovery ? 'login.recoveryCode' : 'login.appCode')}
          type="text"
          value={value}
          error={error}
          autoFocus
          autoComplete={useRecovery ? 'off' : 'one-time-code'}
          inputMode={useRecovery ? 'text' : 'numeric'}
          maxLength={useRecovery ? 16 : 7}
          spellCheck={false}
          onChange={(event) => { setValue(event.currentTarget.value); setError('') }}
        />
        <button type="button" className={styles.linkButton} onClick={switchMode}>
          {t(useRecovery ? 'login.useAppCode' : 'login.useRecoveryCode')}
        </button>
        <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
          {t(isSubmitting ? 'login.submitting' : 'login.confirmCode')}
        </button>
      </form>
      <p className={styles.footer}>
        <button type="button" className={styles.linkButton} onClick={() => onRestart('back')}>{t('login.otherAccount')}</button>
      </p>
    </section>
  )
}
