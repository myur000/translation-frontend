import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAccount } from '../../account/useAccount.ts'
import {
  countBy,
  HISTORY_PATH,
  HISTORY_STATUSES,
  historyDocuments,
  historySearch,
  languagePair,
  readHistoryQuery,
  statusGroup,
  type HistoryQuery,
} from '../../history/historyQuery.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { shortLanguageCode } from '../../languages/languageCatalog.ts'
import { useLanguageCatalog } from '../../languages/useLanguageCatalog.ts'
import type { DocumentItem } from '../../types/document.ts'
import styles from './HistorySidebarPanel.module.css'

interface HistorySidebarPanelProps {
  documents: DocumentItem[]
}

/** Панель истории: фильтры по статусу и языкам и расход страниц за месяц. Пишет в адрес `/history`. */
export function HistorySidebarPanel({ documents }: HistorySidebarPanelProps) {
  const { t, language } = useTranslation()
  const { getLabel } = useLanguageCatalog()
  const { usage } = useAccount()
  const location = useLocation()
  const navigate = useNavigate()
  const isHistoryRoute = location.pathname === HISTORY_PATH
  const query = readHistoryQuery(isHistoryRoute ? location.search : '')
  const all = historyDocuments(documents)
  const statuses = countBy(all, statusGroup)
  const pairs = [...countBy(all, languagePair)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const go = (next: Partial<HistoryQuery>) => {
    void navigate({ pathname: HISTORY_PATH, search: historySearch({ ...query, ...next }) }, { replace: isHistoryRoute })
  }
  const data = usage.data
  const number = (value: number) => new Intl.NumberFormat(language).format(value)
  const [today] = useState(() => new Date())
  const month = new Intl.DateTimeFormat(language, { month: 'long' }).format(today)

  return (
    <div className={styles.panel}>
      <section className={styles.section} aria-labelledby="history-status">
        <h3 id="history-status">{t('history.statusTitle')}</h3>
        <ul className={styles.list}>
          {HISTORY_STATUSES.filter((status) => status === 'all' || status !== 'canceled' || statuses.get('canceled')).map((status) => {
            const count = status === 'all' ? all.length : statuses.get(status) ?? 0
            return (
              <li key={status}>
                <button type="button" className={`${styles.row} ${status === 'failed' && count ? styles.failed : ''}`}
                  aria-pressed={query.status === status} onClick={() => go({ status })}>
                  <span>{t(`history.status.${status}`)}</span>{' '}
                  <span className={styles.count}>{count}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {pairs.length > 1 ? (
        <section className={styles.section} aria-labelledby="history-pairs">
          <h3 id="history-pairs">{t('history.languages')}</h3>
          <ul className={styles.list}>
            {pairs.map(([pair, count]) => {
              const [source, target] = pair.split('>')
              return (
                <li key={pair}>
                  <button type="button" className={styles.row} aria-pressed={query.pair === pair}
                    title={`${getLabel(source)} → ${getLabel(target)}`}
                    onClick={() => go({ pair: query.pair === pair ? null : pair })}>
                    <span>{shortLanguageCode(source)} → {shortLanguageCode(target)}</span>{' '}
                    <span className={styles.count}>{count}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {data ? (
        <section className={styles.usage} aria-labelledby="history-usage">
          <h3 id="history-usage">{month}</h3>
          <p className={styles.spent}><strong>{number(data.used_units)}</strong> {t('history.spent')}</p>
          {data.unlimited ? <p className={styles.left}>{t('plans.unlimited')}</p> : (
            <>
              <progress className={styles.meter} max={data.limit_units ?? 0} value={Math.min(data.used_units, data.limit_units ?? 0)}
                aria-label={t('history.spentOf', { used: number(data.used_units), limit: number(data.limit_units ?? 0) })} />
              <p className={styles.left}>{t('history.left', { left: number(data.remaining_units ?? 0), limit: number(data.limit_units ?? 0) })}</p>
            </>
          )}
          <Link to="/plans" className={styles.plans}>{t('history.plans')}</Link>
        </section>
      ) : null}
    </div>
  )
}
