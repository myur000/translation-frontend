import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ApiClientError } from '../../api/client.ts'
import type { ProfileResponse } from '../../api/contracts/profile.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { useProfile } from '../../profile/useProfile.ts'
import {
  PROFILE_FIELD_LIMITS, mapProfileFieldErrors, toProfileNameRequest,
  validateProfileName, type ProfileField as Field, type ProfileValidationErrors,
} from '../../profile/profileForm.ts'
import { ProfileField } from './ProfileField.tsx'
import styles from '../../pages/ProfilePage.module.css'

type Notice = 'saved' | 'validation' | 'failed' | 'denied' | 'rateLimited' | null

export function ProfileForm({ profile }: { profile: ProfileResponse }) {
  const { save, isMutating } = useProfile()
  const { t } = useTranslation()
  const prefix = useId()
  const [name, setName] = useState(profile.display_name ?? '')
  const [baseline, setBaseline] = useState(profile.display_name ?? '')
  const [sourceProfile, setSourceProfile] = useState(profile)
  const [errors, setErrors] = useState<ProfileValidationErrors>({})
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({})
  const [notice, setNotice] = useState<Notice>(null)
  const [isSaving, setSaving] = useState(false)
  const operation = useRef<AbortController | null>(null)
  const dirty = name !== baseline
  const disabled = isSaving || isMutating

  // Refresh a clean form, but never overwrite a draft with a background response.
  if (sourceProfile !== profile) {
    setSourceProfile(profile)
    if (!dirty && !isSaving) {
      setName(profile.display_name ?? '')
      setBaseline(profile.display_name ?? '')
    }
  }

  useEffect(() => () => operation.current?.abort(), [])
  useEffect(() => {
    if (notice !== 'saved') return
    const timer = window.setTimeout(() => setNotice(null), 5_000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const change = (value: string) => {
    setName(value)
    setErrors({})
    setServerErrors({})
    setNotice(null)
  }
  const reset = () => {
    const latest = profile.display_name ?? ''
    setName(latest)
    setBaseline(latest)
    setErrors({})
    setServerErrors({})
    setNotice(null)
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (operation.current || isMutating || !dirty) return
    const nextErrors = validateProfileName(name)
    setErrors(nextErrors)
    setServerErrors({})
    setNotice(null)
    if (nextErrors.display_name) {
      document.getElementById(prefix + '-display_name')?.focus()
      return
    }
    const controller = new AbortController()
    operation.current = controller
    setSaving(true)
    try {
      const saved = await save(toProfileNameRequest(profile, name), { signal: controller.signal })
      if (controller.signal.aborted) return
      const normalized = saved.display_name ?? ''
      setName(normalized)
      setBaseline(normalized)
      setErrors({})
      setServerErrors({})
      setNotice('saved')
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof ApiClientError && error.status === 400) {
        const fields = mapProfileFieldErrors(error.details?.fieldErrors ?? {})
        setServerErrors(fields)
        setNotice('validation')
        if (fields.display_name) document.getElementById(prefix + '-display_name')?.focus()
      } else {
        setNotice(error instanceof ApiClientError && error.status === 403 ? 'denied'
          : error instanceof ApiClientError && error.status === 429 ? 'rateLimited' : 'failed')
      }
    } finally {
      if (operation.current === controller) operation.current = null
      if (!controller.signal.aborted) setSaving(false)
    }
  }

  return (
    <form className={styles.card} noValidate onSubmit={(event) => void submit(event)}
      aria-label={t('user.profile')} aria-busy={isSaving}>
      <div className={styles.email}>
        <label htmlFor={prefix + '-email'}>{t('common.email')}</label>
        <input id={prefix + '-email'} type="email" value={profile.email} readOnly
          aria-describedby={prefix + '-email-hint'} />
        <small id={prefix + '-email-hint'}>{t('profile.emailReadonly')}</small>
      </div>
      <div className={styles.fields}>
        <ProfileField id={prefix + '-display_name'} value={name} disabled={disabled} onChange={change}
          error={errors.display_name ? t(errors.display_name, { limit: PROFILE_FIELD_LIMITS.display_name })
            : serverErrors.display_name} />
      </div>
      {notice ? <p className={notice === 'saved' ? styles.success : styles.error}
        role={notice === 'saved' ? 'status' : 'alert'}>{t(`profile.notice.${notice}`)}</p> : null}
      <footer className={styles.actions}>
        <button className={styles.primary} type="submit" disabled={!dirty || disabled}>
          {t(isSaving ? 'profile.saving' : 'profile.save')}
        </button>
        <button className={styles.secondary} type="button" disabled={!dirty || disabled} onClick={reset}>
          {t('profile.reset')}
        </button>
      </footer>
      <p className={styles.note}>{t('profile.optionalFields')}</p>
    </form>
  )
}
