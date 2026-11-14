import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { AccountProvider } from '../account/AccountProvider.tsx'
import { useAccount } from '../account/useAccount.ts'
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router'
import {
  cancelDocumentTranslation,
  deleteDocument as deleteDocumentRequest,
  estimateDocument,
  getDocumentHistory,
  retranslateDocument as retranslateDocumentRequest,
  uploadDocument as uploadDocumentRequest,
} from '../api/documents.ts'
import type {
  DocumentJobEvent,
  DocumentStatusResponse,
  DocumentUploadResponse,
} from '../api/contracts/documents.ts'
import { getTranslationStatus } from '../api/translations.ts'
import { ApiClientError, hasApiErrorCode } from '../api/client.ts'
import { useAuth } from '../auth/useAuth.ts'
import { EmailVerificationBanner } from '../components/auth/EmailVerificationBanner.tsx'
import { Sidebar, type WorkspaceNotesControl } from '../components/sidebar/Sidebar.tsx'
import { NotesProvider } from '../notes/NotesProvider.tsx'
import { historyItemsToDocuments } from '../documents/documentHistory.ts'
import { isFinalTranslationStatus, toDocumentStatus } from '../documents/translationStatus.ts'
import {
  readDocumentMetadata,
  rememberDocumentMetadata,
} from '../documents/documentMetadataStorage.ts'
import {
  createLocalDocumentId,
  documentPath,
  draftPath,
  FEEDBACK_PROMPT_STATE,
  pathForDocument,
} from '../documents/documentRoutes.ts'
import {
  useRouteDocument,
  type RouteDocumentState,
} from '../documents/useRouteDocument.ts'
import { useDocumentEvents } from '../hooks/useDocumentEvents.ts'
import { useResizableSidebar } from '../hooks/useResizableSidebar.ts'
import {
  useTranslationStatusPolling,
  type TranslationStatusUpdate,
  type TranslationWaitingTimeout,
} from '../hooks/useTranslationStatusPolling.ts'
import { DocumentUploadPreparationError } from '../errors/DocumentUploadPreparationError.ts'
import { useTranslation } from '../i18n/useTranslation.ts'
import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
} from '../languages/languageCatalog.ts'
import { ProfileProvider } from '../profile/ProfileProvider.tsx'
import type { DocumentItem, LanguageCode } from '../types/document.ts'
import type { WorkspaceLayout } from '../workspace/workspaceLayout.ts'
import styles from './AppLayout.module.css'

export type HistoryLoadState = 'loading' | 'ready' | 'error'

export interface AppLayoutContextValue {
  /**
   * Рабочая область сообщает, открыто ли окно заметок, и даёт его переключатель:
   * иконка «Заметки» в рельсе боковой панели в книге управляет им. `null` — книги на экране нет.
   */
  connectWorkspaceNotes: (control: WorkspaceNotesControl | null) => void
  activeDocument: DocumentItem | null
  /** Результат разрешения `/documents/:jobId`; `none` на обычном маршруте рабочей области. */
  routeDocumentState: RouteDocumentState
  documents: DocumentItem[]
  historyState: HistoryLoadState
  /**
   * Полноэкранный режим: временная раскладка поверх сохранённой. Боковая панель
   * и плавающие панели скрыты; Esc и переход на другую страницу его закрывают,
   * и документ возвращается к своей раскладке.
   */
  fullscreenLayout: WorkspaceLayout | null
  setFullscreenLayout: (layout: WorkspaceLayout | null) => void
  selectDocument: (documentId: string) => void
  retryHistory: () => void
  attachOriginal: (documentId: string, file: File) => string | null
  resumeTranslationWaiting: (documentId: string) => void
  startDocumentTranslation: (
    documentId: string,
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode,
    options?: { useGlossary?: boolean },
  ) => Promise<DocumentUploadResponse>
  /**
   * Переводит загруженный документ на другой язык по исходному файлу на бэкенде;
   * возвращает новую задачу, которая становится активной.
   */
  retranslateDocument: (
    documentId: string,
    request: { targetLanguage: LanguageCode; useGlossary: boolean; idempotencyKey: string },
  ) => Promise<DocumentUploadResponse>
  /** Удаляет задачу на бэкенде (черновики — только локально) и убирает её из списка. */
  deleteDocument: (documentId: string) => Promise<void>
  /**
   * Отменяет перевод, который ещё идёт, и сразу применяет ответ (`CANCELED`, `quota_refund`).
   * Ошибку пробрасывает вызывающему: текст выбирает диалог подтверждения.
   */
  cancelTranslation: (documentId: string) => Promise<void>
  /**
   * Добавляет локальный черновик из выбранного файла и открывает его. Возвращает текст
   * ошибки для неподдерживаемого или слишком большого файла, иначе `null`.
   */
  prepareDocument: (file: File, languages?: { source: LanguageCode; target: LanguageCode }) => string | null
}

