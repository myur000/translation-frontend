import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { AccountProvider } from '../account/AccountProvider.tsx'
import { useAccount } from '../account/useAccount.ts'
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router'
import {
  deleteDocument as deleteDocumentRequest,
  estimateDocument,
  getDocumentHistory,
  retranslateDocument as retranslateDocumentRequest,
  uploadDocument as uploadDocumentRequest,
} from '../api/documents.ts'
import type { DocumentUploadResponse } from '../api/contracts/documents.ts'
import { ApiClientError } from '../api/client.ts'
import { useAuth } from '../auth/useAuth.ts'
import { EmailVerificationBanner } from '../components/auth/EmailVerificationBanner.tsx'
import { Sidebar } from '../components/sidebar/Sidebar.tsx'
import { historyItemToDocument } from '../documents/documentHistory.ts'
import {
  readDocumentMetadata,
  rememberDocumentMetadata,
} from '../documents/documentMetadataStorage.ts'
import { createLocalDocumentId, documentPath } from '../documents/documentRoutes.ts'
import {
  useRouteDocument,
  type RouteDocumentState,
} from '../documents/useRouteDocument.ts'
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
import styles from './AppLayout.module.css'

export type HistoryLoadState = 'loading' | 'ready' | 'error'

export interface AppLayoutContextValue {
  activeDocument: DocumentItem | null
  /** Resolution of `/documents/:jobId`; `none` on the plain workspace route. */
  routeDocumentState: RouteDocumentState
  documents: DocumentItem[]
  historyState: HistoryLoadState
  expandedPanel: ExpandedPanel
  isDualPanelFullscreen: boolean
  setExpandedPanel: (panel: ExpandedPanel) => void
  setDualPanelFullscreen: (isFullscreen: boolean) => void
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
   * Translates an uploaded document into another language from the source
   * kept by the backend; resolves with the new job, which becomes active.
   */
  retranslateDocument: (
    documentId: string,
    request: { targetLanguage: LanguageCode; useGlossary: boolean; idempotencyKey: string },
  ) => Promise<DocumentUploadResponse>
  /** Deletes the job on the backend (drafts only locally) and drops it from the list. */
  deleteDocument: (documentId: string) => Promise<void>
}
export type ExpandedPanel = 'original' | 'translation' | null

