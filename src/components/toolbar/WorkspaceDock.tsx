import { useTranslation } from '../../i18n/useTranslation.ts'
import { useLanguageCatalog } from '../../languages/useLanguageCatalog.ts'
import { endedWithoutResult } from '../../documents/translationStatus.ts'
import type { DocumentItem, LanguageCode } from '../../types/document.ts'
import { LanguagePicker } from '../languages/LanguagePicker.tsx'
import { DocumentActionsMenu, type DocumentAction } from './DocumentActionsMenu.tsx'
import { ScrollSyncButton } from './ScrollSyncButton.tsx'
import { WorkspaceViewButton } from './WorkspaceViewButton.tsx'
import styles from './WorkspaceDock.module.css'

interface WorkspaceDockProps {
  document: DocumentItem
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  onSourceLanguageChange: (language: LanguageCode) => void
  onTargetLanguageChange: (language: LanguageCode) => void
  onSwapLanguages: () => void
  /** Нажатие на пару языков отправленного документа: перевод на другой язык. */
  onChooseLanguage: () => void
  /** Пункты меню «+»: глоссарий, другой язык и всё, что появится позже. */
  tools: DocumentAction[]
  currentPage: number
  pageCount: number | null
  onPreviousPage: () => void
  onNextPage: () => void
  isScrollSyncEnabled: boolean
  onToggleScrollSync: () => void
  isDualPanelFullscreen: boolean
  onToggleDualPanelFullscreen: () => void
  isTranslating: boolean
  canTranslate: boolean
  onTranslate: () => void
  /** Отмена идущего перевода; без него кнопка не показывается. */
  onCancelTranslation?: () => void
  isDownloading: boolean
  canDownload: boolean
  onDownload: () => void
}

/**
 * Что предлагает панель, зависит от состояния документа:
 * - `edit` — черновик, неудачная или отменённая задача: выбор языков и перевод;
 * - `progress` — задача выполняется: языки зафиксированы, показан прогресс и отмена;
 * - `done` — результат готов: главное действие — скачать.
 */
type DockMode = 'edit' | 'progress' | 'done'

function dockMode(document: DocumentItem): DockMode {
  if (!document.jobId || endedWithoutResult(document) || document.status === 'draft') return 'edit'
  return document.status === 'processing' ? 'progress' : 'done'
}

/**
 * Плавающая панель под документами, как поле ввода в чате: инструменты слева,
 * главное действие справа. Новые возможности добавляются в меню «+», а не в ряд кнопок.
 */
