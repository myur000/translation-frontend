import { useState, type InputHTMLAttributes } from 'react'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './AuthField.module.css'

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  type: 'email' | 'password'
  error?: string
}

export function AuthField({ label, type, error, id, ...inputProps }: AuthFieldProps) {
  const { t } = useTranslation()
  const [isPasswordVisible, setPasswordVisible] = useState(false)
  const inputType = type === 'password' && isPasswordVisible ? 'text' : type
  const errorId = error ? `${id}-error` : undefined
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.inputContainer}>
        <input {...inputProps} id={id} type={inputType} aria-invalid={Boolean(error)} aria-describedby={errorId} />
        {type === 'password' ? (
          <button
            type="button"
            className={styles.revealButton}
            aria-label={t(isPasswordVisible ? 'auth.hidePassword' : 'auth.showPassword')}
            aria-pressed={isPasswordVisible}
            onClick={() => setPasswordVisible((visible) => !visible)}
          >
            {t(isPasswordVisible ? 'auth.hide' : 'auth.show')}
          </button>
        ) : null}
      </div>
      {error ? <small id={errorId} role="alert">{error}</small> : null}
    </div>
  )
}