const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024
/** При живом потоке событий опрос — лишь страховка на случай пропущенных событий. */
const POLLING_WITH_EVENTS_MS = 30_000
const POLLING_WITHOUT_EVENTS_MS = 2_500
const SUPPORTED_EXTENSIONS = new Set(['pdf', 'doc', 'docx'])

export function AppLayout() {
  return <AccountProvider><AppLayoutContent /></AccountProvider>
}

function AppLayoutContent() {
  const { t } = useTranslation()
  const { reload: reloadAccount } = useAccount()
  const observedTerminalJobs = useRef(new Set<string>())
  const { session } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [historyState, setHistoryState] = useState<HistoryLoadState>('loading')
  const [historyRevision, setHistoryRevision] = useState(0)
  const [fullscreenLayout, setFullscreenLayout] = useState<WorkspaceLayout | null>(null)
  const [fullscreenLocationKey, setFullscreenLocationKey] = useState(location.key)
  const sidebar = useResizableSidebar()
  const [workspaceNotes, setWorkspaceNotes] = useState<WorkspaceNotesControl | null>(null)
  // Адрес — единственный источник открытого документа: `/` — главный экран,
  // у загруженных задач и локальных черновиков свои пути.
  const routeJobId = useMatch('/documents/:jobId')?.params.jobId ?? null
  const routeDraftId = useMatch('/drafts/:draftId')?.params.draftId ?? null
  const isWorkspaceRoute = routeJobId !== null || routeDraftId !== null

  // AppLayout переживает навигацию. React повторяет этот рендер до фиксации
  // дочерних элементов, поэтому устаревший полноэкранный режим не попадает на новую страницу.
  if (fullscreenLocationKey !== location.key) {
    setFullscreenLocationKey(location.key)
    setFullscreenLayout(null)
  }

  const addFoundDocument = useCallback((document: DocumentItem) => {
    setDocuments((current) =>
      current.some((item) => item.jobId === document.jobId) ? current : [...current, document])
  }, [])
  const jobRouteState = useRouteDocument({
    jobId: routeJobId,
    documents,
    historyState,
    session,
    onFound: addFoundDocument,
  })
  const activeDocument = routeJobId !== null
    ? documents.find((item) => item.jobId === routeJobId) ?? null
    : routeDraftId !== null
      ? documents.find((item) => item.id === routeDraftId) ?? null
      : null
  const routeDocumentState: RouteDocumentState = routeDraftId !== null
    ? activeDocument ? 'found' : 'draft-missing'
    : jobRouteState
  // Кроме идущих переводов досматриваем отменённые, у которых возврат страниц ещё уточняется:
  // сервис перевода отвечает за секунды, и итог (`REFUNDED` или `NONE`) стоит показать сразу.
  const pollingJobs = documents.flatMap((document) =>
    document.jobId && !document.waitingIssue &&
    (document.status === 'processing' || (document.status === 'canceled' && document.quotaRefund === 'PENDING'))
      ? [{ documentId: document.id, jobId: document.jobId,
          status: document.serverStatus ?? 'PENDING', progress: document.progress ?? 0,
          quotaRefund: document.quotaRefund }]
      : [],
  )

  useEffect(() => {
    if (!session) return

    const controller = new AbortController()
    const metadata = readDocumentMetadata(session.email)

    getDocumentHistory(
      { accessToken: session.accessToken, signal: controller.signal },
      { page: 0, size: 100 },
    ).then(
      (response) => {
        if (controller.signal.aborted) return
        if (!response || !Array.isArray(response.items)) {
          setHistoryState('error')
          return
        }
        const historyDocuments = historyItemsToDocuments(response.items, metadata)

        setDocuments((current) => {
          const localDrafts = current.filter((document) => !document.jobId)
          const currentByJobId = new Map(
            current.flatMap((document) =>
              document.jobId ? [[document.jobId, document] as const] : [],
            ),
          )
          const restoredHistory = historyDocuments.map((document) => {
            const currentDocument = currentByJobId.get(document.jobId ?? '')
            const unchanged = document.status === 'processing' &&
              currentDocument?.serverStatus === document.serverStatus &&
              currentDocument?.progress === document.progress
            return { ...document, sourceFile: currentDocument?.sourceFile,
              waitingIssue: unchanged ? currentDocument?.waitingIssue : undefined }
          })
          return [...localDrafts, ...restoredHistory]
        })
        setHistoryState('ready')
      },
      () => {
        if (controller.signal.aborted) return
        setHistoryState('error')
      },
    )

    return () => controller.abort()
  }, [historyRevision, session])

  const handleStatusUpdates = useCallback(
    (updates: TranslationStatusUpdate[]) => {
      // Расход перечитываем один раз на каждое финальное состояние, а не на каждый шаг прогресса.
      // У отменённой задачи финальных состояний два: `PENDING` и затем итог возврата страниц.
      const terminalKey = (response: DocumentStatusResponse) =>
        `${response.job_id}:${response.status}:${response.quota_refund ?? ''}`
      const completed = updates.filter(({ response }) =>
        isFinalTranslationStatus(response.status) &&
        !observedTerminalJobs.current.has(terminalKey(response)))
      if (completed.length) {
        completed.forEach(({ response }) => observedTerminalJobs.current.add(terminalKey(response)))
        reloadAccount()
      }
      const updatesByDocument = new Map(
        updates.map((update) => [update.documentId, update.response]),
      )

      setDocuments((current) =>
        current.map((document) => {
          const response = updatesByDocument.get(document.id)
          if (!response) return document

          const status = toDocumentStatus(response.status)
          const progress = Math.min(100, Math.max(0, response.progress))
          const errorMessage =
            response.status === 'FAILED'
              ? response.error_message ?? undefined
              : undefined
          const quotaRefund = response.quota_refund ?? undefined

          if (
            document.status === status &&
            document.serverStatus === response.status &&
            !document.waitingIssue &&
            document.progress === progress &&
            document.errorMessage === errorMessage &&
            document.quotaRefund === quotaRefund
          ) {
            return document
          }

          return {
            ...document,
            status,
            serverStatus: response.status,
            waitingIssue: undefined,
            progress,
            errorMessage,
            quotaRefund,
          }
        }),
      )
    },
    [reloadAccount],
  )

  const handleWaitingTimeout = useCallback((timeouts: TranslationWaitingTimeout[]) => {
    const byDocument = new Map(timeouts.map((item) => [item.documentId, item]))
    setDocuments((current) => current.map((document) => {
      const timeout = byDocument.get(document.id)
      return timeout && timeout.jobId === document.jobId && document.status === 'processing'
        ? { ...document, waitingIssue: timeout.issue } : document
    }))
  }, [])

  const resumeTranslationWaiting = useCallback((documentId: string) => {
    setDocuments((current) => current.map((document) =>
      document.id === documentId && document.waitingIssue
        ? { ...document, waitingIssue: undefined } : document))
  }, [])

  const documentsRef = useRef(documents)
  useEffect(() => {
    documentsRef.current = documents
  })
  const [statusRefreshKey, setStatusRefreshKey] = useState(0)
  const accessToken = session?.accessToken ?? null

  const handleJobEvent = useCallback((event: DocumentJobEvent) => {
    const document = documentsRef.current.find((item) => item.jobId === event.job_id)
    if (!document) return
    const apply = (response: DocumentStatusResponse) =>
      handleStatusUpdates([{ documentId: document.id, response }])
    const partial: DocumentStatusResponse = {
      ...event, error_code: null, error_message: null, file_name: null, glossary_term_count: null,
      quota_refund: null,
    }
    // В событии нет текста ошибки и итога возврата страниц; полный статус читаем,
    // когда задача закончилась (в том числе когда уточнился возврат у отменённой).
    if (isFinalTranslationStatus(event.status) && accessToken) {
      getTranslationStatus(event.job_id, { accessToken }).then(apply, () => apply(partial))
    } else {
      apply(partial)
    }
  }, [accessToken, handleStatusUpdates])

  const handleEventsResync = useCallback(() => setStatusRefreshKey((key) => key + 1), [])

  const documentEvents = useDocumentEvents({
    accessToken,
    enabled: pollingJobs.length > 0,
    onJob: handleJobEvent,
    onResync: handleEventsResync,
  })

  useTranslationStatusPolling({
    accessToken,
    jobs: pollingJobs,
    onUpdate: handleStatusUpdates,
    onTimeout: handleWaitingTimeout,
    intervalMs: documentEvents === 'live' ? POLLING_WITH_EVENTS_MS : POLLING_WITHOUT_EVENTS_MS,
    refreshKey: statusRefreshKey,
  })

  useEffect(() => {
    if (fullscreenLayout === null) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreenLayout(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fullscreenLayout])

  const isFullscreenMode = isWorkspaceRoute && fullscreenLayout !== null

  const handleSelectDocument = (documentId: string) => {
    const document = documents.find((item) => item.id === documentId)
    void navigate(document ? pathForDocument(document) : '/')
  }

  const handleRateDocument = (documentId: string) => {
    const document = documents.find((item) => item.id === documentId)
    if (document) void navigate(pathForDocument(document), { state: FEEDBACK_PROMPT_STATE })
  }

  const handleRetryHistory = () => {
    setHistoryState('loading')
    setHistoryRevision((revision) => revision + 1)
  }

  const prepareDocument: AppLayoutContextValue['prepareDocument'] = (file, languages) => {
    const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
    if (!SUPPORTED_EXTENSIONS.has(extension)) return t('workspace.unsupportedFile')
    if (file.size > MAX_DOCUMENT_SIZE) return t('workspace.fileTooLarge')

    const document: DocumentItem = {
      id: createLocalDocumentId(),
      name: file.name,
      sourceLanguage: languages?.source ?? DEFAULT_SOURCE_LANGUAGE,
      targetLanguage: languages?.target ?? DEFAULT_TARGET_LANGUAGE,
      pages: 0,
      status: 'draft',
      sourceFile: file,
    }
    setDocuments((current) => [document, ...current])
    void navigate(draftPath(document.id))
    if (session) void loadEstimate(document.id, file, session.accessToken)
    return null
  }

  const handleSidebarUpload = (file: File) =>
    prepareDocument(file) ?? t('workspace.fileReady', { name: file.name })

  /** Необязательная подсказка: неподтверждённые аккаунты (403) и сбои просто остаются без оценки. */
  const loadEstimate = async (documentId: string, file: File, accessToken: string) => {
    try {
      const response = await estimateDocument(file, { accessToken })
      const estimate = {
        billedUnits: response.billed_units,
        enoughQuota: response.enough_quota,
        unlimited: response.unlimited,
        remainingUnits: response.remaining_units,
      }
      setDocuments((current) => current.map((item) =>
        item.id === documentId && !item.jobId ? { ...item, estimate } : item))
    } catch {
      // Загрузка проверит файл ещё раз и сообщит о настоящих ошибках.
    }
  }

  const attachOriginal = (documentId: string, file: File) => {
    const document = documents.find((item) => item.id === documentId)
    if (!document) return t('workspace.uploadUnavailable')
    const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
    if (!SUPPORTED_EXTENSIONS.has(extension)) return t('workspace.unsupportedFile')
    if (file.size > MAX_DOCUMENT_SIZE) return t('workspace.fileTooLarge')
    const expected = document.format ?? document.name.split('.').at(-1)?.toLowerCase()
    if (expected !== extension) return t('viewer.originalFormatMismatch')
    setDocuments((current) => current.map((item) => item.id === documentId ? { ...item, sourceFile: file } : item))
    return null
  }

  const startDocumentTranslation = async (
    documentId: string,
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode,
    options: { useGlossary?: boolean } = {},
  ) => {
    const document = documents.find((item) => item.id === documentId)
    if (!document?.sourceFile) {
      throw new DocumentUploadPreparationError(t('workspace.uploadUnavailable'))
    }
    if (!session) {
      throw new DocumentUploadPreparationError(t('workspace.uploadUnavailable'))
    }

    try {
      const response = await uploadDocumentRequest(
        {
          file: document.sourceFile,
          source_lang: sourceLanguage,
          target_lang: targetLanguage,
          use_glossary: options.useGlossary,
        },
        { accessToken: session.accessToken },
      )

      rememberDocumentMetadata(session.email, response.job_id, {
        name: document.name,
        documentId: document.id,
      })
      setDocuments((current) =>
        current.map((item) =>
          item.id === documentId
            ? {
                ...item,
                sourceLanguage,
                targetLanguage,
                status: 'processing',
                serverStatus: 'PENDING',
                waitingIssue: undefined,
                progress: 0,
                jobId: response.job_id,
                errorMessage: undefined,
                billedUnits: response.billed_units,
                glossaryTermCount: response.glossary_term_count,
              }
            : item,
        ),
      )

      reloadAccount()
      // У задачи свой адрес: перезагрузка или отправленная ссылка снова её откроют.
      if (activeDocument?.id === documentId) {
        void navigate(documentPath(response.job_id), { replace: true })
      }
      return response
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 429) reloadAccount()
      if (error instanceof ApiClientError) throw error
      throw new DocumentUploadPreparationError(t('workspace.uploadFailed'))
    }
  }

  const retranslateDocument: AppLayoutContextValue['retranslateDocument'] = async (
    documentId,
    { targetLanguage, useGlossary, idempotencyKey },
  ) => {
    const document = documents.find((item) => item.id === documentId)
    if (!document?.jobId || !session) {
      throw new DocumentUploadPreparationError(t('workspace.uploadUnavailable'))
    }

    try {
      const response = await retranslateDocumentRequest(
        document.jobId,
        { target_lang: targetLanguage, use_glossary: useGlossary || undefined },
        { accessToken: session.accessToken, idempotencyKey },
      )
      // Повторный ключ возвращает ту же задачу: никогда не показываем её дважды.
      const translated: DocumentItem = {
        id: response.job_id,
        name: document.name,
        format: document.format,
        sourceLanguage: document.sourceLanguage,
        targetLanguage,
        pages: 0,
        status: 'processing',
        serverStatus: 'PENDING',
        progress: 0,
        jobId: response.job_id,
        billedUnits: response.billed_units,
        glossaryTermCount: response.glossary_term_count,
        createdAt: new Date().toISOString(),
      }
      rememberDocumentMetadata(session.email, response.job_id, {
        name: document.name,
        documentId: translated.id,
      })
      setDocuments((current) => current.some((item) => item.jobId === response.job_id)
        ? current
        : [translated, ...current])
      reloadAccount()
      void navigate(documentPath(response.job_id))
      return response
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 429) reloadAccount()
      throw error
    }
  }

  const deleteDocument = async (documentId: string) => {
    const document = documents.find((item) => item.id === documentId)
    if (!document) return
    if (document.jobId) {
      if (!session) throw new DocumentUploadPreparationError(t('workspace.uploadUnavailable'))
      try {
        await deleteDocumentRequest(document.jobId, { accessToken: session.accessToken })
      } catch (error) {
        // 404: уже удалена (в другой вкладке) или никогда не была нашей — список в любом случае устарел.
        if (!(error instanceof ApiClientError && error.status === 404)) throw error
      }
    }

    const remaining = documents.filter((item) => item.id !== documentId)
    setDocuments((current) => current.filter((item) => item.id !== documentId))
    if (activeDocument?.id === documentId) {
      const next = remaining[0]
      void navigate(next ? pathForDocument(next) : '/', { replace: true })
    }
  }

  const cancelTranslation = async (documentId: string) => {
    const document = documents.find((item) => item.id === documentId)
    if (!document?.jobId || !session) {
      throw new DocumentUploadPreparationError(t('workspace.uploadUnavailable'))
    }
    const jobId = document.jobId
    const options = { accessToken: session.accessToken }
    try {
      const response = await cancelDocumentTranslation(jobId, options)
      if (response.job_id === jobId) handleStatusUpdates([{ documentId, response }])
    } catch (error) {
      // Перевод успел завершиться до отмены: подтягиваем настоящий статус,
      // чтобы документ не остался «переводящимся» до следующего опроса.
      if (hasApiErrorCode(error, 'DOCUMENT_ALREADY_FINISHED')) {
        getTranslationStatus(jobId, options).then(
          (response) => handleStatusUpdates([{ documentId, response }]),
          () => setStatusRefreshKey((key) => key + 1),
        )
      }
      throw error
    }
  }

  return (
    <ProfileProvider>
      <NotesProvider>
      <div
        className={`${styles.layout} ${isFullscreenMode ? styles.expandedMode : ''} ${sidebar.isResizing ? styles.resizing : ''}`}
        style={{ '--sidebar-current-width': `${sidebar.currentWidth}px` } as CSSProperties}
      >
        {!isFullscreenMode ? (
          <Sidebar
            documents={documents}
            activeDocumentId={isWorkspaceRoute ? activeDocument?.id : undefined}
            onSelectDocument={handleSelectDocument}
            onUploadDocument={handleSidebarUpload}
            onDeleteDocument={deleteDocument}
            onCancelTranslation={cancelTranslation}
            onRateDocument={handleRateDocument}
            width={sidebar.expandedWidth}
            isCollapsed={sidebar.isCollapsed}
            isResizing={sidebar.isResizing}
            onToggleCollapsed={sidebar.toggleCollapsed}
            onResizeStart={sidebar.handleResizeStart}
            onResizeMove={sidebar.handleResizeMove}
            onResizeEnd={sidebar.handleResizeEnd}
            onResizeKeyDown={sidebar.handleResizeKeyDown}
            onResetWidth={sidebar.resetWidth}
            workspaceNotes={isWorkspaceRoute ? workspaceNotes : null}
          />
        ) : null}
        <main className={styles.content}>
          {!isFullscreenMode ? <EmailVerificationBanner /> : null}
          <div className={styles.pageContent}>
            <Outlet
              context={{
                activeDocument,
                routeDocumentState,
                documents,
                historyState,
                fullscreenLayout,
                setFullscreenLayout,
                selectDocument: handleSelectDocument,
                retryHistory: handleRetryHistory,
                attachOriginal,
                resumeTranslationWaiting,
                startDocumentTranslation,
                retranslateDocument,
                deleteDocument,
                cancelTranslation,
                prepareDocument,
                connectWorkspaceNotes: setWorkspaceNotes,
              } satisfies AppLayoutContextValue}
            />
          </div>
        </main>
      </div>
      </NotesProvider>
    </ProfileProvider>
  )
}
