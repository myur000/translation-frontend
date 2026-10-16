import { useAccount } from '../../account/useAccount.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from '../../pages/PlansPage.module.css'

export function TranslationUsage() {
  const { usage } = useAccount()
  const { t, language } = useTranslation()
  const data = usage.data
  const number = (value: number) => new Intl.NumberFormat(language).format(value)
  const reset = data ? new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    dateStyle: 'long', timeStyle: 'short',
  }).format(new Date(data.resets_at)) : null

  return (
    <section className={styles.card} aria-labelledby="translation-usage-title" aria-busy={usage.loading}>
      <h2 id="translation-usage-title">{t('plans.translations')}</h2>
      {usage.loading ? <p role="status">{t('plans.loading')}</p> : null}
      {usage.failed ? <p role="alert" className={styles.error}>{t(data ? 'plans.stale' : 'plans.usageError')}</p> : null}
      {data ? <>
        <p className={styles.planName}>{data.unlimited ? t('plans.unlimited')
          : t('plans.remaining', { count: number(data.remaining_units ?? 0) })}</p>
        <dl className={styles.facts}>
          <div><dt>{t('plans.occupied')}</dt><dd>{number(data.used_units)}</dd></div>
          <div><dt>{t('plans.monthlyLimit')}</dt><dd>{data.unlimited ? t('plans.unlimited') : number(data.limit_units!)}</dd></div>
        </dl>
        {!data.unlimited ? <progress className={styles.progress}
          aria-label={t('plans.occupied')} max={data.limit_units!}
          value={Math.min(data.used_units, data.limit_units!)} /> : null}
        <p className={styles.muted}>{t('plans.resets', { date: reset! })}</p>
        <p className={styles.muted}>{t('plans.reservedDescription')}</p>
        {!data.unlimited && data.remaining_units === 0 ? (
          <p className={styles.warning} role="status">{t('plans.exhausted')}</p>
        ) : null}
      </> : null}
    </section>
  )
}
