import { useState, type CSSProperties } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router'
import { DocumentActionsMenu } from '../components/toolbar/DocumentActionsMenu.tsx'
import { DeleteDocumentDialog } from '../components/workspace/DeleteDocumentDialog.tsx'
import { RetranslateDialog } from '../components/workspace/RetranslateDialog.tsx'
import { bookTitle, coverTone } from '../documents/bookTitle.ts'
import { documentStatusLabel } from '../documents/documentStatusLabel.ts'
import {
  dayLabel,
  filterHistory,
  groupByDay,
  HISTORY_PATH,
  historyDocuments,
  historySearch,
  readHistoryQuery,
  statusGroup,
} from '../history/historyQuery.ts'
import { useTranslation } from '../i18n/useTranslation.ts'
import type { AppLayoutContextValue } from '../layouts/AppLayout.tsx'
import { shortLanguageCode } from '../languages/languageCatalog.ts'
import { useLanguageCatalog } from '../languages/useLanguageCatalog.ts'
import type { DocumentItem } from '../types/document.ts'
import styles from './HistoryPage.module.css'

type Dialog = { kind: 'retranslate'; document: DocumentItem; retry: boolean } | { kind: 'delete'; document: DocumentItem }

export function HistoryPage() {
  const { t, tc, language } = useTranslation()
  const { getLabel } = useLanguageCatalog()
  const { documents, historyState, retryHistory, selectDocument, retranslateDocument, deleteDocument } =
    useOutletContext<AppLayoutContextValue>()
  const location = useLocation()
  const navigate = useNavigate()
  const query = readHistoryQuery(location.search)
  const all = historyDocuments(documents)
  const shown = filterHistory(all, query)
  const [now] = useState(() => new Date())
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const isFiltered = query.status !== 'all' || Boolean(query.pair)
  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' })
  const words = { today: t('notes.home.today'), yesterday: t('notes.home.yesterday'), undated: t('history.undated') }
  const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase(language) + value.slice(1)

  const meta = (document: DocumentItem) => [
    `${shortLanguageCode(document.sourceLanguage)} → ${shortLanguageCode(document.targetLanguage)}`,
    document.billedUnits ? t('history.pages', { count: document.billedUnits }) : null,
    document.glossaryTermCount === null || document.glossaryTermCount === undefined
      ? t('history.noGlossary')
      : tc('history.glossary', document.glossaryTermCount),
  ].filter(Boolean).join(' · ')

  let content
  if (historyState === 'loading' && !all.length) {
    content = <p className={styles.state} role="status">{t('history.loading')}</p>
  } else if (historyState === 'error' && !all.length) {
    content = (
      <div className={styles.state} role="alert">
        <strong>{t('history.errorTitle')}</strong>
        <span>{t('history.errorDescription')}</span>
        <button type="button" onClick={retryHistory}>{t('history.retry')}</button>
      </div>
    )
  } else if (!all.length) {
    content = <p className={styles.empty}>{t('history.empty')}</p>
  } else if (!shown.length) {
    content = (
      <div className={styles.none}>
        <span>{t('history.nothingFound')}</span>
        <button type="button" onClick={() => void navigate({ pathname: HISTORY_PATH, search: '' }, { replace: true })}>
          {t('notes.home.resetFilter')}
        </button>
      </div>
    )
  } else {
    content = groupByDay(shown).map((day) => (
      <section key={day.key} className={styles.day}>
        <h2 className={styles.dayTitle}>{capitalize(dayLabel(day, now, language, words))}</h2>
        <ul className={styles.rows}>
          {day.documents.map((document) => {
            const group = statusGroup(document)
            const created = document.createdAt ? new Date(document.createdAt) : null
            const title = bookTitle(document.name)
            return (
              <li key={document.id} className={styles.row}>
                <span className={styles.cover} aria-hidden="true"
                  style={{ '--book-tone': `var(--cover-${coverTone(document.name)})` } as CSSProperties} />
                <div className={styles.body}>
                  <button type="button" className={styles.title} onClick={() => selectDocument(document.id)}
                    title={t('history.openBook', { title })}>
                    {title}
                  </button>
                  <p className={styles.meta} title={`${getLabel(document.sourceLanguage)} → ${getLabel(document.targetLanguage)}`}>{meta(document)}</p>
                  {group === 'active' && document.progress !== undefined ? (
                    <progress className={styles.progress} max={100} value={document.progress}
                      aria-label={t('history.progress', { title, progress: document.progress })} />
                  ) : null}
                  {group === 'failed' && document.errorMessage ? <p className={styles.error}>{document.errorMessage}</p> : null}
                </div>
                <div className={styles.side}>
                  {group === 'failed' ? (
                    <button type="button" className={styles.retry} onClick={() => setDialog({ kind: 'retranslate', document, retry: true })}>
                      {t('history.retryTranslation')}
                    </button>
                  ) : (
                    <span className={`${styles.pill} ${styles[`pill_${group}`]}`}>
                      {t(documentStatusLabel(document))}
                      {group === 'active' && document.progress !== undefined ? ` · ${document.progress}%` : ''}
                    </span>
                  )}
                  <span className={styles.when}>
                    {created && !Number.isNaN(created.getTime()) ? time.format(created) : null}
                    {group === 'ready' ? (
                      <>
                        {created ? ' · ' : null}
                        <button type="button" className={styles.open} onClick={() => selectDocument(document.id)}>{t('history.open')}</button>
                      </>
                    ) : null}
                  </span>
                </div>
                <DocumentActionsMenu
                  className={styles.menu}
                  variant="quiet"
                  portal
                  label={t('sidebar.documentActions', { name: document.name })}
                  actions={[
                    { id: 'open', label: t('history.openShort'), onSelect: () => selectDocument(document.id) },
                    { id: 'retranslate', label: t('documentActions.retranslate'), icon: 'language',
                      onSelect: () => setDialog({ kind: 'retranslate', document, retry: false }) },
                    { id: 'delete', label: t('documentActions.delete'), icon: 'trash', danger: true,
                      onSelect: () => setDialog({ kind: 'delete', document }) },
                  ]}
                />
              </li>
            )
          })}
        </ul>
      </section>
    ))
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('history.title')}</h1>
        {all.length ? <span className={styles.count}>{tc('history.documentCount', isFiltered ? shown.length : all.length)}</span> : null}
      </header>
      {isFiltered && shown.length ? (
        <p className={styles.filters}>
          {t('history.filtered')}
          <button type="button" onClick={() => void navigate({ pathname: HISTORY_PATH, search: historySearch({ status: 'all', pair: null }) }, { replace: true })}>
            {t('notes.home.resetFilter')}
          </button>
        </p>
      ) : null}
      {content}

      {dialog?.kind === 'retranslate' ? (
        <RetranslateDialog
          document={dialog.document}
          preset={dialog.retry ? { useGlossary: dialog.document.glossaryTermCount !== null && dialog.document.glossaryTermCount !== undefined } : undefined}
          onSubmit={(request) => retranslateDocument(dialog.document.id, request)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <DeleteDocumentDialog document={dialog.document} onDelete={deleteDocument} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  )
}
