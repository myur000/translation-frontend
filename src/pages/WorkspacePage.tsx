import { lazy, Suspense, useEffect, useEffectEvent, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { Link, Navigate, useLocation, useNavigate, useOutletContext } from 'react-router'
import { ApiClientError } from '../api/client.ts'
import type { NoteQuoteResponse } from '../api/contracts/notes.ts'
import type { ShowQuoteResult } from '../components/notes/PanelNoteView.tsx'
import type { NotesFrame, NotesPanelRequest } from '../components/notes/WorkspaceNotesPanel.tsx'
import { NotesPill } from '../components/notes/NotesPill.tsx'
import { QuoteMarkers } from '../components/workspace/QuoteMarkers.tsx'
import { useBookQuotes } from '../notes/useBookQuotes.ts'
import { useNotes } from '../notes/useNotes.ts'
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
import { WorkspaceDock } from '../components/toolbar/WorkspaceDock.tsx'
import { WorkspaceViewBar } from '../components/toolbar/WorkspaceViewBar.tsx'
import { DeleteDocumentDialog } from '../components/workspace/DeleteDocumentDialog.tsx'
import { CancelTranslationDialog } from '../components/workspace/CancelTranslationDialog.tsx'
import { documentMenuActions, readingToggle } from '../documents/documentMenuActions.ts'
import { canCancelTranslation, endedWithoutResult } from '../documents/translationStatus.ts'
import { usePinnedDocuments } from '../documents/pinnedDocuments.ts'
import { wantsFeedbackPrompt } from '../documents/documentRoutes.ts'
import { OriginalPanel } from '../components/workspace/OriginalPanel.tsx'
import { TranslationPanel } from '../components/workspace/TranslationPanel.tsx'
import { useElementHeight } from '../hooks/useElementHeight.ts'
import { useElementSize } from '../hooks/useElementSize.ts'
import { useMediaQuery } from '../hooks/useMediaQuery.ts'
import { useSynchronizedScroll } from '../hooks/useSynchronizedScroll.ts'
import { useBookZoom } from '../hooks/useBookZoom.ts'
import { useTranslationDownload } from '../hooks/useTranslationDownload.ts'
import { useDocumentAssets } from '../hooks/useDocumentAssets.ts'
import { useDocumentView } from '../hooks/useDocumentView.ts'
import { DocumentUploadPreparationError } from '../errors/DocumentUploadPreparationError.ts'
import { isQuotaExceeded } from '../documents/documentErrors.ts'
import type { AppLayoutContextValue } from '../layouts/AppLayout.tsx'
import type { TranslationKey } from '../i18n/translations.ts'
import { useTranslation } from '../i18n/useTranslation.ts'
import { usePreferences } from '../preferences/usePreferences.ts'
import { shortLanguageCode, toCatalogLanguageCode } from '../languages/languageCatalog.ts'
import { useLanguageCatalog } from '../languages/useLanguageCatalog.ts'
import type { DocumentItem, LanguageCode } from '../types/document.ts'
import { useDocumentLayout } from '../workspace/useDocumentLayout.ts'
import { useReadingProgress } from '../reading/readingProgress.ts'
import { useReadingTracker } from '../reading/useReadingTracker.ts'
import { notesPresentation, useNotesPanel } from '../workspace/useNotesPanel.ts'
import { useNotesWindow } from '../workspace/useNotesWindow.ts'
import { windowArea } from '../workspace/notesWindowGeometry.ts'
import {
  isSinglePane,
  LAYOUT_PRESETS,
  layoutPreset,
  showsPane,
  type LayoutPreset,
  type ReadingPane,
  type WorkspaceLayout,
} from '../workspace/workspaceLayout.ts'
import styles from './WorkspacePage.module.css'
import { GlyphIcon } from '../components/ui/GlyphIcon.tsx'

// Полноэкранный режим: F — сравнение, D — оригинал, G — перевод (и в русской раскладке).
const fullscreenCodeShortcuts: Partial<Record<string, LayoutPreset>> = {
  KeyF: 'compare', KeyD: 'original', KeyG: 'translation',
}
const fullscreenKeyShortcuts: Partial<Record<string, LayoutPreset>> = {
  f: 'compare', d: 'original', g: 'translation',
  а: 'compare', в: 'original', п: 'translation',
}
// Внутри полноэкранного режима цифры переключают вид, не выходя из него.
const fullscreenNumberShortcuts: Partial<Record<string, LayoutPreset>> = {
  '1': 'original', '2': 'translation', '3': 'compare',
}
// N (и «т» в русской раскладке) открывает и прячет заметки.
const NOTES_SHORTCUT_CODE = 'KeyN'
const NOTES_SHORTCUT_KEYS = new Set(['n', 'т'])
// Ширина, с которой рабочая область перестраивается под телефон (см. WorkspacePage.module.css).
const NARROW_SCREEN = '(max-width: 680px)'
// Отступ пилюли от нижней панели: над кнопками масштаба колонки (DocumentPreview.module.css).
const NOTES_PILL_OFFSET = 56
// Вкладка «Граф» в окне заметок: включится вместе с графом.
const NOTES_GRAPH_TAB = false

interface DocumentWorkspaceProps {
  document: DocumentItem
  fullscreenLayout: AppLayoutContextValue['fullscreenLayout']
  isScrollSyncEnabled: boolean
  onFullscreenLayoutChange: AppLayoutContextValue['setFullscreenLayout']
  onToggleScrollSync: () => void
  onStartTranslation: AppLayoutContextValue['startDocumentTranslation']
  onAttachOriginal: AppLayoutContextValue['attachOriginal']
  onResumeTranslationWaiting: AppLayoutContextValue['resumeTranslationWaiting']
  onRetranslate: AppLayoutContextValue['retranslateDocument']
  onDelete: AppLayoutContextValue['deleteDocument']
  onCancelTranslation: AppLayoutContextValue['cancelTranslation']
  onConnectNotes: AppLayoutContextValue['connectWorkspaceNotes']
}

type WorkspaceDialog = 'retranslate' | 'delete' | 'cancel' | null

function DocumentWorkspace({
  document,
  fullscreenLayout,
  isScrollSyncEnabled,
  onFullscreenLayoutChange,
  onToggleScrollSync,
  onStartTranslation,
  onAttachOriginal,
  onResumeTranslationWaiting,
  onRetranslate,
  onDelete,
  onCancelTranslation,
  onConnectNotes,
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
  // Сохранённая раскладка документа; полноэкранный режим временно показывает свою поверх неё.
  const [layout, setLayout] = useDocumentLayout(document.jobId)
  const visibleLayout = fullscreenLayout ?? layout
  const isImmersiveMode = fullscreenLayout !== null
  // Заметки — окно над книгой, пилюля или колонка у края. Панель монтируется при
  // первом открытии и дальше только прячется: открытая заметка и начатая цитата
  // переживают сворачивание, смену вида и полноэкранный режим.
  const notesPanel = useNotesPanel()
  const notesPanelId = useId()
  const isNarrowScreen = useMediaQuery(NARROW_SCREEN)
  const notesView = notesPresentation(notesPanel, { isImmersive: isImmersiveMode, isNarrow: isNarrowScreen })
  const isNotesShown = notesView === 'docked' || notesView === 'floating' || notesView === 'sheet'
  const [isNotesMounted, setNotesMounted] = useState(notesPanel.isOpen)
  if (notesPanel.isOpen && !isNotesMounted) setNotesMounted(true)
  const [shellRef, shellSize] = useElementSize<HTMLDivElement>()
  const notesWindow = useNotesWindow({
    rect: notesPanel.floatRect,
    // Окно лежит в рабочей области между верхней и нижней панелями.
    area: shellSize.width > 0 ? windowArea(shellSize.width, shellSize.height, topChromeHeight, bottomChromeHeight) : null,
    onChange: notesPanel.setFloatRect,
    onInteractionChange: notesPanel.setInteracting,
  })
  const notesWindowRef = useRef<HTMLDivElement>(null)
  const notesPillRef = useRef<HTMLButtonElement>(null)
  // Куда перевести фокус, когда окно развернётся или свернётся в пилюлю.
  const pendingNotesFocusRef = useRef<'window' | 'pill' | null>(null)
  useEffect(() => {
    const target = pendingNotesFocusRef.current
    if (target === 'window' && notesView === 'floating') notesWindowRef.current?.focus()
    else if (target === 'pill' && notesView === 'collapsed') notesPillRef.current?.focus()
    else return
    pendingNotesFocusRef.current = null
  }, [notesView])
  // Кнопка в доке и N: показанные заметки закрывают, иначе показывают в последнем виде.
  const toggleNotes = () => (isNotesShown ? notesPanel.close() : notesPanel.reveal())
  // Иконка «Заметки» в рельсе боковой панели управляет этим же окном. Наверх уходит
  // стабильная функция: свежий toggleNotes берётся из ref в момент клика.
  const toggleNotesRef = useRef(toggleNotes)
  useEffect(() => { toggleNotesRef.current = toggleNotes })
  useEffect(() => {
    onConnectNotes({ isShown: isNotesShown, toggle: () => toggleNotesRef.current() })
  }, [isNotesShown, onConnectNotes])
  useEffect(() => () => onConnectNotes(null), [onConnectNotes])
  const synchronizedScroll = useSynchronizedScroll(
    isScrollSyncEnabled,
    // Колонка у края сужает книгу, окно лежит поверх и раскладку не меняет.
    `${layoutPreset(visibleLayout)}:${isImmersiveMode}:${notesView === 'docked'}:${notesPanel.side}:${notesPanel.width}`,
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
  // Цитировать можно только готовый перевод: backend принимает цитаты из документов DONE.
  const canQuote = Boolean(document.jobId) && document.status === 'ready'
  const quoteSelection = useQuoteSelection(synchronizedScroll.originalRef, synchronizedScroll.translationRef, canQuote)
  const [pendingQuote, setPendingQuote] = useState<QuoteSelection | null>(null)
  // Метки на полях: цитаты этой книги, перечитываются после каждой правки заметок.
  const { revision: notesRevision } = useNotes()
  const bookQuotes = useBookQuotes(canQuote ? document.jobId ?? null : null, notesRevision)
  const [notesRequest, setNotesRequest] = useState<NotesPanelRequest | null>(null)
  // Пилюля и закрытые заметки разворачиваются. Колонку полноэкранный режим прячет —
  // тогда выходим к раскладке документа; окно остаётся поверх книги.
  const revealNotes = () => {
    notesPanel.reveal()
    if (fullscreenLayout && notesPanel.mode === 'docked') onFullscreenLayoutChange(null)
  }
  const openNotesFromMarker = (noteIds: string[]) => {
    setNotesRequest((current) => ({ nonce: (current?.nonce ?? 0) + 1, noteIds }))
    revealNotes()
  }
  // Пилюля считает заметки книги по цитатам, которые уже загружены для меток.
  const bookNoteCount = new Set(bookQuotes.map((quote) => quote.noteId)).size
  const markersLayoutKey = `${layoutPreset(visibleLayout)}:${isImmersiveMode}`
  const reading = useReadingProgress()
  const readingJobId = document.status === 'ready' ? document.jobId ?? null : null
  // Прогресс считается по переводу, когда он на экране, иначе — по оригиналу.
  useReadingTracker(
    reading.email,
    readingJobId,
    showsPane(visibleLayout, 'translation') ? synchronizedScroll.translationRef : synchronizedScroll.originalRef,
    markersLayoutKey,
  )
  const showQuote = (quote: NoteQuoteResponse): ShowQuoteResult => {
    // Колонка скрыта раскладкой: её ref пуст.
    const viewport = quote.side === 'SOURCE' ? synchronizedScroll.originalRef.current : synchronizedScroll.translationRef.current
    if (!viewport) return 'hidden'
    const element = findQuoteElement(viewport, quote.paragraph_index, quote.quote)
    if (!element) return 'notFound'
    revealQuoteElement(element)
    return 'shown'
  }
  useEffect(() => {
    if (!fullscreenLayout) return
    // В сравнении фокус уходит в оригинал (левая колонка), иначе — в единственную колонку.
    const viewport = readingViewport(fullscreenLayout, synchronizedScroll.originalRef, synchronizedScroll.translationRef)
    if (!viewport) return
    // Фокус переносится в колонку, чтобы стрелки и PageUp/PageDown сразу листали книгу.
    // После нажатия F браузер считает такой фокус клавиатурным и обводит всю колонку;
    // метка data-quiet-focus гасит кольцо до первой потери фокуса (стиль в DocumentPreview.module.css).
    viewport.setAttribute('data-quiet-focus', '')
    viewport.addEventListener('blur', () => viewport.removeAttribute('data-quiet-focus'), { once: true })
    viewport.focus({ preventScroll: true })
  }, [fullscreenLayout, synchronizedScroll.originalRef, synchronizedScroll.translationRef])

  // Обработчик горячих клавиш видит текущее состояние заметок, не переподписываясь на каждый рендер.
  const handleNotesShortcut = useEffectEvent((event: KeyboardEvent) => {
    // В полноэкранном режиме колонки нет, и N её не вернёт; окно — вернёт.
    if (fullscreenLayout && notesPanel.mode === 'docked') return
    event.preventDefault()
    toggleNotes()
  })

  useEffect(() => {
    const handleViewKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing) return
      if (isTextEntry(event.target)) return

      if (event.code === NOTES_SHORTCUT_CODE || NOTES_SHORTCUT_KEYS.has(event.key.toLowerCase())) {
        handleNotesShortcut(event)
        return
      }

      const letterPreset = fullscreenCodeShortcuts[event.code] ??
        fullscreenKeyShortcuts[event.key.toLowerCase()]
      const preset = letterPreset ?? (fullscreenLayout ? fullscreenNumberShortcuts[event.key] : null)
      if (!preset) return
      event.preventDefault()

      // Повторная буква выходит из того же полноэкранного вида; цифры только переключают.
      const isCurrentView = fullscreenLayout !== null && layoutPreset(fullscreenLayout) === preset
      onFullscreenLayoutChange(letterPreset && isCurrentView ? null : LAYOUT_PRESETS[preset])
    }
    window.addEventListener('keydown', handleViewKey)
    return () => window.removeEventListener('keydown', handleViewKey)
  }, [fullscreenLayout, onFullscreenLayoutChange])

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
  const handleDownload = () => {
    setNotice('')
    void translationDownload.download()
  }

  const headerActions = documentMenuActions({
    document,
    t,
    isPinned: isPinned(document.jobId),
    onTogglePin: () => { if (document.jobId) setPinned(document.jobId, !isPinned(document.jobId)) },
    onRate: () => setFeedbackPrompt('manual'),
    reading: readingJobId ? readingToggle(reading, readingJobId) : undefined,
    onRetranslate: () => setDialog('retranslate'),
    onCancelTranslation: () => setDialog('cancel'),
    download: translationDownload.canDownload
      ? { isBusy: translationDownload.isDownloading, onSelect: handleDownload }
      : undefined,
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

  /** Esc в окне заметок возвращает к чтению: фокус в колонку книги, окно остаётся. */
  const handleNotesKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    // Полноэкранный режим слушает Esc на window: из окна он не выходит.
    event.stopPropagation()
    // Esc уже обработан внутри (закрыт редактор без правок) — фокус не трогаем.
    if (event.defaultPrevented) return
    event.preventDefault()
    readingViewport(visibleLayout, synchronizedScroll.originalRef, synchronizedScroll.translationRef)?.focus({ preventScroll: true })
  }
  const collapseNotes = () => {
    pendingNotesFocusRef.current = 'pill'
    notesPanel.collapse()
  }
  const expandNotes = () => {
    pendingNotesFocusRef.current = 'window'
    notesPanel.reveal()
  }
  const closeNotes = () => {
    notesPanel.close()
    setPendingQuote(null)
  }
  const notesFrame: NotesFrame = notesView === 'docked'
    ? { kind: 'docked', side: notesPanel.side, onSwitchSide: notesPanel.switchSide, onUndock: notesPanel.undock, onClose: closeNotes }
    : notesView === 'sheet'
      ? { kind: 'sheet', onClose: closeNotes }
      : { kind: 'floating', handle: notesWindow.handle, onCollapse: collapseNotes, onDock: notesPanel.dock, onClose: closeNotes }
  const isNotesWindow = notesView === 'floating'

  /** «Развернуть панель» — эта колонка на весь экран; повторное нажатие возвращает раскладку. */
  const handlePanelExpandToggle = (pane: ReadingPane) => {
    onFullscreenLayoutChange(isExpandedPane(pane) ? null : LAYOUT_PRESETS[pane])
  }

  function isExpandedPane(pane: ReadingPane) {
    return isImmersiveMode && isSinglePane(visibleLayout) && visibleLayout.primary === pane
  }

  return (
    <div
      ref={shellRef}
      className={`${styles.shell} ${isSinglePane(visibleLayout) ? '' : styles.compareLayout} ${notesPanel.side === 'left' ? styles.notesOnLeft : ''} ${notesPanel.isResizing ? styles.resizing : ''}`}
    >
      <div
        className={`${styles.workspace} ${isImmersiveMode ? styles.immersiveWorkspace : ''}`}
        style={{
          '--chrome-top': `${topChromeHeight}px`,
          '--chrome-bottom': `${bottomChromeHeight}px`,
        } as CSSProperties}
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
                {/* Предупреждение помечено значком, а не только цветом полосы. */}
                {quotaWarning && !visibleNotice ? <GlyphIcon name="warning" /> : null}
                <span className={styles.noticeText}>{visibleNotice || quotaWarning || statusNotice}</span>
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
          className={`${styles.workArea} ${isSinglePane(visibleLayout) ? styles.singlePanel : ''} ${isImmersiveMode ? styles.immersiveWorkArea : ''}`}
        >
          {showsPane(visibleLayout, 'original') ? (
            <OriginalPanel
              view={originalView}
              language={getLanguageLabel(sourceLanguage)}
              languageCode={sourceLanguage}
              page={displayedPage}
              navigationRevision={navigationRevision}
              onVisiblePage={setCurrentPage}
              onRetry={assets.retry}
              onChooseOriginal={(file) => onAttachOriginal(document.id, file)}
              isExpanded={isExpandedPane('original')}
              hideHeader={isImmersiveMode}
              zoom={bookZoom.original}
              onZoomChange={(zoom) => bookZoom.changeZoom('original', zoom)}
              onToggleExpanded={() => handlePanelExpandToggle('original')}
              viewportRef={synchronizedScroll.originalRef}
              onViewportScroll={synchronizedScroll.handleOriginalScroll}
              onViewportRestore={synchronizedScroll.restoreOriginalScroll}
            />
          ) : null}
          {showsPane(visibleLayout, 'translation') ? (
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
              isExpanded={isExpandedPane('translation')}
              hideHeader={isImmersiveMode}
              zoom={bookZoom.translation}
              onZoomChange={(zoom) => bookZoom.changeZoom('translation', zoom)}
              onToggleExpanded={() => handlePanelExpandToggle('translation')}
              viewportRef={synchronizedScroll.translationRef}
              onViewportScroll={synchronizedScroll.handleTranslationScroll}
              onViewportRestore={synchronizedScroll.restoreTranslationScroll}
            />
          ) : null}
          {/* Метки рисуются внутри колонок (портал), здесь только их состояние. */}
          {showsPane(visibleLayout, 'original') ? (
            <QuoteMarkers viewportRef={synchronizedScroll.originalRef} column="SOURCE" quotes={bookQuotes}
              layoutKey={markersLayoutKey} onOpen={openNotesFromMarker} />
          ) : null}
          {showsPane(visibleLayout, 'translation') ? (
            <QuoteMarkers viewportRef={synchronizedScroll.translationRef} column="TRANSLATION" quotes={bookQuotes}
              layoutKey={markersLayoutKey} onOpen={openNotesFromMarker} />
          ) : null}
        </div>

        {!isImmersiveMode ? (
          <div ref={bottomChromeRef} className={styles.bottomChrome}>
            <WorkspaceDock
              document={document}
              sourceLanguage={sourceLanguage}
              targetLanguage={targetLanguage}
              onSourceLanguageChange={handleSourceLanguageChange}
              onTargetLanguageChange={handleTargetLanguageChange}
              onSwapLanguages={handleSwapLanguages}
              tools={tools}
              currentPage={displayedPage}
              pageCount={pageCount}
              onPreviousPage={() => navigatePage(-1)}
              onNextPage={() => navigatePage(1)}
              isTranslating={isTranslating}
              canTranslate={canTranslate}
              onTranslate={() => void handleTranslate()}
              onCancelTranslation={canCancelTranslation(document) ? () => setDialog('cancel') : undefined}
              view={
                <WorkspaceViewBar
                  layout={layoutPreset(layout)}
                  onLayoutChange={(preset) => setLayout(LAYOUT_PRESETS[preset])}
                  source={{ code: shortLanguageCode(sourceLanguage), label: getLanguageLabel(sourceLanguage) }}
                  target={{ code: shortLanguageCode(targetLanguage), label: getLanguageLabel(targetLanguage) }}
                  isScrollSyncEnabled={isScrollSyncEnabled}
                  onToggleScrollSync={handleToggleScrollSync}
                  notes={{ isOpen: isNotesShown, panelId: notesPanelId, onToggle: toggleNotes }}
                  onOpenFullscreen={() => onFullscreenLayoutChange(layout)}
                />
              }
            />
          </div>
        ) : null}

        {dialog === 'retranslate' ? (
          <RetranslateDialog
            document={document}
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
              revealNotes()
            }}
          />
        ) : null}
      </div>
      {isNotesMounted ? (
        // Одна оболочка на все виды: меняются класс, роль и кнопки заголовка, а
        // содержимое внутри не перемонтируется.
        <div
          ref={notesWindowRef}
          id={notesPanelId}
          className={`${styles.notesDock} ${isNotesWindow ? styles.notesWindow : ''}`}
          hidden={!isNotesShown}
          role={isNotesWindow ? 'dialog' : undefined}
          aria-modal={isNotesWindow ? false : undefined}
          aria-label={isNotesWindow ? t('notes.title') : undefined}
          tabIndex={isNotesWindow ? -1 : undefined}
          style={isNotesWindow
            ? (notesWindow.pixel ?? undefined)
            : { '--notes-width': `${notesPanel.width}px` } as CSSProperties}
          onKeyDown={notesView === 'floating' || notesView === 'sheet' ? handleNotesKeyDown : undefined}
        >
          {notesView === 'docked' ? (
            <div
              className={styles.notesResizeHandle}
              role="separator"
              aria-label={t('notes.resize')}
              aria-orientation="vertical"
              aria-valuemin={notesPanel.resizeHandle.minWidth}
              aria-valuemax={notesPanel.resizeHandle.maxWidth}
              aria-valuenow={notesPanel.width}
              aria-valuetext={t('sidebar.pixels', { value: notesPanel.width })}
              tabIndex={0}
              title={t('sidebar.resizeHint')}
              onPointerDown={notesPanel.resizeHandle.onPointerDown}
              onPointerMove={notesPanel.resizeHandle.onPointerMove}
              onPointerUp={notesPanel.resizeHandle.onPointerUp}
              onPointerCancel={notesPanel.resizeHandle.onPointerUp}
              onKeyDown={notesPanel.resizeHandle.onKeyDown}
              onDoubleClick={notesPanel.resizeHandle.onDoubleClick}
            />
          ) : null}
          <Suspense fallback={<p className={styles.notesLoading} role="status">{t('notes.loading')}</p>}>
            <WorkspaceNotesPanel
              document={document}
              frame={notesFrame}
              showGraphTab={NOTES_GRAPH_TAB}
              pendingQuote={pendingQuote}
              request={notesRequest}
              onQuoteFinished={() => { setPendingQuote(null); quoteSelection.clear() }}
              onShowQuote={showQuote}
            />
          </Suspense>
          {/* Угол для мыши; с клавиатуры размер меняют Shift и стрелки на ручке. */}
          {isNotesWindow ? <div className={styles.notesGrip} aria-hidden="true" {...notesWindow.grip} /> : null}
        </div>
      ) : null}
      {notesView === 'collapsed' ? (
        <NotesPill
          ref={notesPillRef}
          className={styles.notesPill}
          // Над кнопками масштаба колонки, которые стоят в том же углу.
          style={{ bottom: `${bottomChromeHeight + NOTES_PILL_OFFSET}px` }}
          count={bookNoteCount || null}
          controlsId={notesPanelId}
          onExpand={expandNotes}
        />
      ) : null}
    </div>
  )
}

