import { PROFILE_FIELD_LIMITS } from '../../profile/profileForm.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from '../../pages/ProfilePage.module.css'

interface ProfileFieldProps {
  id: string
  value: string
  error?: string
  disabled: boolean
  onChange: (value: string) => void
}

export function ProfileField({ id, value, error, disabled, onChange }: ProfileFieldProps) {
  const { t } = useTranslation()
  const hintId = id + '-hint'
  const errorId = id + '-error'
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{t('profile.field.display_name')}</label>
      <input id={id} name="display_name" type="text" value={value}
        maxLength={PROFILE_FIELD_LIMITS.display_name} disabled={disabled} autoComplete="name"
        aria-invalid={Boolean(error)} aria-describedby={error ? hintId + ' ' + errorId : hintId}
        onChange={(event) => onChange(event.currentTarget.value)} />
      <small id={hintId}>{t('profile.fieldLimit', { limit: PROFILE_FIELD_LIMITS.display_name })}</small>
      {error ? <p id={errorId} className={styles.fieldError} role="alert">{error}</p> : null}
    </div>
  )
}
