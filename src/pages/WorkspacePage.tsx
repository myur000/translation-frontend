import { lazy, Suspense, useCallback, useEffect, useEffectEvent, useId, useMemo, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { Link, Navigate, useLocation, useNavigate, useOutletContext } from 'react-router'
import { ApiClientError } from '../api/client.ts'
import type { NoteQuoteResponse } from '../api/contracts/notes.ts'
import type { ShowQuoteResult } from '../components/notes/PanelNoteView.tsx'
import type { NotesPanelRequest } from '../components/notes/WorkspaceNotesPanel.tsx'
import type { MarginDraft } from '../components/notes/MarginNotes.tsx'
import { draftAnchor } from '../notes/marginNotesLayout.ts'
import { NOTE_PARAM, QUOTE_PARAM, SUMMARY_PARAM } from '../notes/noteBooks.ts'
import { bookTitle, coverTone } from '../documents/bookTitle.ts'
import { nextSummaryTitle, textClickTarget } from '../notes/bookSummaries.ts'
import { QuoteMarkers } from '../components/workspace/QuoteMarkers.tsx'
import { GlossaryNotice } from '../components/workspace/GlossaryNotice.tsx'
import { TermComposer } from '../components/workspace/TermComposer.tsx'
import { TermHighlights } from '../components/workspace/TermHighlights.tsx'
import { canBeTerm } from '../glossary/termWords.ts'
import { useGlossaryTerms } from '../glossary/useGlossaryTerms.ts'
import { upsertGlossaryTerm } from '../glossary/glossaryStore.ts'
import { PARAGRAPH_PARAM, TERM_PARAM } from '../glossary/glossaryLinks.ts'
import type { ActiveQuoteSelection } from '../hooks/useQuoteSelection.ts'
import { useBookNotes } from '../notes/useBookQuotes.ts'
import type { BookQuote } from '../notes/bookQuotes.ts'
import { useNotes } from '../notes/useNotes.ts'
import { QuoteChoiceMenu, type QuoteChoice } from '../components/notes/QuoteChoiceMenu.tsx'
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
import { useFlowPages } from '../reading/useFlowPages.ts'
import { useQuoteClicks } from '../hooks/useQuoteClicks.ts'
import { notesPresentation, useNotesPanel } from '../workspace/useNotesPanel.ts'
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
// K (и «л» в русской раскладке) раскрывает и сворачивает конспект книги.
const SUMMARY_SHORTCUT_CODE = 'KeyK'
const SUMMARY_SHORTCUT_KEYS = new Set(['k', 'л'])
// Ширина, с которой рабочая область перестраивается под телефон (см. WorkspacePage.module.css).
const NARROW_SCREEN = '(max-width: 680px)'

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
  // Заметки — колонка справа под шапкой (на телефоне — шторка). Панель монтируется
  // при первом открытии и дальше только прячется: открытая заметка и начатая
  // цитата переживают закрытие, смену вида и полноэкранный режим.
  const notesPanel = useNotesPanel()
  const notesPanelId = useId()
  const isNarrowScreen = useMediaQuery(NARROW_SCREEN)
  const notesView = notesPresentation(notesPanel, { isNarrow: isNarrowScreen })
  const isNotesShown = notesView !== 'hidden'
  const [isNotesMounted, setNotesMounted] = useState(notesPanel.isOpen)
  if (notesPanel.isOpen && !isNotesMounted) setNotesMounted(true)
  // Кнопка в нижней панели и N: один переключатель.
  const toggleNotes = () => (isNotesShown ? notesPanel.close() : notesPanel.reveal())
  const synchronizedScroll = useSynchronizedScroll(
    isScrollSyncEnabled,
    // Колонка заметок сужает книгу: при её появлении и смене ширины закладки чтения пересчитываются.
    `${layoutPreset(visibleLayout)}:${isImmersiveMode}:${notesView === 'column'}:${notesPanel.width}`,
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
    // Без PDF листаем страницы оригинала по прокрутке (useFlowPages ниже).
    if (!pageCount) {
      flowPages.goTo(flowPages.page + direction)
      return
    }
    setCurrentPage(Math.max(1, Math.min(pageCount, displayedPage + direction)))
    setNavigationRevision((value) => value + 1)
  }
  // Цитировать можно только готовый перевод: backend принимает цитаты из документов DONE.
  const canQuote = Boolean(document.jobId) && document.status === 'ready'
  const quoteSelection = useQuoteSelection(synchronizedScroll.originalRef, synchronizedScroll.translationRef, canQuote)
  const [pendingQuote, setPendingQuote] = useState<QuoteSelection | null>(null)
  // Куда отправлено выделение в колонку: в заметку или выпиской в конспект.
  const [pendingQuoteKind, setPendingQuoteKind] = useState<'note' | 'summary'>('note')
  // «В конспект» на полях: закладка раскрывается с формой выписки.
  const [summaryQuote, setSummaryQuote] = useState<{ nonce: number; selection: QuoteSelection } | null>(null)
  // Метки на полях: цитаты этой книги, перечитываются после каждой правки заметок.
  const { revision: notesRevision } = useNotes()
  // Конспект можно начать, пока книга переводится: заметки о книге грузятся у любой отправленной.
  const bookNotes = useBookNotes(document.jobId ?? null, notesRevision)
  const bookQuotes = canQuote ? bookNotes.quotes : NO_BOOK_QUOTES
  // Выписки в конспект — отдельно от цитат заметок: у них своя метка-тетрадь и
  // подчёркивание цветом обложки, а открываются они в закладке конспекта.
  const summaryIds = useMemo(() => new Set(bookNotes.aboutBook.map((note) => note.id)), [bookNotes.aboutBook])
  const noteQuotes = useMemo(() => bookQuotes.filter((quote) => !summaryIds.has(quote.noteId)), [bookQuotes, summaryIds])
  const summaryQuotes = useMemo(() => bookQuotes.filter((quote) => summaryIds.has(quote.noteId)), [bookQuotes, summaryIds])
  const bookTone = coverTone(document.name)
  // Глоссарий пары языков книги: термины подчёркнуты в тексте, новые — из выделения.
  const glossary = useGlossaryTerms(
    document.jobId ? toCatalogLanguageCode(document.sourceLanguage) : null,
    document.jobId ? toCatalogLanguageCode(document.targetLanguage) : null,
  )
  const [termDraft, setTermDraft] = useState<ActiveQuoteSelection | null>(null)
  const [savedTerm, setSavedTerm] = useState<{ term: string; translation: string } | null>(null)
  const [isRetranslateWithGlossary, setRetranslateWithGlossary] = useState(false)
  const [notesRequest, setNotesRequest] = useState<NotesPanelRequest | null>(null)
  const revealNotes = () => notesPanel.reveal()
  const openNotesFromMarker = (noteIds: string[]) => {
    setNotesRequest((current) => ({ nonce: (current?.nonce ?? 0) + 1, noteIds }))
    revealNotes()
  }
  /** Выписка в конспект: на полях — закладка на этом конспекте, иначе он в колонке. */
  const openSummaryNote = (noteId: string) => {
    setNotesRequest((current) => ({ nonce: (current?.nonce ?? 0) + 1, noteIds: [noteId], about: true }))
    revealNotes()
  }
  // Слово есть и в заметке, и в конспекте: меню выбора у слова, а не молчаливая догадка.
  const [quoteChoice, setQuoteChoice] = useState<{ x: number; y: number; choices: QuoteChoice[] } | null>(null)
  // Ссылка постоянная: меню подписывается на клики мимо один раз, а не на каждую перерисовку.
  const closeQuoteChoice = useCallback(() => setQuoteChoice(null), [])
  // Ссылка постоянная: поля зовут её из эффекта, когда закладку с выпиской закрыли.
  const clearQuoteSelection = quoteSelection.clear
  const finishSummaryQuote = useCallback(() => {
    setSummaryQuote(null)
    clearQuoteSelection()
  }, [clearQuoteSelection])
  const openFromText = (noteIds: string[], point: { x: number; y: number }) => {
    const target = textClickTarget(noteIds, summaryIds)
    if (target.kind === 'notes') {
      openNotesFromMarker(target.noteIds)
    } else if (target.kind === 'summary') {
      openSummaryNote(target.noteId)
    } else {
      const titles = new Map(bookQuotes.map((quote) => [quote.noteId, quote.noteTitle]))
      setQuoteChoice({
        ...point,
        choices: [
          ...target.noteIds.map((noteId) => ({ noteId, title: titles.get(noteId) ?? '', kind: 'note' as const })),
          ...target.summaryIds.map((noteId) => ({ noteId, title: titles.get(noteId) ?? '', kind: 'summary' as const })),
        ],
      })
    }
  }
  const markersLayoutKey = `${layoutPreset(visibleLayout)}:${isImmersiveMode}`
  // Одна колонка книги и готовый перевод — заметки на полях, напротив абзацев.
  // В сравнении на полях места нет, а у неготового перевода нет цитат: тогда колонка.
  const isMarginAvailable = canQuote && !isNarrowScreen && isSinglePane(visibleLayout)
  const isMarginMode = notesPanel.isOpen && isMarginAvailable
  const isNotesColumn = notesView === 'column' && !isMarginMode
  const marginViewportRef = visibleLayout.primary === 'translation' ? synchronizedScroll.translationRef : synchronizedScroll.originalRef
  const [marginDraft, setMarginDraft] = useState<MarginDraft | null>(null)
  const nextNonce = (current: { nonce: number } | null) => (current?.nonce ?? 0) + 1
  /** «Новая заметка» из меню «+»: черновик на полях или в колонке. */
  // Клик по подсвеченной цитате в тексте — как по метке: открыть её заметку. Курсор над
  // цитатой выделяет её карточку на полях.
  const [textHoverNoteIds, setTextHoverNoteIds] = useState<string[]>([])
  useQuoteClicks({
    viewportRef: synchronizedScroll.originalRef, column: 'SOURCE', quotes: bookQuotes, layoutKey: markersLayoutKey,
    onOpen: openFromText, onHover: setTextHoverNoteIds,
  })
  useQuoteClicks({
    viewportRef: synchronizedScroll.translationRef, column: 'TRANSLATION', quotes: bookQuotes, layoutKey: markersLayoutKey,
    onOpen: openFromText, onHover: setTextHoverNoteIds,
  })
  /**
   * Конспект книги — заметка о ней целиком (T-67); их может быть несколько. На полях
   * он в закладке вверху: `open` раскрывает текущий (или форму, если конспектов нет),
   * `new` — форму нового, `toggle` — то же, что `open`, но раскрытую закладку сворачивает.
   * Без полей (сравнение, узкий экран) конспекты открываются в колонке заметок.
   */
  const openSummary = (action: 'open' | 'new' | 'toggle' = 'open') => {
    const jobId = document.jobId
    if (!jobId) return
    const about = bookNotes.aboutBook
    if (isMarginAvailable) {
      setNotesRequest((current) => ({
        nonce: nextNonce(current), noteIds: [], about: true,
        aboutAction: action === 'open' ? undefined : action,
      }))
    } else if (about.length && action !== 'new') {
      setNotesRequest((current) => ({ nonce: nextNonce(current), noteIds: about.map((note) => note.id), about: true }))
    } else {
      const title = nextSummaryTitle({
        first: (book) => t('notes.summaryTitle', { book }),
        numbered: (book, number) => t('notes.summaryTitleNumbered', { book, number }),
      }, bookTitle(document.name), about)
      setNotesRequest((current) => ({ nonce: nextNonce(current), noteIds: [], summary: { jobId, title } }))
    }
    revealNotes()
  }
  const startNewNote = () => {
    const viewport = marginViewportRef.current
    if (isMarginAvailable && viewport) setMarginDraft((current) => ({ nonce: nextNonce(current), kind: 'new', anchor: draftAnchor(viewport) }))
    else setNotesRequest((current) => ({ nonce: nextNonce(current), noteIds: [], create: true }))
    revealNotes()
  }
  const reading = useReadingProgress()
  const readingJobId = document.status === 'ready' ? document.jobId ?? null : null
  // Прогресс считается по переводу, когда он на экране, иначе — по оригиналу.
  useReadingTracker(
    reading.email,
    readingJobId,
    showsPane(visibleLayout, 'translation') ? synchronizedScroll.translationRef : synchronizedScroll.originalRef,
    markersLayoutKey,
  )
  // У DOCX и текста разметки страниц нет: счётчик в нижней панели ведёт по учётным
  // страницам книги (их же списывает сервер, ≈1800 знаков; `pages` у задач с сервера
  // всегда 0) по доле прокрутки той же колонки чтения.
  const isTranslationRead = showsPane(visibleLayout, 'translation')
  const readingView = isTranslationRead ? translationView : originalView
  const bookPages = document.billedUnits || document.pages
  const flowTotal = pageCount === null && readingView.status === 'ready' && bookPages > 0 ? bookPages : null
  const flowPages = useFlowPages(
    isTranslationRead ? synchronizedScroll.translationRef : synchronizedScroll.originalRef,
    flowTotal,
    markersLayoutKey,
  )
  /**
   * Прокрутить книгу к цитате из заметки. Если её колонка скрыта раскладкой (цитата
   * из оригинала, а на экране только перевод), ищется парный абзац в видимой колонке.
   */
  const revealBookQuote = (quote: BookQuote) => {
    const own = quote.side === 'SOURCE' ? synchronizedScroll.originalRef.current : synchronizedScroll.translationRef.current
    const other = quote.side === 'SOURCE' ? synchronizedScroll.translationRef.current : synchronizedScroll.originalRef.current
    const element = own
      ? findQuoteElement(own, quote.paragraphIndex, quote.quote, quote.paragraphText)
      : other && quote.pairedText ? findQuoteElement(other, quote.paragraphIndex, quote.pairedText, quote.pairedText) : null
    if (element) revealQuoteElement(element)
  }

  // Переход «Открыть в книге» со страницы заметки: `?note=` (и `&quote=`). Когда заметки
  // книги загружены — открыть заметку и прокрутить к цитате; параметры убираются из
  // адреса, чтобы обновление страницы или «Назад» не повторяли переход.
  const linkParams = new URLSearchParams(location.search)
  const linkedNoteId = linkParams.get(NOTE_PARAM)
  const linkedQuoteId = linkParams.get(QUOTE_PARAM)
  useEffect(() => {
    if (!linkedNoteId || !bookNotes.isLoaded) return
    const isAbout = bookNotes.aboutBook.some((note) => note.id === linkedNoteId)
    const quote = bookNotes.quotes.find((item) => item.id === linkedQuoteId)
      ?? bookNotes.quotes.find((item) => item.noteId === linkedNoteId)
    setNotesRequest((current) => ({ nonce: (current?.nonce ?? 0) + 1, noteIds: [linkedNoteId], about: isAbout && !quote }))
    notesPanel.reveal()
    void navigate({ pathname: location.pathname, search: '' }, { replace: true })
    // Книга ещё раскладывается после открытия заметок: прокрутка — в следующем кадре.
    if (quote) window.requestAnimationFrame(() => revealBookQuote(quote))
    // Срабатывает один раз на переход: параметры сразу убираются из адреса.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedNoteId, linkedQuoteId, bookNotes.isLoaded])

  // «Открыть в книге» из глоссария: `?term=&paragraph=`. Текст книги появляется не сразу,
  // поэтому абзац ищем несколько раз; параметры убираются, когда нашли или сдались.
  const linkedTermId = linkParams.get(TERM_PARAM)
  const linkedParagraph = linkParams.get(PARAGRAPH_PARAM)
  useEffect(() => {
    if (!linkedTermId || linkedParagraph === null || !glossary.isLoaded) return
    const term = glossary.terms.find((item) => item.id === linkedTermId)
    const index = Number(linkedParagraph)
    let attempts = 0
    let timer = 0
    const finish = () => void navigate({ pathname: location.pathname, search: '' }, { replace: true })
    const reveal = () => {
      const original = synchronizedScroll.originalRef.current
      const translation = synchronizedScroll.translationRef.current
      const element = !term || !Number.isInteger(index) ? null
        : original ? findQuoteElement(original, index, term.term)
          : translation ? findQuoteElement(translation, index, term.translation) : null
      if (element) revealQuoteElement(element)
      if (element || !term || attempts >= 20) {
        finish()
        return
      }
      attempts += 1
      timer = window.setTimeout(reveal, 250)
    }
    reveal()
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedTermId, linkedParagraph, glossary.isLoaded])

  // «Конспект книги» из меню книги на полке: `?summary=open` — книга открывается сразу с
  // раскрытым конспектом (на полях — закладка, иначе — колонка). Тоже один раз на переход.
  const isSummaryLink = linkParams.has(SUMMARY_PARAM)
  useEffect(() => {
    if (!isSummaryLink || !bookNotes.isLoaded) return
    openSummary('open')
    void navigate({ pathname: location.pathname, search: '' }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSummaryLink, bookNotes.isLoaded])

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
    event.preventDefault()
    toggleNotes()
  })
  const handleSummaryShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!document.jobId) return
    event.preventDefault()
    openSummary('toggle')
  })

  useEffect(() => {
    const handleViewKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing) return
      if (isTextEntry(event.target)) return

      if (event.code === NOTES_SHORTCUT_CODE || NOTES_SHORTCUT_KEYS.has(event.key.toLowerCase())) {
        handleNotesShortcut(event)
        return
      }
      if (event.code === SUMMARY_SHORTCUT_CODE || SUMMARY_SHORTCUT_KEYS.has(event.key.toLowerCase())) {
        handleSummaryShortcut(event)
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
  // Меню «+» нижней панели: новая заметка и всё, что меняет сам перевод.
  // У черновика заметкам не к чему относиться: пункт появляется у отправленной книги.
  const tools: DocumentAction[] = document.jobId
    ? [
        { id: 'new-note', label: t('notesPanel.newNote'), icon: 'note', onSelect: startNewNote },
        { id: 'summary', label: t(bookNotes.aboutBook.length ? 'notesPanel.summary' : 'notesPanel.newSummary'), icon: 'summary', onSelect: () => openSummary() },
        // Конспектов может быть несколько: новый можно начать, даже когда один уже есть.
        ...(bookNotes.aboutBook.length
          ? [{ id: 'summary-new', label: t('summaries.newMenu'), icon: 'summary' as const, onSelect: () => openSummary('new') }]
          : []),
      ]
    : []
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

  /** Esc в заметках возвращает к чтению: фокус в колонку книги, заметки остаются. */
  const handleNotesKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    // Полноэкранный режим слушает Esc на window: из заметок он не выходит.
    event.stopPropagation()
    // Esc уже обработан внутри (закрыт редактор без правок) — фокус не трогаем.
    if (event.defaultPrevented) return
    event.preventDefault()
    readingViewport(visibleLayout, synchronizedScroll.originalRef, synchronizedScroll.translationRef)?.focus({ preventScroll: true })
  }
  const closeNotes = () => {
    notesPanel.close()
    setPendingQuote(null)
  }

  /** «Развернуть панель» — эта колонка на весь экран; повторное нажатие возвращает раскладку. */
  const handlePanelExpandToggle = (pane: ReadingPane) => {
    onFullscreenLayoutChange(isExpandedPane(pane) ? null : LAYOUT_PRESETS[pane])
  }

  function isExpandedPane(pane: ReadingPane) {
    return isImmersiveMode && isSinglePane(visibleLayout) && visibleLayout.primary === pane
  }

  return (
    <div
      className={`${styles.shell} ${isSinglePane(visibleLayout) ? '' : styles.compareLayout} ${notesPanel.isResizing ? styles.resizing : ''}`}
    >
      <div
        className={`${styles.workspace} ${isImmersiveMode ? styles.immersiveWorkspace : ''} ${isNotesColumn ? styles.withNotes : ''}`}
        style={{
          '--chrome-top': `${isImmersiveMode ? 0 : topChromeHeight}px`,
          '--chrome-bottom': `${bottomChromeHeight}px`,
          '--notes-width': `${notesPanel.width}px`,
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
            <QuoteMarkers viewportRef={synchronizedScroll.originalRef} column="SOURCE" quotes={noteQuotes}
              summaryQuotes={summaryQuotes} summaryTone={bookTone}
              layoutKey={markersLayoutKey} onOpen={openNotesFromMarker} onOpenSummary={openSummaryNote} />
          ) : null}
          {showsPane(visibleLayout, 'translation') ? (
            <QuoteMarkers viewportRef={synchronizedScroll.translationRef} column="TRANSLATION" quotes={noteQuotes}
              summaryQuotes={summaryQuotes} summaryTone={bookTone}
              layoutKey={markersLayoutKey} onOpen={openNotesFromMarker} onOpenSummary={openSummaryNote} />
          ) : null}
          {canQuote && showsPane(visibleLayout, 'original') ? (
            <TermHighlights viewportRef={synchronizedScroll.originalRef} column="SOURCE" terms={glossary.terms} layoutKey={markersLayoutKey} />
          ) : null}
          {canQuote && showsPane(visibleLayout, 'translation') ? (
            <TermHighlights viewportRef={synchronizedScroll.translationRef} column="TRANSLATION" terms={glossary.terms} layoutKey={markersLayoutKey} />
          ) : null}
          {isMarginMode && document.jobId ? (
            <Suspense fallback={null}>
              <MarginNotes
                viewportRef={marginViewportRef}
                column={visibleLayout.primary === 'translation' ? 'TRANSLATION' : 'SOURCE'}
                jobId={document.jobId}
                bookName={document.name}
                quotes={noteQuotes}
                aboutBook={bookNotes.aboutBook}
                layoutKey={markersLayoutKey}
                request={notesRequest}
                linkedNoteIds={textHoverNoteIds}
                draft={marginDraft}
                onDraftDone={() => { setMarginDraft(null); quoteSelection.clear() }}
                summaryQuotes={summaryQuotes}
                summaryQuote={summaryQuote}
                onSummaryQuoteDone={finishSummaryQuote}
                onNoteSaved={bookNotes.upsertNote}
              />
            </Suspense>
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
              currentPage={pageCount !== null ? displayedPage : flowPages.page}
              pageCount={pageCount ?? flowTotal}
              isPageApproximate={pageCount === null && flowTotal !== null}
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
                  summary={document.jobId ? { onToggle: () => openSummary('toggle') } : undefined}
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
            onClose={() => {
              setDialog(null)
              setRetranslateWithGlossary(false)
            }}
            withGlossary={isRetranslateWithGlossary}
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
        {quoteChoice ? (
          <QuoteChoiceMenu
            x={quoteChoice.x}
            y={quoteChoice.y}
            choices={quoteChoice.choices}
            summaryTone={bookTone}
            onPick={(choice) => {
              setQuoteChoice(null)
              if (choice.kind === 'summary') openSummaryNote(choice.noteId)
              else openNotesFromMarker([choice.noteId])
            }}
            onClose={closeQuoteChoice}
          />
        ) : null}
        {/* Пока цитата оформляется в панели, кнопка над старым выделением только мешает. */}
        {quoteSelection.selection && !pendingQuote && !marginDraft && !summaryQuote && !termDraft ? (
          <QuoteSelectionButton
            selection={quoteSelection.selection}
            onQuote={() => {
              const { rect, ...selection } = quoteSelection.selection!
              // На полях черновик встаёт у выделения, в колонке — открывается в ней.
              const viewport = marginViewportRef.current
              if (isMarginAvailable && viewport) {
                setMarginDraft((current) => ({ nonce: nextNonce(current), kind: 'quote', selection, anchor: draftAnchor(viewport, rect.top) }))
              } else {
                setPendingQuoteKind('note')
                setPendingQuote(selection)
              }
              revealNotes()
            }}
            onSummary={document.jobId ? () => {
              const { rect: _rect, ...selection } = quoteSelection.selection!
              // На полях выписка пишется в закладке конспекта, в колонке — в ней.
              if (isMarginAvailable) {
                setSummaryQuote((current) => ({ nonce: nextNonce(current), selection }))
              } else {
                setPendingQuoteKind('summary')
                setPendingQuote(selection)
              }
              revealNotes()
            } : undefined}
            // Предложение или абзац — уже не термин: круга глоссария над ним нет.
            onGlossary={document.jobId && canBeTerm(quoteSelection.selection.text) ? () => setTermDraft(quoteSelection.selection) : undefined}
          />
        ) : null}
        {termDraft && document.jobId ? (
          <TermComposer
            jobId={document.jobId}
            selection={termDraft}
            liveSelection={quoteSelection.selection}
            canPickPaired={showsPane(visibleLayout, 'original') && showsPane(visibleLayout, 'translation')}
            languages={{ source: toCatalogLanguageCode(document.sourceLanguage), target: toCatalogLanguageCode(document.targetLanguage) }}
            terms={glossary.terms}
            pair={`${shortLanguageCode(toCatalogLanguageCode(document.sourceLanguage))} → ${shortLanguageCode(toCatalogLanguageCode(document.targetLanguage))}`}
            onSaved={(term) => {
              glossary.upsert(term)
              upsertGlossaryTerm(term)
              setTermDraft(null)
              quoteSelection.clear()
              setSavedTerm({ term: term.term, translation: term.translation })
            }}
            onClose={() => setTermDraft(null)}
          />
        ) : null}
        {savedTerm && !feedbackPrompt && !isImmersiveMode ? (
          <GlossaryNotice
            term={savedTerm.term}
            translation={savedTerm.translation}
            onRetranslate={() => {
              setSavedTerm(null)
              setRetranslateWithGlossary(true)
              setDialog('retranslate')
            }}
            onClose={() => setSavedTerm(null)}
          />
        ) : null}
        {isNotesMounted ? (
          // Колонка лежит в рабочей области под шапкой: шапка остаётся на всю ширину,
          // а книга и нижняя панель сужаются на ширину колонки.
          <div
            id={notesPanelId}
            className={styles.notesDock}
            hidden={!isNotesShown || isMarginMode}
            onKeyDown={handleNotesKeyDown}
          >
            {notesView === 'column' ? (
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
                bookQuotes={bookQuotes}
                pendingQuote={pendingQuote}
                pendingQuoteKind={pendingQuoteKind}
                summaries={bookNotes.aboutBook}
                request={notesRequest}
                onQuoteFinished={() => { setPendingQuote(null); quoteSelection.clear() }}
                onShowQuote={showQuote}
                onClose={closeNotes}
              />
            </Suspense>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Цитаты есть только у готового перевода; один и тот же пустой список не сбрасывает мемоизацию. */
const NO_BOOK_QUOTES: BookQuote[] = []

// Заметки на полях с тем же парсером Markdown — тоже отдельно.
const MarginNotes = lazy(() => import('../components/notes/MarginNotes.tsx')
  .then((module) => ({ default: module.MarginNotes })))

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
    />
  )
}