export function WorkspaceDock(props: WorkspaceDockProps) {
  const { t } = useTranslation()
  const { getLabel } = useLanguageCatalog()
  const { document, currentPage, pageCount } = props
  const mode = dockMode(document)

  return (
    <div className={styles.dock} role="toolbar" aria-label={t('dock.label')}>
      {props.tools.length ? (
        <DocumentActionsMenu
          className={styles.tools}
          variant="quiet"
          icon="plus"
          align="start"
          portal
          label={t('documentActions.tools')}
          actions={props.tools}
        />
      ) : null}

      {mode === 'edit' ? (
        <div className={styles.languages}>
          <LanguagePicker value={props.sourceLanguage} label={t('toolbar.sourceLanguage')} prefix={t('toolbar.from')} placement="top" onChange={props.onSourceLanguageChange} />
          <button type="button" className={styles.iconButton} aria-label={t('toolbar.swapLanguages')} title={t('toolbar.swapLanguages')} onClick={props.onSwapLanguages}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5.5h9.5m0 0L10 3m2.5 2.5L10 8M13 10.5H3.5m0 0L6 8m-2.5 2.5L6 13" /></svg>
          </button>
          <LanguagePicker value={props.targetLanguage} label={t('toolbar.targetLanguage')} prefix={t('toolbar.to')} placement="top" onChange={props.onTargetLanguageChange} />
        </div>
      ) : (
        // У отправленного документа язык оригинала уже закреплён за файлом на сервере,
        // поэтому плашка открывает перевод того же текста на другой язык.
        <button
          type="button"
          className={styles.languagePair}
          aria-haspopup="dialog"
          disabled={mode === 'progress'}
          title={mode === 'progress' ? t('documentActions.processing') : t('retranslate.title')}
          onClick={props.onChooseLanguage}
        >
          <span className={styles.visuallyHidden}>{t('toolbar.languagePair')}: </span>
          {getLabel(document.sourceLanguage)}
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9.5m0 0L9.5 5m3 3-3 3" /></svg>
          <span className={styles.visuallyHidden}> → </span>
          {getLabel(document.targetLanguage)}
          <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
        </button>
      )}

      <span className={styles.separator} aria-hidden="true" />

      <div className={styles.pages}>
        <button type="button" className={styles.iconButton} aria-label={t('toolbar.previousPage')} title={t('toolbar.previousPage')} onClick={props.onPreviousPage} disabled={pageCount === null || currentPage === 1}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3.5-4.5 4.5 4.5 4.5" /></svg>
        </button>
        <span aria-live="polite">
          {pageCount === null ? '—' : t('reader.page', { page: currentPage, total: pageCount })}
        </span>
        <button type="button" className={styles.iconButton} aria-label={t('toolbar.nextPage')} title={t('toolbar.nextPage')} onClick={props.onNextPage} disabled={pageCount === null || currentPage >= pageCount}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
        </button>
      </div>

      <span className={styles.separator} aria-hidden="true" />

      <div className={styles.view}>
        <ScrollSyncButton isEnabled={props.isScrollSyncEnabled} onToggle={props.onToggleScrollSync} />
        <WorkspaceViewButton isEnabled={props.isDualPanelFullscreen} onToggle={props.onToggleDualPanelFullscreen} />
      </div>

      <div className={styles.primary}>
        {mode === 'edit' ? (
          <button type="button" className={styles.primaryButton} disabled={props.isTranslating || !props.canTranslate} aria-busy={props.isTranslating} onClick={props.onTranslate}>
            {t(props.isTranslating
              ? 'toolbar.translating'
              : endedWithoutResult(document) ? 'toolbar.retryTranslation' : 'toolbar.translate')}
          </button>
        ) : null}
        {mode === 'progress' ? (
          document.waitingIssue ? (
            <button type="button" className={styles.secondaryButton} onClick={props.onTranslate}>
              {t('toolbar.checkStatus')}
            </button>
          ) : (
            <ProgressPill document={document} />
          )
        ) : null}
        {mode === 'progress' && props.onCancelTranslation ? (
          <button
            type="button"
            className={styles.secondaryButton}
            aria-haspopup="dialog"
            aria-label={t('documentActions.cancelTranslation')}
            title={t('documentActions.cancelTranslation')}
            onClick={props.onCancelTranslation}
          >
            {t('toolbar.cancelTranslation')}
          </button>
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
      </div>
    </div>
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

interface NotesToggleProps {
  isOpen: boolean
  onToggle: () => void
}

/**
 * Заметки вынесены в собственный блок рядом с панелью: в будущем это отдельный
 * большой раздел (заметки и граф связей), а не одна из кнопок просмотра.
 */
export function NotesToggle({ isOpen, onToggle }: NotesToggleProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      className={`${styles.notes} ${isOpen ? styles.notesActive : ''}`}
      aria-label={t('toolbar.notes')}
      aria-pressed={isOpen}
      title={t('toolbar.notes')}
      onClick={onToggle}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 17H5V3h7l3 3v3.5M12 3v3h3M7.5 8h5M7.5 11h3" />
        <path d="m11.8 17.6.6-2.6 4.6-4.6a1.3 1.3 0 0 1 1.9 1.9l-4.6 4.6z" />
      </svg>
    </button>
  )
}
