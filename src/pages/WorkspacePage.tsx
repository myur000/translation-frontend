import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react'
import { Link, useOutletContext } from 'react-router'
import { ApiClientError } from '../api/client.ts'
import { API_ENDPOINTS } from '../api/endpoints.ts'
import { NotesPanel } from '../components/notes/NotesPanel.tsx'
import type { DocumentAction } from '../components/toolbar/DocumentActionsMenu.tsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.tsx'
import { createIdempotencyKey } from '../api/idempotency.ts'
import { RetranslateDialog } from '../components/workspace/RetranslateDialog.tsx'
import { TranslationFeedback } from '../components/workspace/TranslationFeedback.tsx'
import { useGlossaryTermCount } from '../documents/useGlossaryTermCount.ts'
import { TopToolbar } from '../components/toolbar/TopToolbar.tsx'
import { OriginalPanel } from '../components/workspace/OriginalPanel.tsx'
import { TranslationPanel } from '../components/workspace/TranslationPanel.tsx'
import {
  NOTES_MAX_WIDTH,
  NOTES_MIN_WIDTH,
  useResizableNotesPanel,
} from '../hooks/useResizableNotesPanel.ts'
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
}

type WorkspaceDialog = 'retranslate' | 'delete' | null

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
}: DocumentWorkspaceProps) {
  const { t } = useTranslation()
  const { getLabel: getLanguageLabel } = useLanguageCatalog()
  // Old documents carry two-letter codes; the backend now accepts only NLLB.
  const [sourceLanguage, setSourceLanguage] = useState(() => toCatalogLanguageCode(document.sourceLanguage))
  const [targetLanguage, setTargetLanguage] = useState(() => toCatalogLanguageCode(document.targetLanguage))
  const [currentPage, setCurrentPage] = useState(1)
  const [navigationRevision, setNavigationRevision] = useState(0)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [isTranslating, setTranslating] = useState(false)
  const [dialog, setDialog] = useState<WorkspaceDialog>(null)
  const [isDeleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [useGlossary, setUseGlossary] = useState(false)
  // Only a local file can be uploaded with a glossary from the toolbar.
  const canUploadFile = Boolean(document.sourceFile) &&
    (!document.jobId || document.status === 'failed')
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
  const isImmersiveMode = isDualPanelFullscreen || expandedPanel !== null

  useEffect(() => {
    if (!isImmersiveMode) return
    const viewport = expandedPanel === 'translation'
      ? synchronizedScroll.translationRef.current
      : synchronizedScroll.originalRef.current
    viewport?.focus({ preventScroll: true })
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
    // A failed job can be retried from the source kept on the server.
    if (!document.sourceFile && document.jobId && document.status === 'failed') {
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
          endpoint: API_ENDPOINTS.documents.upload,
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

  const handleDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete(document.id)
      // The workspace unmounts with the deleted document.
    } catch (error) {
      setDeleteError(error instanceof ApiClientError && error.status === 409
        ? t('delete.processing')
        : t('delete.failed'))
      setDeleting(false)
    }
  }

  const details: string[] = []
  if (!document.jobId && document.estimate) {
    details.push(t('estimate.cost', { units: document.estimate.billedUnits }))
  } else if (document.billedUnits) {
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

  const isUploaded = Boolean(document.jobId)
  const isProcessing = document.status === 'processing'
  const documentActions: DocumentAction[] = [
    {
      id: 'retranslate',
      label: t('documentActions.retranslate'),
      disabledReason: !isUploaded
        ? t('documentActions.notUploaded')
        : isProcessing ? t('documentActions.processing') : undefined,
      onSelect: () => setDialog('retranslate'),
    },
    isUploaded
      ? {
          id: 'delete',
          label: t('documentActions.delete'),
          danger: true,
          disabledReason: isProcessing ? t('documentActions.processing') : undefined,
          onSelect: () => {
            setDeleteError(null)
            setDialog('delete')
          },
        }
      : {
          id: 'remove-draft',
          label: t('documentActions.removeDraft'),
          danger: true,
          onSelect: () => void onDelete(document.id),
        },
  ]

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
      onContextMenu={handleContextMenu}
    >
      {!isImmersiveMode ? (
        <TopToolbar
        document={document}
        sourceLanguage={sourceLanguage}
        targetLanguage={targetLanguage}
        currentPage={displayedPage}
        pageCount={pageCount}
        notesOpen={notesVisible}
        isScrollSyncEnabled={isScrollSyncEnabled}
        isDualPanelFullscreen={isDualPanelFullscreen}
        isTranslating={isTranslating}
        isDownloading={translationDownload.isDownloading}
        canDownload={translationDownload.canDownload}
        canTranslate={
          Boolean(document.waitingIssue) ||
          !document.jobId ||
          document.status === 'failed'
        }
        translationStatus={document.jobId ? document.status : null}
        documentActions={documentActions}
        details={details}
        glossaryTermCount={canUploadFile ? glossaryTermCount : null}
        useGlossary={useGlossary}
        onUseGlossaryChange={setUseGlossary}
        onSourceLanguageChange={handleSourceLanguageChange}
        onTargetLanguageChange={handleTargetLanguageChange}
        onSwapLanguages={handleSwapLanguages}
        onPreviousPage={() => navigatePage(-1)}
        onNextPage={() => navigatePage(1)}
        onTranslate={() => void handleTranslate()}
        onDownload={handleDownload}
        onToggleNotes={handleToggleNotes}
        onToggleScrollSync={handleToggleScrollSync}
        onToggleDualPanelFullscreen={handleDualPanelFullscreenToggle}
      />
      ) : null}

      {!isImmersiveMode && (visibleNotice || quotaWarning || document.status === 'failed') ? (
        <div
          className={`${styles.notice} ${quotaWarning && !visibleNotice ? styles.noticeWarning : ''}`}
          role={isNoticeError || (document.status === 'failed' && !visibleNotice) ? 'alert' : 'status'}
        >
          {visibleNotice || quotaWarning || document.errorMessage || t('workspace.translationFailed')}
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
            headerExtra={document.status === 'ready' && document.jobId
              ? <TranslationFeedback key={document.jobId} jobId={document.jobId} />
              : null}
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
            <NotesPanel onClose={() => setNotesOpen(false)} />
          </div>
        ) : null}
      </div>

      {dialog === 'retranslate' ? (
        <RetranslateDialog
          document={document}
          onSubmit={(request) => onRetranslate(document.id, request)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'delete' ? (
        <ConfirmDialog
          title={t('delete.title', { name: document.name })}
          description={t('delete.description')}
          confirmLabel={t('delete.confirm')}
          busy={isDeleting}
          error={deleteError}
          onConfirm={() => void handleDelete()}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
}

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
  } = useOutletContext<AppLayoutContextValue>()
  const { t } = useTranslation()
  const [isScrollSyncEnabled, setIsScrollSyncEnabled] = useState(false)

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
    />
  )
}
