import { Link } from 'react-router'
import { isProfileResponse } from '../api/profile.ts'
import { useAuth } from '../auth/useAuth.ts'
import { ProfileAvatarEditor } from '../components/profile/ProfileAvatarEditor.tsx'
import { ProfileForm } from '../components/profile/ProfileForm.tsx'
import { SessionsSection } from '../components/profile/SessionsSection.tsx'
import { SecuritySection } from '../components/profile/security/SecuritySection.tsx'
import { useTranslation } from '../i18n/useTranslation.ts'
import { useProfile } from '../profile/useProfile.ts'
import styles from './ProfilePage.module.css'

export function ProfilePage() {
  const { profile, state, reload } = useProfile()
  const { session } = useAuth()
  const { t } = useTranslation()
  const valid = isProfileResponse(profile)
  // Почта входа: из профиля, а пока он грузится — из токена.
  const email = valid ? profile.email : session?.email ?? ''
  return (
    <div className={styles.page}>
      <div className={`${styles.container} ${styles.wide}`}>
        <header className={styles.header}>
          <Link to="/" className={styles.back}>{t('common.backToWorkspace')}</Link>
          <h1>{t('user.profile')}</h1>
          <p>{t('profile.pageDescription')}</p>
        </header>
        <div className={styles.layout}>
          <nav className={styles.nav} aria-label={t('profile.sections')}>
            <a href="#about">{t('profile.sectionAbout')}</a>
            <a href="#security">{t('security.title')}</a>
            <a href="#sessions">{t('sessions.title')}</a>
          </nav>
          <div className={styles.sections}>
            <section id="about" className={styles.section} aria-labelledby="about-title">
              <h2 id="about-title">{t('profile.sectionAbout')}</h2>
              <p className={styles.sectionLead}>{t('profile.description')}</p>
              {state === 'loading' ? <p role="status" className={styles.rowText}>{t('profile.loading')}</p> : null}
              {state === 'error' || (state === 'ready' && !valid) ? (
                <div role="alert" style={{ marginTop: 16 }}>
                  <p className={styles.error}>{t('profile.loadError')}</p>
                  <button type="button" className={styles.secondary} style={{ marginTop: 12 }} onClick={() => void reload()}>
                    {t('profile.retry')}
                  </button>
                </div>
              ) : null}
              {valid ? <div style={{ marginTop: 20 }}>
                <ProfileAvatarEditor key={profile.user_id + '-avatar'} />
                <ProfileForm key={profile.user_id} profile={profile} />
              </div> : null}
            </section>
            <SecuritySection email={email} />
            <SessionsSection />
          </div>
        </div>
      </div>
    </div>
  )
}
