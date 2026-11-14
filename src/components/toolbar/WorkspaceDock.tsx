import type { ReactNode } from 'react'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { endedWithoutResult } from '../../documents/translationStatus.ts'
import type { DocumentItem, LanguageCode } from '../../types/document.ts'
import { LanguagePicker } from '../languages/LanguagePicker.tsx'
import { DocumentActionsMenu, type DocumentAction } from './DocumentActionsMenu.tsx'
import styles from './WorkspaceDock.module.css'

interface WorkspaceDockProps {
  document: DocumentItem
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  onSourceLanguageChange: (language: LanguageCode) => void
  onTargetLanguageChange: (language: LanguageCode) => void
  onSwapLanguages: () => void
  /** Пункты меню «+»: глоссарий, другой язык и всё, что появится позже. */
  tools: DocumentAction[]
  currentPage: number
  pageCount: number | null
  onPreviousPage: () => void
  onNextPage: () => void
  isTranslating: boolean
  canTranslate: boolean
  onTranslate: () => void
  /** Отмена идущего перевода; без него кнопка не показывается. */
  onCancelTranslation?: () => void
  /** Управление видом (раскладка, прокрутка, полный экран) — средняя часть панели. */
  view: ReactNode
}

/**
 * Что предлагает панель, зависит от состояния документа:
 * - `edit` — черновик, неудачная или отменённая задача: выбор языков и перевод;
 * - `progress` — задача выполняется: языки зафиксированы, показан прогресс и отмена;
 * - `done` — результат готов: только инструменты, страницы и вид; скачивание — в меню «⋯» документа.
 *
 * У отправленного документа пары языков в панели нет: коды языков уже написаны на
 * страницах переключателя вида, а перевод на другой язык — в меню «+» и «⋯».
 */
type DockMode = 'edit' | 'progress' | 'done'

function dockMode(document: DocumentItem): DockMode {
  if (!document.jobId || endedWithoutResult(document) || document.status === 'draft') return 'edit'
  return document.status === 'processing' ? 'progress' : 'done'
}

/**
 * Плавающая панель под документами, как поле ввода в чате: инструменты слева, вид
 * посередине, главное действие справа. Одна панель, а не две карточки рядом: при
 * смене раскладки или состояния меняется только её содержимое. Новые возможности
 * добавляются в меню «+», а не в ряд кнопок.
 */
export function WorkspaceDock(props: WorkspaceDockProps) {
  const { t } = useTranslation()
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
          <LanguagePicker value={props.sourceLanguage} label={t('toolbar.sourceLanguage')} prefix={t('toolbar.from')} placement="top" compact onChange={props.onSourceLanguageChange} />
          <button type="button" className={styles.iconButton} aria-label={t('toolbar.swapLanguages')} title={t('toolbar.swapLanguages')} onClick={props.onSwapLanguages}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5.5h9.5m0 0L10 3m2.5 2.5L10 8M13 10.5H3.5m0 0L6 8m-2.5 2.5L6 13" /></svg>
          </button>
          <LanguagePicker value={props.targetLanguage} label={t('toolbar.targetLanguage')} prefix={t('toolbar.to')} placement="top" compact onChange={props.onTargetLanguageChange} />
        </div>
      ) : null}

      {/* Номера страниц есть только у PDF; у DOCX и текста стрелкам нечего листать. */}
      {pageCount !== null ? (
        <>
          <span className={styles.separator} aria-hidden="true" />

          <div className={styles.pages}>
            <button type="button" className={styles.iconButton} aria-label={t('toolbar.previousPage')} title={t('toolbar.previousPage')} onClick={props.onPreviousPage} disabled={currentPage === 1}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3.5-4.5 4.5 4.5 4.5" /></svg>
            </button>
            <span aria-live="polite">
              {t('reader.page', { page: currentPage, total: pageCount })}
            </span>
            <button type="button" className={styles.iconButton} aria-label={t('toolbar.nextPage')} title={t('toolbar.nextPage')} onClick={props.onNextPage} disabled={currentPage >= pageCount}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
            </button>
          </div>
        </>
      ) : null}

      {props.tools.length || mode === 'edit' || pageCount !== null ? (
        <span className={styles.separator} aria-hidden="true" />
      ) : null}
      {props.view}

      {mode !== 'done' ? (
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
        </div>
      ) : null}
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
