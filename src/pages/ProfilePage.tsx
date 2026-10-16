import { Link } from 'react-router'
import { isProfileResponse } from '../api/profile.ts'
import { ProfileAvatarEditor } from '../components/profile/ProfileAvatarEditor.tsx'
import { LogoutAllSection } from '../components/profile/LogoutAllSection.tsx'
import { ProfileForm } from '../components/profile/ProfileForm.tsx'
import { useTranslation } from '../i18n/useTranslation.ts'
import { useProfile } from '../profile/useProfile.ts'
import styles from './ProfilePage.module.css'

export function ProfilePage() {
  const { profile, state, reload } = useProfile()
  const { t } = useTranslation()
  const valid = isProfileResponse(profile)
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link to="/" className={styles.back}>{t('common.backToWorkspace')}</Link>
          <h1>{t('user.profile')}</h1>
          <p>{t('profile.description')}</p>
        </header>
        {state === 'loading' ? <p role="status">{t('profile.loading')}</p> : null}
        {state === 'error' || (state === 'ready' && !valid) ? (
          <section className={styles.card} role="alert">
            <p>{t('profile.loadError')}</p>
            <button type="button" className={styles.secondary} onClick={() => void reload()}>
              {t('profile.retry')}
            </button>
          </section>
        ) : null}
        {valid ? <ProfileAvatarEditor key={profile.user_id + '-avatar'} /> : null}
        {valid ? <ProfileForm key={profile.user_id} profile={profile} /> : null}
        <LogoutAllSection />
      </div>
    </div>
  )
}
