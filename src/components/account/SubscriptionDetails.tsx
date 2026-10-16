import { useAccount } from '../../account/useAccount.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from '../../pages/PlansPage.module.css'

export function SubscriptionDetails() {
  const { usage, subscription } = useAccount()
  const { t, language } = useTranslation()
  const data = subscription.data
  const date = (value: string) => new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    dateStyle: 'long', timeStyle: 'short',
  }).format(new Date(value))

  return (
    <section className={styles.card} aria-labelledby="subscription-title" aria-busy={usage.loading || subscription.loading}>
      <h2 id="subscription-title">{t('plans.currentPlan')}</h2>
      {usage.loading || subscription.loading ? <p role="status">{t('plans.loading')}</p> : null}
      {usage.failed && usage.data ? <p className={styles.error} role="alert">{t('plans.stale')}</p> : null}
      {usage.data ? <>
        <p className={styles.planName}>{usage.data.plan_display_name}</p>
        <p className={styles.muted}>{t('plans.effectivePlan')}</p>
      </> : !usage.loading ? <p className={styles.muted}>{t('plans.unavailable')}</p> : null}
      {subscription.failed ? <p className={styles.error} role="alert">{t(data ? 'plans.stale' : 'plans.subscriptionError')}</p> : null}
      {data ? <>
        <dl className={styles.facts}>
          <div><dt>{t('plans.subscription')}</dt><dd>{data.plan_display_name}</dd></div>
          <div><dt>{t('plans.status')}</dt><dd>{t(`plans.status.${data.status}`)}</dd></div>
          {data.current_period_start ? <div><dt>{t('plans.periodStart')}</dt><dd>{date(data.current_period_start)}</dd></div> : null}
          {data.current_period_end ? <div><dt>{t('plans.periodEnd')}</dt><dd>{date(data.current_period_end)}</dd></div> : null}
        </dl>
        {data.cancel_at_period_end ? <p className={styles.warning}>{t('plans.cancelScheduled')}</p> : null}
        {data.status === 'PAST_DUE' ? <p className={styles.warning}>{t('plans.pastDue')}</p> : null}
      </> : null}
    </section>
  )
}