// Панель заметок с парсером Markdown нужна, только когда её открыли: грузится отдельно.
const WorkspaceNotesPanel = lazy(() => import('../components/notes/WorkspaceNotesPanel.tsx')
  .then((module) => ({ default: module.WorkspaceNotesPanel })))

/** Колонка, в которую возвращается чтение: в сравнении — оригинал, иначе единственная. */
function readingViewport(layout: WorkspaceLayout, originalRef: RefObject<HTMLElement | null>, translationRef: RefObject<HTMLElement | null>) {
  return isSinglePane(layout) && layout.primary === 'translation' ? translationRef.current : originalRef.current
}

// Кнопки-переключатели: фокус на них после клика не должен глушить горячие клавиши.
const NON_TEXT_INPUTS = new Set(['radio', 'checkbox', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'])

/** Горячие клавиши не перехватывают ввод текста: поля, списки, редактируемые области. */
function isTextEntry(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type)
  return Boolean(target.closest('textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))
}

/** Что стало со страницами отменённого перевода; до ответа сервера — просто «отменён». */
function canceledNoticeKey(quotaRefund: DocumentItem['quotaRefund']): TranslationKey {
  if (quotaRefund === 'REFUNDED') return 'workspace.canceledRefunded'
  if (quotaRefund === 'PENDING') return 'workspace.canceledRefundPending'
  if (quotaRefund === 'NONE') return 'workspace.canceledNoRefund'
  return 'workspace.canceled'
}

export function WorkspacePage() {
  const {
    activeDocument,
    routeDocumentState,
    historyState,
    fullscreenLayout,
    setFullscreenLayout,
    retryHistory,
    startDocumentTranslation,
    attachOriginal,
    resumeTranslationWaiting,
    retranslateDocument,
    deleteDocument,
    cancelTranslation,
    connectWorkspaceNotes,
  } = useOutletContext<AppLayoutContextValue>()
  const { t } = useTranslation()
  // Синхронная прокрутка — настройка пользователя: по умолчанию включена и запоминается.
  const { isScrollSyncEnabled, setScrollSyncEnabled } = usePreferences()

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
      fullscreenLayout={fullscreenLayout}
      isScrollSyncEnabled={isScrollSyncEnabled}
      onFullscreenLayoutChange={setFullscreenLayout}
      onToggleScrollSync={() => setScrollSyncEnabled(!isScrollSyncEnabled)}
      onStartTranslation={startDocumentTranslation}
      onAttachOriginal={attachOriginal}
      onResumeTranslationWaiting={resumeTranslationWaiting}
      onRetranslate={retranslateDocument}
      onDelete={deleteDocument}
      onCancelTranslation={cancelTranslation}
      onConnectNotes={connectWorkspaceNotes}
    />
  )
}
