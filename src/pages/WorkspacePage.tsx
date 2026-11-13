import { lazy, Suspense, useEffect, useState, type CSSProperties, type MouseEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useOutletContext } from 'react-router'
import { ApiClientError } from '../api/client.ts'
import type { NoteQuoteResponse } from '../api/contracts/notes.ts'
import type { ShowQuoteResult } from '../components/notes/PanelNoteView.tsx'
import { QuoteSelectionButton } from '../components/notes/QuoteSelectionButton.tsx'
import { useQuoteSelection } from '../hooks/useQuoteSelection.ts'
import { findQuoteElement, revealQuoteElement } from '../notes/quoteHighlight.ts'
import type { QuoteSelection } from '../notes/quoteLocator.ts'
import type { DocumentAction } from '../components/toolbar/DocumentActionsMenu.tsx'
import { createIdempotencyKey } from '../api/idempotency.ts'
import { RetranslateDialog } from '../components/workspace/RetranslateDialog.tsx'
import { FeedbackPrompt } from '../components/workspace/FeedbackPrompt.tsx'
import {
  wasFeedbackPromptDismissed,
  type FeedbackPromptMode,
} from '../documents/feedbackPromptStorage.ts'
import { useGlossaryTermCount } from '../documents/useGlossaryTermCount.ts'
import { DocumentHeader } from '../components/toolbar/DocumentHeader.tsx'
import { NotesToggle, WorkspaceDock } from '../components/toolbar/WorkspaceDock.tsx'
import { DeleteDocumentDialog } from '../components/workspace/DeleteDocumentDialog.tsx'
import { CancelTranslationDialog } from '../components/workspace/CancelTranslationDialog.tsx'
import { documentMenuActions } from '../documents/documentMenuActions.ts'
import { canCancelTranslation, endedWithoutResult } from '../documents/translationStatus.ts'
import { usePinnedDocuments } from '../documents/pinnedDocuments.ts'
import { wantsFeedbackPrompt } from '../documents/documentRoutes.ts'
import { OriginalPanel } from '../components/workspace/OriginalPanel.tsx'
import { TranslationPanel } from '../components/workspace/TranslationPanel.tsx'
import {
  NOTES_MAX_WIDTH,
  NOTES_MIN_WIDTH,
  useResizableNotesPanel,
} from '../hooks/useResizableNotesPanel.ts'
import { useElementHeight } from '../hooks/useElementHeight.ts'
import { useSynchronizedScroll } from '../hooks/useSynchronizedScroll.ts'
import { useBookZoom } from '../hooks/useBookZoom.ts'
import { useTranslationDownload } from '../hooks/useTranslationDownload.ts'
import { useDocumentAssets } from '../hooks/useDocumentAssets.ts'
import { useDocumentView } from '../hooks/useDocumentView.ts'
import { DocumentUploadPreparationError } from '../errors/DocumentUploadPreparationError.ts'
import { isQuotaExceeded } from '../documents/documentErrors.ts'
import type {
  AppLayoutContextValue,
  ExpandedPanel,
} from '../layouts/AppLayout.tsx'
import type { TranslationKey } from '../i18n/translations.ts'
import { useTranslation } from '../i18n/useTranslation.ts'
import { toCatalogLanguageCode } from '../languages/languageCatalog.ts'
import { useLanguageCatalog } from '../languages/useLanguageCatalog.ts'
import type { DocumentItem, LanguageCode } from '../types/document.ts'
import styles from './WorkspacePage.module.css'

type FullscreenView = 'both' | Exclude<ExpandedPanel, null>
const fullscreenCodeShortcuts: Partial<Record<string, FullscreenView>> = {
  KeyF: 'both', KeyD: 'original', KeyG: 'translation',
}
const fullscreenKeyShortcuts: Partial<Record<string, FullscreenView>> = {
  f: 'both', d: 'original', g: 'translation',
  а: 'both', в: 'original', п: 'translation',
}
const fullscreenNumberShortcuts: Partial<Record<string, FullscreenView>> = {
  '1': 'original', '2': 'translation', '3': 'both',
}

