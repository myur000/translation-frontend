import { LANGUAGE_OPTIONS, type DocumentItem, type LanguageCode } from '../../types/document.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { ScrollSyncButton } from './ScrollSyncButton.tsx'
import { WorkspaceViewButton } from './WorkspaceViewButton.tsx'
import styles from './TopToolbar.module.css'

const languageKeys = { en: 'language.en', ru: 'language.ru', de: 'language.de' } as const

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
  onSourceLanguageChange: (language: LanguageCode) => void
  onTargetLanguageChange: (language: LanguageCode) => void
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
        <span className={styles.fileMeta}>{props.pageCount === null ? t('viewer.pageCountUnknown') : t('toolbar.fileMeta', { pages: props.pageCount })}</span>
      </div>
      <div className={styles.controls}>
        <label className={styles.languageField}>
          <span>{t('toolbar.from')}</span>
          <select value={sourceLanguage} aria-label={t('toolbar.sourceLanguage')} onChange={(event) => props.onSourceLanguageChange(event.currentTarget.value as LanguageCode)}>
            {LANGUAGE_OPTIONS.map((item) => <option key={item.code} value={item.code}>{t(languageKeys[item.code])}</option>)}
          </select>
        </label>
        <span className={styles.direction} aria-hidden="true">→</span>
        <label className={styles.languageField}>
          <span>{t('toolbar.to')}</span>
          <select value={targetLanguage} aria-label={t('toolbar.targetLanguage')} onChange={(event) => props.onTargetLanguageChange(event.currentTarget.value as LanguageCode)}>
            {LANGUAGE_OPTIONS.map((item) => <option key={item.code} value={item.code}>{t(languageKeys[item.code])}</option>)}
          </select>
        </label>
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
      </div>
    </header>
  )
}
