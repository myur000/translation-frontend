import { useOutletContext } from 'react-router'
import { useTranslation } from '../i18n/useTranslation.ts'
import type { AppLayoutContextValue } from '../layouts/AppLayout.tsx'
import { getLanguageLabel } from '../types/document.ts'
import { documentStatusLabel } from '../documents/documentStatusLabel.ts'
import styles from './HistoryPage.module.css'

export function HistoryPage() {
  const { language, t } = useTranslation()
  const { documents, historyState, retryHistory, selectDocument } =
    useOutletContext<AppLayoutContextValue>()
  const historyDocuments = documents.filter((document) => document.jobId)

  return (
    <section className={styles.page}>
      <header>
        <p>{t('history.eyebrow')}</p>
        <h1>{t('history.title')}</h1>
        <span>{t('history.description')}</span>
      </header>

      {historyState === 'loading' ? (
        <p className={styles.state} role="status">{t('history.loading')}</p>
      ) : historyState === 'error' ? (
        <div className={styles.state} role="alert">
          <strong>{t('history.errorTitle')}</strong>
          <span>{t('history.errorDescription')}</span>
          <button type="button" onClick={retryHistory}>{t('history.retry')}</button>
        </div>
      ) : historyDocuments.length === 0 ? (
        <p className={styles.state}>{t('history.empty')}</p>
      ) : (
        <div className={styles.list}>
          {historyDocuments.map((document) => (
            <button
              type="button"
              className={styles.item}
              key={document.jobId}
              onClick={() => selectDocument(document.id)}
            >
              <span className={styles.fileType} aria-hidden="true">
                {document.name.split('.').at(-1)?.toUpperCase()}
              </span>
              <span className={styles.details}>
                <strong>{document.name}</strong>
                <small>
                  {getLanguageLabel(document.sourceLanguage, language)} →{' '}
                  {getLanguageLabel(document.targetLanguage, language)}
                </small>
                <code>{document.jobId}</code>
              </span>
              <span className={styles.status}>
                {t(documentStatusLabel(document))}
                {document.progress !== undefined ? ` · ${document.progress}%` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
