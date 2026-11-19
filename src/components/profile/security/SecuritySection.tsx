import { useTranslation } from '../../../i18n/useTranslation.ts'
import styles from '../../../pages/ProfilePage.module.css'
import { EmailChangeRow } from './EmailChangeRow.tsx'
import { PasswordChangeRow } from './PasswordChangeRow.tsx'
import { SecondFactorRow } from './SecondFactorRow.tsx'

export function SecuritySection({ email }: { email: string }) {
  const { t } = useTranslation()
  return (
    <section id="security" className={styles.section} aria-labelledby="security-title">
      <div className={styles.sectionCopy}>
        <h2 id="security-title">{t('security.title')}</h2>
        <p>{t('security.lead')}</p>
      </div>
      <ul className={`${styles.sectionBody} ${styles.rows}`}>
        <EmailChangeRow email={email} />
        <PasswordChangeRow />
        <SecondFactorRow />
      </ul>
    </section>
  )
}
