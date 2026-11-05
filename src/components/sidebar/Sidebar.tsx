import {
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEventHandler,
  type PointerEventHandler,
} from 'react'
import { NavLink } from 'react-router'
import { ApiClientError } from '../../api/client.ts'
import { DocumentActionsMenu, type DocumentAction } from '../toolbar/DocumentActionsMenu.tsx'
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx'
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from '../../hooks/useResizableSidebar.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { DocumentItem } from '../../types/document.ts'
import { documentStatusLabel } from '../../documents/documentStatusLabel.ts'
import { shortLanguageCode } from '../../languages/languageCatalog.ts'
import { BrandMark } from '../brand/BrandMark.tsx'
import { UserMenu } from '../user/UserMenu.tsx'
import styles from './Sidebar.module.css'

interface SidebarProps {
  documents: DocumentItem[]
  activeDocumentId?: string
  onSelectDocument: (documentId: string) => void
  onUploadDocument: (file: File) => string
  /** Deletes the job on the backend (drafts only locally). */
  onDeleteDocument: (documentId: string) => Promise<void>
  width: number
  isCollapsed: boolean
  isResizing: boolean
  onToggleCollapsed: () => void
  onResizeStart: PointerEventHandler<HTMLDivElement>
  onResizeMove: PointerEventHandler<HTMLDivElement>
  onResizeEnd: PointerEventHandler<HTMLDivElement>
  onResizeKeyDown: KeyboardEventHandler<HTMLDivElement>
  onResetWidth: () => void
}

export function Sidebar({
  documents,
  activeDocumentId,
  onSelectDocument,
  onUploadDocument,
  onDeleteDocument,
  width,
  isCollapsed,
  isResizing,
  onToggleCollapsed,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onResizeKeyDown,
  onResetWidth,
}: SidebarProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadMessage, setUploadMessage] = useState('')
  const [pendingDelete, setPendingDelete] = useState<DocumentItem | null>(null)
  const [isDeleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDeleteDocument(pendingDelete.id)
      setPendingDelete(null)
    } catch (error) {
      setDeleteError(error instanceof ApiClientError && error.status === 409
        ? t('delete.processing')
        : t('delete.failed'))
    } finally {
      setDeleting(false)
    }
  }

  const actionsFor = (document: DocumentItem): DocumentAction[] => document.jobId
    ? [{
        id: 'delete',
        label: t('documentActions.delete'),
        danger: true,
        disabledReason: document.status === 'processing' ? t('documentActions.processing') : undefined,
        onSelect: () => {
          setDeleteError(null)
          setPendingDelete(document)
        },
      }]
    : [{
        id: 'remove-draft',
        label: t('documentActions.removeDraft'),
        danger: true,
        onSelect: () => void onDeleteDocument(document.id),
      }]

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = event.currentTarget.files ?? []
    if (file) {
      setUploadMessage(onUploadDocument(file))
      if (isCollapsed) onToggleCollapsed()
    }
    event.currentTarget.value = ''
  }

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.brand}>
        <BrandMark className={styles.brandMark} size={28} />
        <span className={styles.brandName}>Parallel</span>
        <button
          type="button"
          className={styles.collapseButton}
          onClick={onToggleCollapsed}
          aria-label={isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          aria-expanded={!isCollapsed}
          title={isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
        >
          <span aria-hidden="true">{isCollapsed ? '›' : '‹'}</span>
        </button>
      </div>

      <div className={styles.primaryAction}>
        <button
          type="button"
          className={styles.uploadButton}
          onClick={() => fileInputRef.current?.click()}
          aria-describedby="local-upload-status"
          title={t('sidebar.addBook')}
        >
          <span aria-hidden="true">＋</span>
          <span className={styles.uploadLabel}>{t('sidebar.addBook')}</span>
        </button>
        <input
          ref={fileInputRef}
          className={styles.fileInput}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
        />
        <p id="local-upload-status" className={styles.uploadStatus} role="status">
          {uploadMessage}
        </p>
      </div>

      <div className={styles.sectionHeader}>
        <span>{t('sidebar.myBooks')}</span>
        <span className={styles.count}>{documents.length}</span>
      </div>

      <nav className={styles.documentList} aria-label={t('sidebar.myBooks')}>
        {documents.map((document) => {
          const isActive = document.id === activeDocumentId
          return (
            <div key={document.id} className={styles.documentRow}>
            <button
              type="button"
              className={`${styles.documentItem} ${isActive ? styles.active : ''}`}
              aria-pressed={isActive}
              onClick={() => onSelectDocument(document.id)}
              title={document.name}
            >
              <span className={styles.fileIcon} aria-hidden="true">
                {document.name.split('.').at(-1)?.toUpperCase()}
              </span>
              <span className={styles.documentInfo}>
                <span className={styles.documentName}>{document.name}</span>
                <span
                  className={styles.documentMeta}
                  title={document.errorMessage}
                >
                  {t(documentStatusLabel(document))}
                  {document.progress !== undefined ? ` · ${document.progress}%` : ''}
                  {document.jobId
                    ? ` · ${shortLanguageCode(document.sourceLanguage)} → ${shortLanguageCode(document.targetLanguage)}`
                    : ''}
                </span>
              </span>
            </button>
            {!isCollapsed ? (
              <DocumentActionsMenu
                className={styles.rowActions}
                variant="quiet"
                portal
                label={t('sidebar.documentActions', { name: document.name })}
                actions={actionsFor(document)}
              />
            ) : null}
            </div>
          )
        })}
      </nav>

      {pendingDelete ? (
        <ConfirmDialog
          title={t('delete.title', { name: pendingDelete.name })}
          description={t('delete.description')}
          confirmLabel={t('delete.confirm')}
          busy={isDeleting}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}

      <div className={styles.footer}>
        <NavLink
          to="/history"
          className={({ isActive }) =>
            `${styles.footerLink} ${isActive ? styles.footerLinkActive : ''}`
          }
        >
          <span aria-hidden="true">↺</span>
          <span className={styles.footerLabel}>{t('sidebar.history')}</span>
        </NavLink>
        <UserMenu isCollapsed={isCollapsed} />
      </div>

      {!isCollapsed ? (
        <div
          className={`${styles.resizeHandle} ${isResizing ? styles.resizeHandleActive : ''}`}
          role="separator"
          aria-label={t('sidebar.resize')}
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={width}
          aria-valuetext={t('sidebar.pixels', { value: width })}
          tabIndex={0}
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          onKeyDown={onResizeKeyDown}
          onDoubleClick={onResetWidth}
          title={t('sidebar.resizeHint')}
        />
      ) : null}
    </aside>
  )
}
