import type { DocumentItem, LanguageCode } from '../../types/document.ts'
import { LanguagePicker } from '../languages/LanguagePicker.tsx'
import { DocumentActionsMenu, type DocumentAction } from './DocumentActionsMenu.tsx'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { ScrollSyncButton } from './ScrollSyncButton.tsx'
import { WorkspaceViewButton } from './WorkspaceViewButton.tsx'
import styles from './TopToolbar.module.css'

interface TopToolbarProps {
  document: DocumentItem
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  currentPage: number
  pageCount: number | null
  notesOpen: boolean
  isScrollSyncEnabled: boolean
  isDualPanelFullscreen: boolean
  isTranslating: boolean
  isDownloading: boolean
  canDownload: boolean
  canTranslate: boolean
  translationStatus: DocumentItem['status'] | null
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
  onPreviousPage: () => void
  onNextPage: () => void
  onTranslate: () => void
  onDownload: () => void
  onToggleNotes: () => void
  onToggleScrollSync: () => void
  onToggleDualPanelFullscreen: () => void
}

export function TopToolbar(props: TopToolbarProps) {
  const { t } = useTranslation()
  const { document, sourceLanguage, targetLanguage, currentPage, notesOpen, isScrollSyncEnabled, isDualPanelFullscreen, isTranslating, canTranslate, translationStatus } = props
  const translateLabel = isTranslating
    ? t('toolbar.translating')
    : document.waitingIssue
      ? t('toolbar.checkStatus')
      : translationStatus === 'processing'
        ? t(document.serverStatus === 'PENDING' ? 'toolbar.queued' : 'toolbar.processing')
        : translationStatus === 'ready'
          ? t('toolbar.translated')
          : translationStatus === 'failed'
            ? t('toolbar.retryTranslation')
            : t('toolbar.translate')
  const downloadTitle = props.isDownloading
    ? t('toolbar.downloading')
    : props.canDownload
      ? t('toolbar.downloadResult')
      : document.status === 'failed'
        ? t('workspace.downloadFailedTranslation')
        : document.status === 'processing'
          ? t('workspace.downloadProcessing')
          : t('workspace.downloadDraft')
  return (
    <header className={styles.toolbar}>
      <div className={styles.fileBlock}>
        <span className={styles.fileName}>{document.name}</span>
        <span className={styles.fileMeta}>
          {[props.pageCount === null ? t('viewer.pageCountUnknown') : t('toolbar.fileMeta', { pages: props.pageCount }), ...props.details].join(' · ')}
        </span>
      </div>
      <div className={styles.controls}>
        <LanguagePicker value={sourceLanguage} label={t('toolbar.sourceLanguage')} prefix={t('toolbar.from')} onChange={props.onSourceLanguageChange} />
        <button type="button" className={styles.swapButton} aria-label={t('toolbar.swapLanguages')} title={t('toolbar.swapLanguages')} onClick={props.onSwapLanguages}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5.5h9.5m0 0L10 3m2.5 2.5L10 8M13 10.5H3.5m0 0L6 8m-2.5 2.5L6 13" /></svg>
        </button>
        <LanguagePicker value={targetLanguage} label={t('toolbar.targetLanguage')} prefix={t('toolbar.to')} onChange={props.onTargetLanguageChange} />
        {props.glossaryTermCount && canTranslate && !document.waitingIssue ? (
          <label className={styles.glossaryToggle} title={t('glossary.hint')}>
            <input type="checkbox" checked={props.useGlossary} onChange={(event) => props.onUseGlossaryChange(event.currentTarget.checked)} />
            <span>{t('glossary.short', { count: props.glossaryTermCount })}</span>
          </label>
        ) : null}
        <button type="button" className={styles.translateButton} disabled={isTranslating || !canTranslate} onClick={props.onTranslate}>{translateLabel}</button>
      </div>
      <div className={styles.actions}>
        <div className={styles.pageNavigation}>
          <button type="button" aria-label={t('toolbar.previousPage')} onClick={props.onPreviousPage} disabled={props.pageCount === null || currentPage === 1}>‹</button>
          <span aria-live="polite">{props.pageCount === null ? '—' : `${currentPage} / ${props.pageCount}`}</span>
          <button type="button" aria-label={t('toolbar.nextPage')} onClick={props.onNextPage} disabled={props.pageCount === null || currentPage >= props.pageCount}>›</button>
        </div>
        <ScrollSyncButton isEnabled={isScrollSyncEnabled} onToggle={props.onToggleScrollSync} />
        <WorkspaceViewButton isEnabled={isDualPanelFullscreen} onToggle={props.onToggleDualPanelFullscreen} />
        <button type="button" className={styles.secondaryButton} disabled={props.isDownloading || !props.canDownload} aria-busy={props.isDownloading} title={downloadTitle} onClick={props.onDownload}>{t(props.isDownloading ? 'toolbar.downloading' : 'toolbar.download')}</button>
        <button type="button" className={`${styles.secondaryButton} ${notesOpen ? styles.activeAction : ''}`} aria-pressed={notesOpen} onClick={props.onToggleNotes}>{t('toolbar.notes')}</button>
        <DocumentActionsMenu actions={props.documentActions} />
      </div>
    </header>
  )
}
