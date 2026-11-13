import {
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEventHandler,
  type PointerEventHandler,
} from 'react'
import { Link, NavLink } from 'react-router'
import { DocumentActionsMenu } from '../toolbar/DocumentActionsMenu.tsx'
import { DeleteDocumentDialog } from '../workspace/DeleteDocumentDialog.tsx'
import { CancelTranslationDialog } from '../workspace/CancelTranslationDialog.tsx'
import { documentMenuActions } from '../../documents/documentMenuActions.ts'
import { usePinnedDocuments } from '../../documents/pinnedDocuments.ts'
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
import { NotesSidebar } from '../notes/NotesSidebar.tsx'
import { SidebarModeSwitch, type SidebarMode } from './SidebarModeSwitch.tsx'
import styles from './Sidebar.module.css'

interface SidebarProps {
  /** Раздел определяется адресом: `/notes…` — заметки, остальное — книги. */
  mode: SidebarMode
  booksPath: string
  notesPath: string
  documents: DocumentItem[]
  activeDocumentId?: string
  onSelectDocument: (documentId: string) => void
  onUploadDocument: (file: File) => string
  /** Удаляет задачу на бэкенде (черновики — только локально). */
  onDeleteDocument: (documentId: string) => Promise<void>
  /** Отменяет идущий перевод (после подтверждения). */
  onCancelTranslation: (documentId: string) => Promise<void>
  /** Открывает документ и сразу предлагает оценить перевод. */
  onRateDocument: (documentId: string) => void
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
  mode,
  booksPath,
  notesPath,
  documents,
  activeDocumentId,
  onSelectDocument,
  onUploadDocument,
  onDeleteDocument,
  onCancelTranslation,
  onRateDocument,
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
  const [pendingCancel, setPendingCancel] = useState<DocumentItem | null>(null)
  const { pinnedJobIds, isPinned, setPinned } = usePinnedDocuments()
  // Закреплённые идут отдельным разделом в порядке закрепления; остальные — как пришли.
  const pinned = pinnedJobIds.flatMap((jobId) => documents.filter((document) => document.jobId === jobId))
  const unpinned = documents.filter((document) => !isPinned(document.jobId))

  const actionsFor = (document: DocumentItem) => documentMenuActions({
    document,
    t,
    isPinned: isPinned(document.jobId),
    onTogglePin: () => { if (document.jobId) setPinned(document.jobId, !isPinned(document.jobId)) },
    onRate: () => onRateDocument(document.id),
    onCancelTranslation: () => setPendingCancel(document),
    onDelete: () => document.jobId ? setPendingDelete(document) : void onDeleteDocument(document.id),
  })

  const renderDocument = (document: DocumentItem) => {
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
              {/* Процент у отменённой задачи ничего не значит: работа остановлена. */}
              {document.progress !== undefined && document.status !== 'canceled' ? ` · ${document.progress}%` : ''}
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
  }

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
        <Link to="/" className={styles.brandLink} aria-label={t('sidebar.home')} title={t('sidebar.home')}>
          <BrandMark className={styles.brandMark} size={28} />
          <span className={styles.brandName}>Parallel</span>
        </Link>
        <button
          type="button"
          className={styles.collapseButton}
          onClick={onToggleCollapsed}
          aria-label={isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          aria-expanded={!isCollapsed}
          title={isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
        >
          <SidebarToggleIcon />
        </button>
      </div>

      <SidebarModeSwitch mode={mode} booksPath={booksPath} notesPath={notesPath} isCollapsed={isCollapsed} />

      {mode === 'notes' ? <NotesSidebar isCollapsed={isCollapsed} /> : (
        <>
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

        <div className={styles.documentList}>
          {pinned.length ? (
            <>
              <div className={styles.sectionHeader}>
                <span>{t('sidebar.pinned')}</span>
                <span className={styles.count}>{pinned.length}</span>
              </div>
              <nav className={styles.documentGroup} aria-label={t('sidebar.pinned')}>
                {pinned.map(renderDocument)}
              </nav>
            </>
          ) : null}
          <div className={styles.sectionHeader}>
            <span>{t('sidebar.myBooks')}</span>
            <span className={styles.count}>{unpinned.length}</span>
          </div>
          <nav className={styles.documentGroup} aria-label={t('sidebar.myBooks')}>
            {unpinned.map(renderDocument)}
          </nav>
        </div>
        </>
      )}

      {pendingDelete ? (
        <DeleteDocumentDialog
          document={pendingDelete}
          onDelete={onDeleteDocument}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}
      {pendingCancel ? (
        <CancelTranslationDialog
          document={pendingCancel}
          onCancelTranslation={onCancelTranslation}
          onClose={() => setPendingCancel(null)}
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

/**
 * Иконка «боковая панель»: окно с выделенной левой колонкой. Одна и та же в обоих
 * состояниях — направление действия передают aria-label и подсказка, а не форма.
 */
function SidebarToggleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3.5" y="4.5" width="17" height="15" rx="3.5" />
      <path d="M9.5 4.5v15" />
    </svg>
  )
}
