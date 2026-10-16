import { Link } from 'react-router'
import { useAccount } from '../account/useAccount.ts'
import { SubscriptionDetails } from '../components/account/SubscriptionDetails.tsx'
import { TranslationUsage } from '../components/account/TranslationUsage.tsx'
import { useTranslation } from '../i18n/useTranslation.ts'
import styles from './PlansPage.module.css'

export function PlansPage() {
  const { usage, subscription, reload } = useAccount()
  const { t } = useTranslation()
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div><Link className={styles.back} to="/">{t('common.backToWorkspace')}</Link>
            <h1>{t('user.planAndLimits')}</h1>
            <p className={styles.muted}>{t('plans.description')}</p>
          </div>
          <button type="button" className={styles.refresh} disabled={usage.loading || subscription.loading}
            onClick={reload}>{t('plans.refresh')}</button>
        </header>
        <div className={styles.grid}><SubscriptionDetails /><TranslationUsage /></div>
        <section className={styles.card} aria-labelledby="upload-limits-title">
          <h2 id="upload-limits-title">{t('plans.fileLimits')}</h2>
          <p>{t('plans.fileLimitsDescription')}</p>
          <p className={styles.muted}>{t('plans.commonUploadLimits')}</p>
        </section>
        <p className={styles.note}>{t('plans.paymentNotConnected')}</p>
      </div>
    </div>
  )
}
