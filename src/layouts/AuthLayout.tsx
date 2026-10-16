import { Outlet } from 'react-router'
import { ThemeToggle } from '../components/theme/ThemeToggle.tsx'
import { useTranslation } from '../i18n/useTranslation.ts'
import styles from './AuthLayout.module.css'

export function AuthLayout() {
  const { t } = useTranslation()
  return (
    <div className={styles.layout}>
      <main className={styles.formArea}>
        <ThemeToggle />
        <div className={styles.brand} aria-label="DocTranslate">
          <span>D</span><strong>DocTranslate</strong>
        </div>
        <div className={styles.formContainer}><Outlet /></div>
        <p className={styles.securityNote}>{t('auth.securityNote')}</p>
      </main>
      <aside className={styles.preview} aria-label={t('auth.previewLabel')}>
        <div className={styles.previewCopy}>
          <span>{t('auth.workspace')}</span>
          <h2>{t('auth.previewTitle')}</h2>
          <p>{t('auth.previewDescription')}</p>
        </div>
        <div className={styles.documents} aria-hidden="true">
          <div className={styles.document}>
            <span>Original · English</span><strong>Document translation</strong><i /><p /><p /><p />
          </div>
          <div className={styles.document}>
            <span>Translation · Russian</span><strong>Перевод документа</strong><i /><p /><p /><p />
          </div>
        </div>
      </aside>
    </div>
  )
}
