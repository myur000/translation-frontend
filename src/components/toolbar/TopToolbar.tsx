import { useTranslation } from '../../i18n/useTranslation.ts'
import { useLanguageCatalog } from '../../languages/useLanguageCatalog.ts'
import type { DocumentItem, LanguageCode } from '../../types/document.ts'
import { LanguagePicker } from '../languages/LanguagePicker.tsx'
import { DocumentActionsMenu, type DocumentAction } from './DocumentActionsMenu.tsx'
import styles from './TopToolbar.module.css'

interface TopToolbarProps {
  document: DocumentItem
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  pageCount: number | null
  isTranslating: boolean
  isDownloading: boolean
  canDownload: boolean
  canTranslate: boolean
  documentActions: DocumentAction[]
  /** Short facts under the file name: cost, glossary, pages. */
  details: string[]
  /** Terms available for the pair; the glossary option shows only when > 0. */
  glossaryTermCount: number | null
  useGlossary: boolean
  onUseGlossaryChange: (useGlossary: boolean) => void
  onSourceLanguageChange: (language: LanguageCode) => void
  onTargetLanguageChange: (language: LanguageCode) => void
  onSwapLanguages: () => void
  onTranslate: () => void
  onDownload: () => void
}

/**
 * What the toolbar offers depends on where the document is:
 * - `edit` — a draft or a failed job: choose languages and translate;
 * - `progress` — the job runs: languages are fixed, progress is shown;
 * - `done` — the result exists: downloading is the main action.
 * Other languages for an uploaded document are in the "⋯" menu.
 */
type ToolbarMode = 'edit' | 'progress' | 'done'

function toolbarMode(document: DocumentItem): ToolbarMode {
  if (!document.jobId || document.status === 'failed' || document.status === 'draft') return 'edit'
  return document.status === 'processing' ? 'progress' : 'done'
}

export function TopToolbar(props: TopToolbarProps) {
  const { t } = useTranslation()
  const { getLabel } = useLanguageCatalog()
  const { document, sourceLanguage, targetLanguage, isTranslating, canTranslate } = props
  const mode = toolbarMode(document)
  const meta = [
    props.pageCount === null ? t('viewer.pageCountUnknown') : t('toolbar.fileMeta', { pages: props.pageCount }),
    ...props.details,
  ].join(' · ')

  return (
    <header className={styles.toolbar}>
      <div className={styles.fileBlock}>
        <span className={styles.fileName} title={document.name}>{document.name}</span>
        <span className={styles.fileMeta}>{meta}</span>
      </div>

      <div className={styles.controls}>
        {mode === 'edit' ? (
          <>
            <LanguagePicker value={sourceLanguage} label={t('toolbar.sourceLanguage')} prefix={t('toolbar.from')} onChange={props.onSourceLanguageChange} />
            <button type="button" className={styles.swapButton} aria-label={t('toolbar.swapLanguages')} title={t('toolbar.swapLanguages')} onClick={props.onSwapLanguages}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5.5h9.5m0 0L10 3m2.5 2.5L10 8M13 10.5H3.5m0 0L6 8m-2.5 2.5L6 13" /></svg>
            </button>
            <LanguagePicker value={targetLanguage} label={t('toolbar.targetLanguage')} prefix={t('toolbar.to')} onChange={props.onTargetLanguageChange} />
            {props.glossaryTermCount && canTranslate ? (
              <label className={styles.glossaryToggle} title={t('glossary.hint')}>
                <input type="checkbox" checked={props.useGlossary} onChange={(event) => props.onUseGlossaryChange(event.currentTarget.checked)} />
                <span>{t('glossary.short', { count: props.glossaryTermCount })}</span>
              </label>
            ) : null}
            <button type="button" className={styles.primaryButton} disabled={isTranslating || !canTranslate} aria-busy={isTranslating} onClick={props.onTranslate}>
              {t(isTranslating
                ? 'toolbar.translating'
                : document.status === 'failed' ? 'toolbar.retryTranslation' : 'toolbar.translate')}
            </button>
          </>
        ) : (
          <span className={styles.languagePair}>
            <span className={styles.visuallyHidden}>{t('toolbar.languagePair')}: </span>
            {getLabel(document.sourceLanguage)}
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9.5m0 0L9.5 5m3 3-3 3" /></svg>
            <span className={styles.visuallyHidden}> → </span>
            {getLabel(document.targetLanguage)}
          </span>
        )}

        {mode === 'progress' ? (
          document.waitingIssue ? (
            <button type="button" className={styles.secondaryButton} onClick={props.onTranslate}>
              {t('toolbar.checkStatus')}
            </button>
          ) : (
            <ProgressPill document={document} />
          )
        ) : null}

        {mode === 'done' ? (
          <button
            type="button"
            className={styles.primaryButton}
            disabled={props.isDownloading || !props.canDownload}
            aria-busy={props.isDownloading}
            title={props.canDownload ? t('toolbar.downloadResult') : undefined}
            onClick={props.onDownload}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v8m0 0 3-3m-3 3-3-3M3 12.5h10" /></svg>
            {t(props.isDownloading ? 'toolbar.downloading' : 'toolbar.download')}
          </button>
        ) : null}

        <DocumentActionsMenu actions={props.documentActions} />
      </div>
    </header>
  )
}

function ProgressPill({ document }: { document: DocumentItem }) {
  const { t } = useTranslation()
  const isQueued = document.serverStatus === 'PENDING'
  const progress = document.progress ?? 0
  const label = isQueued ? t('toolbar.queued') : t('toolbar.progress', { progress })

  return (
    <div
      className={styles.progress}
      role="progressbar"
      aria-label={t('toolbar.progressLabel')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={isQueued ? undefined : progress}
      aria-valuetext={label}
    >
      <span className={`${styles.progressTrack} ${isQueued ? styles.progressIndeterminate : ''}`}>
        <span style={{ width: isQueued ? undefined : `${progress}%` }} />
      </span>
      <span className={styles.progressText}>{label}</span>
    </div>
  )
}
