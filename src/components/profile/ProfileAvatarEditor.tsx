import { useEffect, useRef, useState } from 'react'
import { ApiClientError } from '../../api/client.ts'
import { AVATAR_MAX_BYTES, AVATAR_TYPES } from '../../api/profile.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { TranslationKey } from '../../i18n/translations.ts'
import { useProfile } from '../../profile/useProfile.ts'
import { UserAvatar } from '../user/UserAvatar.tsx'
import styles from '../../pages/ProfilePage.module.css'

export function ProfileAvatarEditor() {
  const { profile, avatar, isMutating, changeAvatar } = useProfile()
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const operation = useRef<AbortController | null>(null)
  const [notice, setNotice] = useState<TranslationKey | null>(null)
  const [error, setError] = useState<TranslationKey | null>(null)
  const [action, setAction] = useState<'upload' | 'delete' | null>(null)
  useEffect(() => () => operation.current?.abort(), [])
  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 5_000)
    return () => window.clearTimeout(timeout)
  }, [notice])
  const change = async (file: File | null) => {
    if (operation.current || isMutating) return
    setNotice(null)
    setError(null)
    if (file && (!AVATAR_TYPES.some((type) => type === file.type) || !file.size)) {
      setError('avatar.invalidType')
      return
    }
    if (file && file.size > AVATAR_MAX_BYTES) {
      setError('avatar.tooLarge')
      return
    }
    const controller = new AbortController()
    operation.current = controller
    setAction(file ? 'upload' : 'delete')
    try {
      await changeAvatar(file, { signal: controller.signal })
      if (!controller.signal.aborted) setNotice(file ? 'avatar.saved' : 'avatar.removed')
    } catch (reason) {
      if (controller.signal.aborted) return
      setError(reason instanceof ApiClientError && [400, 413].includes(reason.status)
        ? 'avatar.rejected' : reason instanceof ApiClientError && reason.status === 429
          ? 'profile.notice.rateLimited' : 'avatar.failed')
    } finally {
      if (operation.current === controller) operation.current = null
      if (!controller.signal.aborted) setAction(null)
    }
  }
  const disabled = isMutating || action !== null
  return (
    <section className={styles.avatarSection} aria-labelledby="profile-avatar-title" aria-busy={disabled}>
      <h2 id="profile-avatar-title">{t('avatar.title')}</h2>
      <div className={styles.avatarRow}>
        <UserAvatar large url={avatar.url} name={profile?.display_name || profile?.email || ''}
          alt={t('avatar.image')} />
        <div className={styles.avatarControls}>
          <p className={styles.avatarHint}>{t('avatar.hint')}</p>
          <div className={styles.avatarButtons}>
            <button type="button" className={styles.secondary} disabled={disabled}
              onClick={() => input.current?.click()}>
              {t(action === 'upload' ? 'avatar.uploading' : profile?.has_avatar ? 'avatar.replace' : 'avatar.upload')}
            </button>
            {profile?.has_avatar ? <button type="button" className={styles.textDanger} disabled={disabled}
              onClick={() => void change(null)}>
              {t(action === 'delete' ? 'avatar.removing' : 'avatar.remove')}
            </button> : null}
          </div>
          <input ref={input} type="file" accept="image/jpeg,image/png" hidden disabled={disabled}
            aria-label={t('avatar.chooseFile')} onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) void change(file)
            }} />
        </div>
      </div>
      {avatar.status === 'loading' ? <p className={styles.avatarHint} role="status">{t('avatar.loading')}</p> : null}
      {avatar.status === 'error' ? <p className={styles.error} role="alert">
        {t('avatar.loadError')} <button type="button" className={styles.inlineButton}
          disabled={disabled} onClick={avatar.retry}>{t('avatar.retry')}</button>
      </p> : null}
      {error ? <p className={styles.error} role="alert">{t(error)}</p> : null}
      {notice ? <p className={styles.success} role="status">{t(notice)}</p> : null}
    </section>
  )
}