const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024
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
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)
  const [historyState, setHistoryState] = useState<HistoryLoadState>('loading')
  const [historyRevision, setHistoryRevision] = useState(0)
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null)
  const [isDualPanelFullscreen, setDualPanelFullscreen] = useState(false)
  const [fullscreenLocationKey, setFullscreenLocationKey] = useState(location.key)
  const sidebar = useResizableSidebar()
  const routeJobId = useMatch('/documents/:jobId')?.params.jobId ?? null
  const isWorkspaceRoute = location.pathname === '/' || routeJobId !== null

  // AppLayout survives navigation. React retries this render before committing
  // children, so stale fullscreen state never reaches the new page.
  if (fullscreenLocationKey !== location.key) {
    setFullscreenLocationKey(location.key)
    setExpandedPanel(null)
    setDualPanelFullscreen(false)
  }

  const addFoundDocument = useCallback((document: DocumentItem) => {
    setDocuments((current) =>
      current.some((item) => item.jobId === document.jobId) ? current : [...current, document])
  }, [])
  const routeDocumentState = useRouteDocument({
    jobId: routeJobId,
    documents,
    historyState,
    session,
    onFound: addFoundDocument,
  })
  // A document link wins over the last selection; the plain workspace route
  // keeps showing the last selected document.
  const activeDocument = routeJobId !== null
    ? documents.find((item) => item.jobId === routeJobId) ?? null
    : documents.find((item) => item.id === activeDocumentId) ?? documents[0] ?? null
  const pollingJobs = documents.flatMap((document) =>
    document.jobId && document.status === 'processing' && !document.waitingIssue
      ? [{ documentId: document.id, jobId: document.jobId,
          status: document.serverStatus ?? 'PENDING', progress: document.progress ?? 0 }]
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
        const historyDocuments = response.items.map((item) =>
          historyItemToDocument(item, metadata[item.job_id]),
        )

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
        setActiveDocumentId((current) => current ?? historyDocuments[0]?.id ?? null)
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
      // Refresh once per completed/failed job; do not refresh on every progress tick.
      const completed = updates.filter(({ response }) =>
        (response.status === 'DONE' || response.status === 'FAILED') &&
        !observedTerminalJobs.current.has(response.job_id))
      if (completed.length) {
        completed.forEach(({ response }) => observedTerminalJobs.current.add(response.job_id))
        reloadAccount()
      }
      const updatesByDocument = new Map(
        updates.map((update) => [update.documentId, update.response]),
      )

      setDocuments((current) =>
        current.map((document) => {
          const response = updatesByDocument.get(document.id)
          if (!response) return document

          const status =
            response.status === 'DONE'
              ? 'ready'
              : response.status === 'FAILED'
                ? 'failed'
                : 'processing'
          const progress = Math.min(100, Math.max(0, response.progress))
          const errorMessage =
            response.status === 'FAILED'
              ? response.error_message ?? undefined
              : undefined

          if (
            document.status === status &&
            document.serverStatus === response.status &&
            !document.waitingIssue &&
            document.progress === progress &&
            document.errorMessage === errorMessage
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

  useTranslationStatusPolling({
    accessToken: session?.accessToken ?? null,
    jobs: pollingJobs,
    onUpdate: handleStatusUpdates,
    onTimeout: handleWaitingTimeout,
  })

  useEffect(() => {
    if (expandedPanel === null && !isDualPanelFullscreen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpandedPanel(null)
        setDualPanelFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [expandedPanel, isDualPanelFullscreen])

  const isFullscreenMode =
    isWorkspaceRoute && (expandedPanel !== null || isDualPanelFullscreen)

  const handleSelectDocument = (documentId: string) => {
    setActiveDocumentId(documentId)
    const jobId = documents.find((item) => item.id === documentId)?.jobId
    void navigate(jobId ? documentPath(jobId) : '/')
  }

  const handleRetryHistory = () => {
    setHistoryState('loading')
    setHistoryRevision((revision) => revision + 1)
  }

  const handlePrepareDocument = (file: File) => {
    const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
    if (!SUPPORTED_EXTENSIONS.has(extension)) return t('workspace.unsupportedFile')
    if (file.size > MAX_DOCUMENT_SIZE) return t('workspace.fileTooLarge')

    const document: DocumentItem = {
      id: createLocalDocumentId(),
      name: file.name,
      sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
      targetLanguage: DEFAULT_TARGET_LANGUAGE,
      pages: 0,
      status: 'draft',
      sourceFile: file,
    }
    setDocuments((current) => [document, ...current])
    setActiveDocumentId(document.id)
    void navigate('/')
    if (session) void loadEstimate(document.id, file, session.accessToken)
    return t('workspace.fileReady', { name: file.name })
  }

  /** Optional hint: unverified accounts (403) and failures simply show no estimate. */
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
      // The upload validates the file again and reports real errors.
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
      // Give the job its own address: a reload or a shared link reopens it.
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
      // A repeated key returns the same job: never list it twice.
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
      setActiveDocumentId(translated.id)
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
        // 404: already deleted (another tab) or never ours — the list is stale either way.
        if (!(error instanceof ApiClientError && error.status === 404)) throw error
      }
    }

    const remaining = documents.filter((item) => item.id !== documentId)
    setDocuments((current) => current.filter((item) => item.id !== documentId))
    if (activeDocument?.id === documentId) {
      const next = remaining[0]
      setActiveDocumentId(next?.id ?? null)
      void navigate(next?.jobId ? documentPath(next.jobId) : '/', { replace: true })
    }
  }

  return (
    <ProfileProvider>
      <div
        className={`${styles.layout} ${isFullscreenMode ? styles.expandedMode : ''} ${sidebar.isResizing ? styles.resizing : ''}`}
        style={{ '--sidebar-current-width': `${sidebar.currentWidth}px` } as CSSProperties}
      >
        {!isFullscreenMode ? (
          <Sidebar
            documents={documents}
            activeDocumentId={isWorkspaceRoute ? activeDocument?.id : undefined}
            onSelectDocument={handleSelectDocument}
            onUploadDocument={handlePrepareDocument}
            width={sidebar.expandedWidth}
            isCollapsed={sidebar.isCollapsed}
            isResizing={sidebar.isResizing}
            onToggleCollapsed={sidebar.toggleCollapsed}
            onResizeStart={sidebar.handleResizeStart}
            onResizeMove={sidebar.handleResizeMove}
            onResizeEnd={sidebar.handleResizeEnd}
            onResizeKeyDown={sidebar.handleResizeKeyDown}
            onResetWidth={sidebar.resetWidth}
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
                expandedPanel,
                isDualPanelFullscreen,
                setExpandedPanel,
                setDualPanelFullscreen,
                selectDocument: handleSelectDocument,
                retryHistory: handleRetryHistory,
                attachOriginal,
                resumeTranslationWaiting,
                startDocumentTranslation,
                retranslateDocument,
                deleteDocument,
              } satisfies AppLayoutContextValue}
            />
          </div>
        </main>
      </div>
    </ProfileProvider>
  )
}