interface DocumentWorkspaceProps {
  document: DocumentItem
  expandedPanel: ExpandedPanel
  isDualPanelFullscreen: boolean
  isScrollSyncEnabled: boolean
  onExpandedPanelChange: (panel: ExpandedPanel) => void
  onDualPanelFullscreenChange: (isFullscreen: boolean) => void
  onToggleScrollSync: () => void
  onStartTranslation: AppLayoutContextValue['startDocumentTranslation']
  onAttachOriginal: AppLayoutContextValue['attachOriginal']
  onResumeTranslationWaiting: AppLayoutContextValue['resumeTranslationWaiting']
  onRetranslate: AppLayoutContextValue['retranslateDocument']
  onDelete: AppLayoutContextValue['deleteDocument']
  onCancelTranslation: AppLayoutContextValue['cancelTranslation']
}

/** `choose-language` — тот же перевод на другой язык, но со сразу раскрытым списком языков. */
type WorkspaceDialog = 'retranslate' | 'choose-language' | 'delete' | 'cancel' | null

function DocumentWorkspace({
  document,
  expandedPanel,
  isDualPanelFullscreen,
  isScrollSyncEnabled,
  onExpandedPanelChange,
  onDualPanelFullscreenChange,
  onToggleScrollSync,
  onStartTranslation,
  onAttachOriginal,
  onResumeTranslationWaiting,
  onRetranslate,
  onDelete,
  onCancelTranslation,
}: DocumentWorkspaceProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { isPinned, setPinned } = usePinnedDocuments()
  const { getLabel: getLanguageLabel } = useLanguageCatalog()
  // У старых документов двухбуквенные коды; бэкенд теперь принимает только NLLB.
  const [sourceLanguage, setSourceLanguage] = useState(() => toCatalogLanguageCode(document.sourceLanguage))
  const [targetLanguage, setTargetLanguage] = useState(() => toCatalogLanguageCode(document.targetLanguage))
  const [currentPage, setCurrentPage] = useState(1)
  const [navigationRevision, setNavigationRevision] = useState(0)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [isTranslating, setTranslating] = useState(false)
  const [dialog, setDialog] = useState<WorkspaceDialog>(null)
  const [feedbackPrompt, setFeedbackPrompt] = useState<FeedbackPromptMode | null>(null)
  const [topChromeRef, topChromeHeight] = useElementHeight<HTMLDivElement>()
  const [bottomChromeRef, bottomChromeHeight] = useElementHeight<HTMLDivElement>()
  // Оценку можно попросить из боковой панели: она открывает документ с отметкой в адресе.
  const [handledFeedbackRequest, setHandledFeedbackRequest] = useState<string | null>(null)
  if (wantsFeedbackPrompt(location.state) && handledFeedbackRequest !== location.key) {
    setHandledFeedbackRequest(location.key)
    if (document.status === 'ready' && document.jobId) setFeedbackPrompt('manual')
  }
  useEffect(() => {
    // Отметку снимаем, чтобы «Назад» и перезагрузка не открывали оценку снова.
    if (wantsFeedbackPrompt(location.state)) {
      void navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.state, navigate])
  // Предлагаем оценку, когда документ завершается, пока он открыт. Корректировка
  // состояния во время рендера (а не в эффекте) избавляет от лишней отрисовки.
  const [observedStatus, setObservedStatus] = useState(document.status)
  if (observedStatus !== document.status) {
    setObservedStatus(document.status)
    // «Отправлен на перевод, статус обновится» устаревает, как только задача закончилась,
    // и не должен заслонять итог: ошибку, отмену или возврат страниц.
    if (observedStatus === 'processing') setNotice('')
    if (observedStatus === 'processing' && document.status === 'ready' && document.jobId &&
        !wasFeedbackPromptDismissed(document.jobId)) {
      setFeedbackPrompt('auto')
    }
  }
  const [useGlossary, setUseGlossary] = useState(false)
  // Загрузить с глоссарием из панели можно только локальный файл.
  const canUploadFile = Boolean(document.sourceFile) &&
    (!document.jobId || endedWithoutResult(document))
  const glossaryTermCount = useGlossaryTermCount(sourceLanguage, targetLanguage, canUploadFile)
  const notesPanel = useResizableNotesPanel()
  const synchronizedScroll = useSynchronizedScroll(
    isScrollSyncEnabled,
    `${expandedPanel ?? 'both'}:${isDualPanelFullscreen}:${notesOpen}:${notesPanel.width}`,
  )
  const bookZoom = useBookZoom(isScrollSyncEnabled)
  const translationDownload = useTranslationDownload(document)
  const visibleNotice = notice || translationDownload.notice
  const isNoticeError = !notice && translationDownload.isError
  const assets = useDocumentAssets(document)
  const originalView = useDocumentView(assets.original)
  const translationView = useDocumentView(assets.translation)
  const counts = [originalView, translationView].flatMap((view) =>
    view.status === 'ready' && view.kind === 'pdf' ? [view.pageCount] : [])
  const pageCount = counts.length ? Math.max(...counts) : null
  const displayedPage = Math.min(currentPage, pageCount ?? 1)
  const navigatePage = (direction: number) => {
    if (!pageCount) return
    setCurrentPage(Math.max(1, Math.min(pageCount, displayedPage + direction)))
    setNavigationRevision((value) => value + 1)
  }
  const notesVisible = notesOpen
  // Цитировать можно только готовый перевод: backend принимает цитаты из документов DONE.
  const canQuote = Boolean(document.jobId) && document.status === 'ready'
  const quoteSelection = useQuoteSelection(synchronizedScroll.originalRef, synchronizedScroll.translationRef, canQuote)
  const [pendingQuote, setPendingQuote] = useState<QuoteSelection | null>(null)
  const showQuote = (quote: NoteQuoteResponse): ShowQuoteResult => {
    // Колонка скрыта, когда другая развёрнута на весь экран: её ref пуст.
    const viewport = quote.side === 'SOURCE' ? synchronizedScroll.originalRef.current : synchronizedScroll.translationRef.current
    if (!viewport) return 'hidden'
    const element = findQuoteElement(viewport, quote.paragraph_index, quote.quote)
    if (!element) return 'notFound'
    revealQuoteElement(element)
    return 'shown'
  }
  const isImmersiveMode = isDualPanelFullscreen || expandedPanel !== null

  useEffect(() => {
    if (!isImmersiveMode) return
    const viewport = expandedPanel === 'translation'
      ? synchronizedScroll.translationRef.current
      : synchronizedScroll.originalRef.current
    if (!viewport) return
    // Фокус переносится в колонку, чтобы стрелки и PageUp/PageDown сразу листали книгу.
    // После нажатия F браузер считает такой фокус клавиатурным и обводит всю колонку;
    // метка data-quiet-focus гасит кольцо до первой потери фокуса (стиль в DocumentPreview.module.css).
    viewport.setAttribute('data-quiet-focus', '')
    viewport.addEventListener('blur', () => viewport.removeAttribute('data-quiet-focus'), { once: true })
    viewport.focus({ preventScroll: true })
  }, [isImmersiveMode, expandedPanel, synchronizedScroll.originalRef, synchronizedScroll.translationRef])

  useEffect(() => {
    const handleViewKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing) return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return

      const letterView = fullscreenCodeShortcuts[event.code] ??
        fullscreenKeyShortcuts[event.key.toLowerCase()]
      const view = letterView ?? (isImmersiveMode ? fullscreenNumberShortcuts[event.key] : null)
      if (!view) return
      event.preventDefault()

      const isCurrentView = view === 'both'
        ? isDualPanelFullscreen
        : expandedPanel === view
      if (letterView && isCurrentView) {
        onExpandedPanelChange(null)
        onDualPanelFullscreenChange(false)
      } else {
        if (!isImmersiveMode) setNotesOpen(false)
        onExpandedPanelChange(view === 'both' ? null : view)
        onDualPanelFullscreenChange(view === 'both')
      }
    }
    window.addEventListener('keydown', handleViewKey)
    return () => window.removeEventListener('keydown', handleViewKey)
  }, [isImmersiveMode, isDualPanelFullscreen, expandedPanel, onExpandedPanelChange, onDualPanelFullscreenChange])

  const handleToggleScrollSync = () => {
    if (!isScrollSyncEnabled) bookZoom.synchronizeZoom()
    onToggleScrollSync()
  }

  const handleSourceLanguageChange = (language: LanguageCode) => {
    const previousSourceLanguage = sourceLanguage
    setSourceLanguage(language)

    if (language === targetLanguage) {
      setTargetLanguage(previousSourceLanguage)
    }

    setNotice('')
  }

  const handleTargetLanguageChange = (language: LanguageCode) => {
    const previousTargetLanguage = targetLanguage
    setTargetLanguage(language)

    if (language === sourceLanguage) {
      setSourceLanguage(previousTargetLanguage)
    }

    setNotice('')
  }

  const handleSwapLanguages = () => {
    setSourceLanguage(targetLanguage)
    setTargetLanguage(sourceLanguage)
    setNotice('')
  }

  const handleTranslate = async () => {
    if (document.waitingIssue) {
      setNotice('')
      onResumeTranslationWaiting(document.id)
      return
    }
    // Неудачную или отменённую задачу можно повторить по исходнику, который хранится на сервере.
    if (!document.sourceFile && document.jobId && endedWithoutResult(document)) {
      if (sourceLanguage !== toCatalogLanguageCode(document.sourceLanguage)) {
        setNotice(t('retranslate.needsFile'))
        return
      }
      setTranslating(true)
      setNotice('')
      try {
        await onRetranslate(document.id, {
          targetLanguage,
          useGlossary: false,
          idempotencyKey: createIdempotencyKey(),
        })
      } catch (error) {
        setNotice(translationErrorMessage(error))
      } finally {
        setTranslating(false)
      }
      return
    }
    if (!document.sourceFile) {
      setNotice(
        t('workspace.translateReady', {
          name: document.name,
          source: getLanguageLabel(sourceLanguage),
          target: getLanguageLabel(targetLanguage),
        }),
      )
      return
    }

    setTranslating(true)
    setNotice('')
    try {
      const response = await onStartTranslation(
        document.id,
        sourceLanguage,
        targetLanguage,
        { useGlossary: useGlossary && Boolean(glossaryTermCount) },
      )
      setNotice(
        t('workspace.uploadStarted', {
          name: document.name,
          jobId: response.job_id,
        }),
      )
    } catch (error) {
      setNotice(translationErrorMessage(error))
    } finally {
      setTranslating(false)
    }
  }

  function translationErrorMessage(error: unknown) {
    if (error instanceof DocumentUploadPreparationError) return error.message
    if (!(error instanceof ApiClientError)) return t('workspace.uploadFailed')
    if (error.status === 403) return t('workspace.verifyEmailBeforeUpload')
    if (error.status === 410) return t('retranslate.sourceExpired')
    if (error.status === 413) return t('workspace.uploadTooLargeBackend')
    if (error.status === 429) {
      return isQuotaExceeded(error) ? t('plans.uploadQuotaExceeded') : t('workspace.uploadRateLimit')
    }
    return error.details?.message || t('workspace.uploadFailed')
  }

  const details: string[] = []
  if (pageCount !== null) details.push(t('toolbar.fileMeta', { pages: pageCount }))
  if (!document.jobId && document.estimate) {
    details.push(t('estimate.cost', { units: document.estimate.billedUnits }))
  } else if (document.billedUnits && document.quotaRefund !== 'REFUNDED') {
    // Возвращённые после отмены страницы не считаются списанными.
    details.push(t('document.billed', { units: document.billedUnits }))
  }
  if (document.jobId && document.glossaryTermCount != null) {
    details.push(document.glossaryTermCount > 0
      ? t('glossary.applied', { count: document.glossaryTermCount })
      : t('glossary.appliedNone'))
  }
  const quotaWarning = !document.jobId && document.estimate && !document.estimate.enoughQuota
    ? t('estimate.notEnough', {
        units: document.estimate.billedUnits,
        remaining: document.estimate.remainingUnits ?? 0,
      })
    : ''

  const statusNotice = document.status === 'failed'
    ? document.errorMessage || t('workspace.translationFailed')
    : document.status === 'canceled' ? t(canceledNoticeKey(document.quotaRefund)) : ''

  const canTranslate = Boolean(document.waitingIssue) || !document.jobId || endedWithoutResult(document)
  const headerActions = documentMenuActions({
    document,
    t,
    isPinned: isPinned(document.jobId),
    onTogglePin: () => { if (document.jobId) setPinned(document.jobId, !isPinned(document.jobId)) },
    onRate: () => setFeedbackPrompt('manual'),
    onRetranslate: () => setDialog('retranslate'),
    onCancelTranslation: () => setDialog('cancel'),
    onDelete: () => document.jobId ? setDialog('delete') : void onDelete(document.id),
  })
  // Меню «+» нижней панели: всё, что меняет сам перевод.
  const tools: DocumentAction[] = []
  if (canUploadFile && canTranslate && glossaryTermCount) {
    tools.push({
      id: 'glossary',
      label: t('glossary.apply', { count: glossaryTermCount }),
      checked: useGlossary,
      onSelect: () => setUseGlossary((value) => !value),
    })
  }
  if (document.jobId) {
    tools.push({
      id: 'retranslate',
      label: t('documentActions.retranslate'),
      icon: 'language',
      disabledReason: document.status === 'processing' ? t('documentActions.processing') : undefined,
      onSelect: () => setDialog('retranslate'),
    })
  }

  const handleDownload = () => {
    setNotice('')
    void translationDownload.download()
  }

  const handleToggleNotes = () => {
    setNotesOpen((isOpen) => !isOpen)
  }

  const handlePanelExpandToggle = (panel: Exclude<ExpandedPanel, null>) => {
    if (expandedPanel !== panel) {
      onDualPanelFullscreenChange(false)
      setNotesOpen(false)
    }

    onExpandedPanelChange(expandedPanel === panel ? null : panel)
  }

  const handleDualPanelFullscreenToggle = () => {
    const nextFullscreenState = !isDualPanelFullscreen

    if (nextFullscreenState) {
      onExpandedPanelChange(null)
      setNotesOpen(false)
    }

    onDualPanelFullscreenChange(nextFullscreenState)
  }

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!isImmersiveMode) return
    event.preventDefault()
    setNotesOpen(true)
  }

  return (
    <div
      className={`${styles.workspace} ${isImmersiveMode ? styles.immersiveWorkspace : ''}`}
      style={{
        '--chrome-top': `${topChromeHeight}px`,
        '--chrome-bottom': `${bottomChromeHeight}px`,
      } as CSSProperties}
      onContextMenu={handleContextMenu}
    >
      {/* Панели плавают над колонками чтения; текст прокручивается под ними. */}
      {!isImmersiveMode ? (
        <div ref={topChromeRef} className={styles.topChrome}>
          <DocumentHeader
            document={document}
            details={details}
            isPinned={isPinned(document.jobId)}
            actions={headerActions}
          />
          {visibleNotice || quotaWarning || statusNotice ? (
            <div
              className={`${styles.notice} ${quotaWarning && !visibleNotice ? styles.noticeWarning : ''}`}
              role={isNoticeError || (document.status === 'failed' && !visibleNotice) ? 'alert' : 'status'}
            >
              {visibleNotice || quotaWarning || statusNotice}
              {visibleNotice ? (
                <button
                  type="button"
                  onClick={() => { setNotice(''); translationDownload.clearNotice() }}
                  aria-label={t('workspace.closeNotice')}
                >
                  ×
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={`${styles.workArea} ${notesVisible ? '' : styles.withoutNotes} ${expandedPanel !== null ? styles.singlePanel : ''} ${expandedPanel !== null && notesVisible ? styles.singlePanelWithNotes : ''} ${notesPanel.isResizing ? styles.resizing : ''} ${isImmersiveMode ? styles.immersiveWorkArea : ''}`}
        style={
          {
            '--notes-current-width': `${notesPanel.width}px`,
          } as CSSProperties
        }
      >
        {expandedPanel !== 'translation' ? (
          <OriginalPanel
            view={originalView}
            language={getLanguageLabel(sourceLanguage)}
            languageCode={sourceLanguage}
            page={displayedPage}
            navigationRevision={navigationRevision}
            onVisiblePage={setCurrentPage}
            onRetry={assets.retry}
            onChooseOriginal={(file) => onAttachOriginal(document.id, file)}
            isExpanded={expandedPanel === 'original'}
            hideHeader={isImmersiveMode}
            zoom={bookZoom.original}
            onZoomChange={(zoom) => bookZoom.changeZoom('original', zoom)}
            onToggleExpanded={() => handlePanelExpandToggle('original')}
            viewportRef={synchronizedScroll.originalRef}
            onViewportScroll={synchronizedScroll.handleOriginalScroll}
            onViewportRestore={synchronizedScroll.restoreOriginalScroll}
          />
        ) : null}
        {expandedPanel !== 'original' ? (
          <TranslationPanel
            view={translationView}
            language={getLanguageLabel(targetLanguage)}
            languageCode={targetLanguage}
            page={displayedPage}
            navigationRevision={navigationRevision}
            onVisiblePage={setCurrentPage}
            onRetry={document.waitingIssue
              ? () => onResumeTranslationWaiting(document.id)
              : assets.retry}
            isExpanded={expandedPanel === 'translation'}
            hideHeader={isImmersiveMode}
            zoom={bookZoom.translation}
            onZoomChange={(zoom) => bookZoom.changeZoom('translation', zoom)}
            onToggleExpanded={() => handlePanelExpandToggle('translation')}
            viewportRef={synchronizedScroll.translationRef}
            onViewportScroll={synchronizedScroll.handleTranslationScroll}
            onViewportRestore={synchronizedScroll.restoreTranslationScroll}
          />
        ) : null}
        {notesVisible ? (
          <div className={styles.notesArea}>
            <div
              className={`${styles.notesResizeHandle} ${notesPanel.isResizing ? styles.notesResizeHandleActive : ''}`}
              role="separator"
              aria-label={t('notes.resize')}
              aria-orientation="vertical"
              aria-valuemin={NOTES_MIN_WIDTH}
              aria-valuemax={NOTES_MAX_WIDTH}
              aria-valuenow={notesPanel.width}
              aria-valuetext={t('sidebar.pixels', { value: notesPanel.width })}
              tabIndex={0}
              onPointerDown={notesPanel.handleResizeStart}
              onPointerMove={notesPanel.handleResizeMove}
              onPointerUp={notesPanel.handleResizeEnd}
              onPointerCancel={notesPanel.handleResizeEnd}
              onKeyDown={notesPanel.handleResizeKeyDown}
              onDoubleClick={notesPanel.resetWidth}
              title={t('sidebar.resizeHint')}
            />
            <Suspense fallback={<p className={styles.notesLoading} role="status">{t('notes.loading')}</p>}>
            <WorkspaceNotesPanel
              document={document}
              pendingQuote={pendingQuote}
              onQuoteFinished={() => { setPendingQuote(null); quoteSelection.clear() }}
              onShowQuote={showQuote}
              onClose={() => { setNotesOpen(false); setPendingQuote(null) }}
            />
            </Suspense>
          </div>
        ) : null}
      </div>

      {!isImmersiveMode ? (
        <div ref={bottomChromeRef} className={styles.bottomChrome}>
          <span className={styles.dockSpacer} aria-hidden="true" />
          <WorkspaceDock
            document={document}
            sourceLanguage={sourceLanguage}
            targetLanguage={targetLanguage}
            onSourceLanguageChange={handleSourceLanguageChange}
            onTargetLanguageChange={handleTargetLanguageChange}
            onSwapLanguages={handleSwapLanguages}
            onChooseLanguage={() => setDialog('choose-language')}
            tools={tools}
            currentPage={displayedPage}
            pageCount={pageCount}
            onPreviousPage={() => navigatePage(-1)}
            onNextPage={() => navigatePage(1)}
            isScrollSyncEnabled={isScrollSyncEnabled}
            onToggleScrollSync={handleToggleScrollSync}
            isDualPanelFullscreen={isDualPanelFullscreen}
            onToggleDualPanelFullscreen={handleDualPanelFullscreenToggle}
            isTranslating={isTranslating}
            canTranslate={canTranslate}
            onTranslate={() => void handleTranslate()}
            onCancelTranslation={canCancelTranslation(document) ? () => setDialog('cancel') : undefined}
            isDownloading={translationDownload.isDownloading}
            canDownload={translationDownload.canDownload}
            onDownload={handleDownload}
          />
          <div className={styles.notesSlot}>
            <NotesToggle isOpen={notesVisible} onToggle={handleToggleNotes} />
          </div>
        </div>
      ) : null}

      {dialog === 'retranslate' || dialog === 'choose-language' ? (
        <RetranslateDialog
          document={document}
          openLanguageList={dialog === 'choose-language'}
          onSubmit={(request) => onRetranslate(document.id, request)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'delete' ? (
        <DeleteDocumentDialog document={document} onDelete={onDelete} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'cancel' ? (
        <CancelTranslationDialog
          document={document}
          onCancelTranslation={onCancelTranslation}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {feedbackPrompt && document.jobId && !isImmersiveMode ? (
        <FeedbackPrompt
          key={document.jobId}
          jobId={document.jobId}
          documentName={document.name}
          mode={feedbackPrompt}
          onClose={() => setFeedbackPrompt(null)}
        />
      ) : null}
      {/* Пока цитата оформляется в панели, кнопка над старым выделением только мешает. */}
      {quoteSelection.selection && !pendingQuote ? (
        <QuoteSelectionButton
          selection={quoteSelection.selection}
          onQuote={() => {
            const { rect: _rect, ...selection } = quoteSelection.selection!
            setPendingQuote(selection)
            setNotesOpen(true)
          }}
        />
      ) : null}
    </div>
  )
}

/** Что стало со страницами отменённого перевода; до ответа сервера — просто «отменён». */
function canceledNoticeKey(quotaRefund: DocumentItem['quotaRefund']): TranslationKey {
  if (quotaRefund === 'REFUNDED') return 'workspace.canceledRefunded'
  if (quotaRefund === 'PENDING') return 'workspace.canceledRefundPending'
  if (quotaRefund === 'NONE') return 'workspace.canceledNoRefund'
  return 'workspace.canceled'
}

// Панель заметок с парсером Markdown нужна, только когда её открыли: грузится отдельно.
const WorkspaceNotesPanel = lazy(() => import('../components/notes/WorkspaceNotesPanel.tsx')
  .then((module) => ({ default: module.WorkspaceNotesPanel })))

export function WorkspacePage() {
  const {
    activeDocument,
    routeDocumentState,
    historyState,
    expandedPanel,
    isDualPanelFullscreen,
    setExpandedPanel,
    setDualPanelFullscreen,
    retryHistory,
    startDocumentTranslation,
    attachOriginal,
    resumeTranslationWaiting,
    retranslateDocument,
    deleteDocument,
    cancelTranslation,
  } = useOutletContext<AppLayoutContextValue>()
  const { t } = useTranslation()
  const [isScrollSyncEnabled, setIsScrollSyncEnabled] = useState(false)

  // Черновики живут только до перезагрузки; их старый адрес ведёт на главную.
  if (!activeDocument && routeDocumentState === 'draft-missing') {
    return <Navigate to="/" replace />
  }

  if (!activeDocument && routeDocumentState === 'missing') {
    return (
      <section className={styles.emptyWorkspace} role="alert">
        <span aria-hidden="true">▤</span>
        <h1>{t('document.missingTitle')}</h1>
        <p>{t('document.missingDescription')}</p>
        <Link to="/">{t('common.backToWorkspace')}</Link>
      </section>
    )
  }

  if (!activeDocument && routeDocumentState === 'loading') {
    return (
      <section className={styles.emptyWorkspace} role="status">
        <span aria-hidden="true">▤</span>
        <h1>{t('document.opening')}</h1>
      </section>
    )
  }

  if (!activeDocument) {
    return (
      <section className={styles.emptyWorkspace}>
        <span aria-hidden="true">▤</span>
        <h1>
          {historyState === 'loading'
            ? t('history.loading')
            : historyState === 'error' || routeDocumentState === 'error'
              ? t('history.errorTitle')
              : t('workspace.emptyTitle')}
        </h1>
        <p>
          {historyState === 'error' || routeDocumentState === 'error'
            ? t('history.errorDescription')
            : t('workspace.emptyDescription')}
        </p>
        {historyState === 'error' || routeDocumentState === 'error' ? (
          <button type="button" onClick={retryHistory}>
            {t('history.retry')}
          </button>
        ) : null}
      </section>
    )
  }

  return (
    <DocumentWorkspace
      key={activeDocument.id}
      document={activeDocument}
      expandedPanel={expandedPanel}
      isDualPanelFullscreen={isDualPanelFullscreen}
      isScrollSyncEnabled={isScrollSyncEnabled}
      onExpandedPanelChange={setExpandedPanel}
      onDualPanelFullscreenChange={setDualPanelFullscreen}
      onToggleScrollSync={() =>
        setIsScrollSyncEnabled((isEnabled) => !isEnabled)
      }
      onStartTranslation={startDocumentTranslation}
      onAttachOriginal={attachOriginal}
      onResumeTranslationWaiting={resumeTranslationWaiting}
      onRetranslate={retranslateDocument}
      onDelete={deleteDocument}
      onCancelTranslation={cancelTranslation}
    />
  )
}
