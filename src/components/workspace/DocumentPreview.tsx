import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject, type UIEventHandler } from 'react'
import { BOOK_ZOOM_STEP } from '../../hooks/useBookZoom.ts'
import { TRANSLATION_STALL_TIMEOUT_MS } from '../../config/translationPolling.ts'
import { usePreviewZoom } from '../../hooks/usePreviewZoom.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { languageTag } from '../../languages/languageCatalog.ts'
import type { TranslationKey } from '../../i18n/translations.ts'
import type { LanguageCode } from '../../types/document.ts'
import type { DocumentView } from '../../viewer/types.ts'
import { DocumentPages } from './DocumentPages.tsx'
import { PanelViewButton } from './PanelViewButton.tsx'
import { ZoomControls } from './ZoomControls.tsx'
import styles from './DocumentPreview.module.css'

/** Состояния оригинала, которые исправляет выбор файла на устройстве. */
const CHOOSE_ORIGINAL_MESSAGES = new Set<TranslationKey>([
  'viewer.originalMissing', 'viewer.originalExpired', 'viewer.invalidFile', 'viewer.passwordProtected',
])

interface DocumentPreviewProps {
  view: DocumentView
  label: string
  language: string
  languageCode: LanguageCode
  page: number
  navigationRevision: number
  isExpanded: boolean
  hideHeader: boolean
  zoom: number
  onZoomChange: (zoom: number) => void
  onToggleExpanded: () => void
  viewportRef: RefObject<HTMLDivElement | null>
  onViewportScroll: UIEventHandler<HTMLDivElement>
  onViewportRestore: () => void
  onVisiblePage: (page: number) => void
  onRetry: () => void
  onChooseOriginal?: (file: File) => string | null
}

export function DocumentPreview({
  view,
  label,
  language,
  languageCode,
  page,
  navigationRevision,
  isExpanded,
  hideHeader,
  zoom,
  onZoomChange,
  onToggleExpanded,
  viewportRef,
  onViewportScroll,
  onViewportRestore,
  onVisiblePage,
  onRetry,
  onChooseOriginal,
}: DocumentPreviewProps) {
  const { t } = useTranslation()
  const pageWidth = usePreviewZoom(viewportRef, zoom, onZoomChange)
  const lastNavigationRef = useRef(navigationRevision)
  const [selectionError, setSelectionError] = useState('')
  const chooseOriginal = onChooseOriginal
    ? (file: File) => setSelectionError(onChooseOriginal(file) ?? '')
    : null
  // Восстанавливаем ещё раз, если подгонка страницы меняет геометрию при монтировании.
  // При изменении только масштаба якорь сохраняет usePreviewZoom.
  useLayoutEffect(onViewportRestore, [pageWidth, view, onViewportRestore])
  useLayoutEffect(() => {
    if (lastNavigationRef.current === navigationRevision) return
    const viewport = viewportRef.current
    if (!viewport || view.status !== 'ready' || view.kind !== 'pdf') return
    const number = Math.min(page, view.pageCount)
    const target = viewport.querySelector<HTMLElement>(`[data-document-page="${number}"]`)
    if (!target) return
    lastNavigationRef.current = navigationRevision
    viewport.scrollTop += target.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 24
  }, [navigationRevision, page, viewportRef, view])
  return (
    <section className={styles.panel} aria-label={label}>
      <div
        ref={viewportRef}
        className={styles.viewport}
        role="region"
        aria-label={t('panel.scroll', { panel: label })}
        lang={languageTag(languageCode)}
        onScroll={(event) => {
          onViewportScroll(event)
          const pages = event.currentTarget.querySelectorAll<HTMLElement>('[data-document-page]')
          if (!pages.length) return
          const edge = event.currentTarget.getBoundingClientRect().top + event.currentTarget.clientHeight * 0.2
          let low = 0
          let high = pages.length - 1
          while (low < high) {
            const middle = Math.ceil((low + high) / 2)
            if (pages[middle].getBoundingClientRect().top <= edge) low = middle
            else high = middle - 1
          }
          onVisiblePage(Number(pages[low].dataset.documentPage))
        }}
        tabIndex={0}
        // Без title: системная подсказка всплывала над текстом при каждом наведении.
        // Подсказка о клавишах есть на кнопке масштаба и кнопке разворота панели.
        data-zoom={zoom}
        onKeyDown={(event) => {
          if (event.key === '+' || event.key === '=') {
            event.preventDefault()
            onZoomChange(zoom + BOOK_ZOOM_STEP)
          } else if (event.key === '-') {
            event.preventDefault()
            onZoomChange(zoom - BOOK_ZOOM_STEP)
          } else if (event.key === '0') {
            event.preventDefault()
            onZoomChange(100)
          }
        }}
      >
        <div className={`${styles.pages} ${view.status === 'ready' ? '' : styles.pagesMessage}`} style={{ '--book-zoom': zoom / 100, '--book-page-width': `${pageWidth}px` } as CSSProperties}>
          <DocumentPages view={view} width={pageWidth} zoom={zoom} viewportRef={viewportRef}
            noteAction={chooseOriginal ? <>
              <ChooseOriginalInput compact onChoose={chooseOriginal} />
              {selectionError ? <p className={styles.selectionError} role="alert">{selectionError}</p> : null}
            </> : null} />
          {view.status === 'loading' ? <p className={styles.state} role="status">{t('viewer.loading')}</p> : null}
          {view.status === 'message' ? <div className={styles.state}>
            <p>{t(view.message, { minutes: TRANSLATION_STALL_TIMEOUT_MS / 60_000 })}</p>
            {view.retry ? <button type="button" onClick={onRetry}>
              {t(view.message === 'viewer.translationStalled' || view.message === 'viewer.translationUnreachable'
                ? 'toolbar.checkStatus' : 'viewer.retry')}
            </button> : null}
            {CHOOSE_ORIGINAL_MESSAGES.has(view.message) && chooseOriginal
              ? <ChooseOriginalInput onChoose={chooseOriginal} /> : null}
            {selectionError ? <p role="alert">{selectionError}</p> : null}
          </div> : null}
        </div>
      </div>
      {/* Поверх непрерывной колонки вместо заголовка панели. */}
      {!hideHeader ? (
        <>
          <span className={styles.columnLabel}>
            <strong>{label}</strong>{' · '}{language}
          </span>
          <div className={styles.columnTools}>
            <ZoomControls label={label} zoom={zoom} onChange={onZoomChange} />
            <PanelViewButton panelLabel={label} isExpanded={isExpanded} onClick={onToggleExpanded} />
          </div>
        </>
      ) : null}
    </section>
  )
}

interface ChooseOriginalInputProps { onChoose: (file: File) => void; compact?: boolean }

/** Подпись-кнопка над скрытым полем файла: оригинал читается локально и никуда не отправляется. */
function ChooseOriginalInput({ onChoose, compact = false }: ChooseOriginalInputProps) {
  const { t } = useTranslation()
  return <label className={`${styles.chooseFile} ${compact ? styles.chooseFileCompact : ''}`}>
    {t('viewer.chooseOriginal')}
    <input type="file" accept=".pdf,.docx,.doc" aria-label={t('viewer.chooseOriginal')}
      onChange={(event) => {
        const file = event.currentTarget.files?.[0]
        if (file) onChoose(file)
        event.currentTarget.value = ''
      }} />
  </label>
}
