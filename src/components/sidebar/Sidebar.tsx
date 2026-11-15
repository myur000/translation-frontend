import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEventHandler,
  type PointerEventHandler,
} from 'react'
import { Link, NavLink, useMatch, useNavigate } from 'react-router'
import { GRAPH_PATH } from '../../graph/graphQuery.ts'
import { GraphSidebarPanel } from './GraphSidebarPanel.tsx'
import { bookSummaryHref } from '../../notes/noteBooks.ts'
import { DocumentActionsMenu } from '../toolbar/DocumentActionsMenu.tsx'
import { DeleteDocumentDialog } from '../workspace/DeleteDocumentDialog.tsx'
import { CancelTranslationDialog } from '../workspace/CancelTranslationDialog.tsx'
import { documentMenuActions, readingToggle } from '../../documents/documentMenuActions.ts'
import { useReadingProgress, type ReadingState } from '../../reading/readingProgress.ts'
import { usePinnedDocuments } from '../../documents/pinnedDocuments.ts'
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from '../../hooks/useResizableSidebar.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { DocumentItem } from '../../types/document.ts'
import { documentStatusLabel } from '../../documents/documentStatusLabel.ts'
import { bookTitle, coverInitial, coverTone, matchesBookQuery } from '../../documents/bookTitle.ts'
import { shortLanguageCode } from '../../languages/languageCatalog.ts'
import { BrandMark } from '../brand/BrandMark.tsx'
import { UserMenu } from '../user/UserMenu.tsx'
import { NotesSidebarPanel } from './NotesSidebarPanel.tsx'
import styles from './Sidebar.module.css'
import { GlyphIcon } from '../ui/GlyphIcon.tsx'

interface SidebarProps {
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

type SidebarSection = 'books' | 'notes' | 'graph'

export function Sidebar({
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
  const reading = useReadingProgress()
  const [query, setQuery] = useState('')
  const panelId = useId()
  const isNotesRoute = useMatch('/notes/*') !== null
  const isGraphRoute = useMatch(GRAPH_PATH) !== null
  const navigate = useNavigate()
  // Раздел панели; на странице заметок она открывается сразу с заметками.
  const [section, setSection] = useState<SidebarSection>(() => (isNotesRoute ? 'notes' : isGraphRoute ? 'graph' : 'books'))
  const shown = documents.filter((document) => matchesBookQuery(document.name, query))
  // Закреплённые идут отдельным разделом в порядке закрепления; остальные — как пришли.
  const pinned = pinnedJobIds.flatMap((jobId) => shown.filter((document) => document.jobId === jobId))
  const unpinned = shown.filter((document) => !isPinned(document.jobId))

  const actionsFor = (document: DocumentItem) => documentMenuActions({
    document,
    t,
    isPinned: isPinned(document.jobId),
    onTogglePin: () => { if (document.jobId) setPinned(document.jobId, !isPinned(document.jobId)) },
    onRate: () => onRateDocument(document.id),
    reading: document.jobId && document.status === 'ready' ? readingToggle(reading, document.jobId) : undefined,
    onOpenSummary: document.jobId ? () => { void navigate(bookSummaryHref(document.jobId!)) } : undefined,
    onCancelTranslation: () => setPendingCancel(document),
    onDelete: () => document.jobId ? setPendingDelete(document) : void onDeleteDocument(document.id),
  })

  const renderDocument = (document: DocumentItem) => {
    const isActive = document.id === activeDocumentId
    // У готового перевода вместо «Готов» — сколько прочитано: это то, что меняется.
    const readingState = document.jobId && document.status === 'ready' ? reading.stateOf(document.jobId) : null
    return (
      <div key={document.id} className={styles.documentRow}>
        <button
          type="button"
          className={`${styles.documentItem} ${isActive ? styles.active : ''}`}
          aria-pressed={isActive}
          onClick={() => onSelectDocument(document.id)}
          title={document.name}
        >
          <BookCover name={document.name} isPending={document.status === 'processing' || document.status === 'draft'} />
          <span className={styles.documentInfo}>
            <span className={styles.documentName}>{bookTitle(document.name)}</span>
            <span
              className={styles.documentMeta}
              title={document.errorMessage}
            >
              {readingState ? readingLabel(readingState, t) : t(documentStatusLabel(document))}
              {/* Процент у отменённой задачи ничего не значит: работа остановлена; у готовой — его заменяет прочитанное. */}
              {!readingState && document.progress !== undefined && document.status !== 'canceled' ? ` · ${document.progress}%` : ''}
              {document.jobId
                ? ` · ${shortLanguageCode(document.sourceLanguage)} → ${shortLanguageCode(document.targetLanguage)}`
                : ''}
            </span>
            {readingState?.status === 'reading' ? (
              <span className={styles.readingBar} aria-hidden="true">
                <span style={{ width: `${readingState.percent}%` }} />
              </span>
            ) : null}
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
    if (file) setUploadMessage(onUploadDocument(file))
    event.currentTarget.value = ''
  }

  const visibleSection = section
  const isSectionOpen = (value: SidebarSection) => !isCollapsed && visibleSection === value
  const openSection = (value: SidebarSection) => {
    // Как в редакторах кода: клик по открытому разделу сворачивает панель, по другому — переключает.
    if (isSectionOpen(value)) {
      onToggleCollapsed()
      return
    }
    setSection(value)
    if (isCollapsed) onToggleCollapsed()
  }

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      {/* Рельс разделов: как в редакторах кода — иконка раздела слева, его содержимое в панели.
          Новые разделы (граф, глоссарий) добавляются сюда, не отнимая место у книг. */}
      <nav className={styles.rail} aria-label={t('sidebar.sections')}>
        <Link to="/" className={styles.railBrand} aria-label={t('sidebar.home')} title={t('sidebar.home')}>
          <BrandMark className={styles.brandMark} size={32} />
        </Link>
        <button
          type="button"
          className={`${styles.railItem} ${isSectionOpen('books') ? styles.railItemOpen : ''}`}
          onClick={() => openSection('books')}
          aria-expanded={isSectionOpen('books')}
          aria-controls={panelId}
          title={t('sidebar.books')}
        >
          <GlyphIcon name="books" />
          <span className={styles.visuallyHidden}>{t('sidebar.books')}</span>
        </button>
        {/* Рельс — навигация, везде одинаково: «Заметки» ведёт в раздел заметок и из книги.
            Заметки к открытой книге — кнопка «Заметки» в её нижней панели. */}
        <button
          type="button"
          className={`${styles.railItem} ${isSectionOpen('notes') ? styles.railItemOpen : ''} ${isNotesRoute ? styles.railItemActive : ''}`}
          onClick={() => {
            if (!isNotesRoute) {
              setSection('notes')
              if (isCollapsed) onToggleCollapsed()
              void navigate('/notes')
              return
            }
            openSection('notes')
          }}
          aria-expanded={isSectionOpen('notes')}
          aria-controls={panelId}
          title={t('sidebar.modeNotes')}
        >
          <GlyphIcon name="notes" />
          <span className={styles.visuallyHidden}>{t('sidebar.modeNotes')}</span>
        </button>
        {/* Граф — отдельный раздел: карта всех заметок, книг и конспектов. Как «Заметки»:
            ведёт в раздел и открывает его панель (поиск, фильтры, книги). */}
        <button
          type="button"
          className={`${styles.railItem} ${isSectionOpen('graph') ? styles.railItemOpen : ''} ${isGraphRoute ? styles.railItemActive : ''}`}
          onClick={() => {
            if (!isGraphRoute) {
              setSection('graph')
              if (isCollapsed) onToggleCollapsed()
              void navigate(GRAPH_PATH)
              return
            }
            openSection('graph')
          }}
          aria-expanded={isSectionOpen('graph')}
          aria-controls={panelId}
          title={t('sidebar.graph')}
        >
          <GlyphIcon name="graph" />
          <span className={styles.visuallyHidden}>{t('sidebar.graph')}</span>
        </button>
        <NavLink
          to="/history"
          className={({ isActive }) => `${styles.railItem} ${isActive ? styles.railItemActive : ''}`}
          title={t('sidebar.history')}
        >
          <GlyphIcon name="history" />
          <span className={styles.visuallyHidden}>{t('sidebar.history')}</span>
        </NavLink>
        <div className={styles.railFooter}>
          <UserMenu isCollapsed />
        </div>
      </nav>

      {/* Панель раздела. В свёрнутом виде и у неактивного раздела она скрыта, а не
          размонтирована: поиск, раскрытые группы и начатая загрузка сохраняются. */}
      <div id={panelId} className={styles.panel}>
        <div className={styles.panelHeader}>
          {visibleSection === 'graph' ? (
            <Link to={GRAPH_PATH} className={`${styles.panelTitle} ${styles.panelTitleLink}`} title={t('graph.openSection')}>
              {t('sidebar.graph')}
            </Link>
          ) : visibleSection === 'notes' ? (
            <>
              <Link to="/notes" className={`${styles.panelTitle} ${styles.panelTitleLink}`} title={t('notesPanel.openSection')}>
                {t('sidebar.modeNotes')}
              </Link>
              <Link
                to="/notes/new"
                className={`${styles.iconButton} ${styles.addButton}`}
                aria-label={t('notesPanel.newNote')}
                title={t('notesPanel.newNote')}
              >
                <GlyphIcon name="plus" />
              </Link>
            </>
          ) : (
            <>
              <span className={styles.panelTitle}>{t('sidebar.books')}</span>
              <button
                type="button"
                className={`${styles.iconButton} ${styles.addButton}`}
                onClick={() => fileInputRef.current?.click()}
                aria-label={t('sidebar.addBook')}
                aria-describedby="local-upload-status"
                title={t('sidebar.addBook')}
              >
                <GlyphIcon name="plus" />
              </button>
            </>
          )}
          <button
            type="button"
            className={`${styles.iconButton} ${styles.collapseButton}`}
            onClick={onToggleCollapsed}
            aria-label={t('sidebar.collapse')}
            title={t('sidebar.collapse')}
          >
            <SidebarToggleIcon />
          </button>
          <input
            ref={fileInputRef}
            className={styles.fileInput}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
          />
        </div>

        <div className={styles.sectionBody} hidden={visibleSection !== 'notes'}>
          <NotesSidebarPanel isActive={isSectionOpen('notes')} />
        </div>

        <div className={styles.sectionBody} hidden={visibleSection !== 'graph'}>
          <GraphSidebarPanel isActive={isSectionOpen('graph')} />
        </div>

        <div className={styles.sectionBody} hidden={visibleSection !== 'books'}>
          <label className={styles.search}>
            <GlyphIcon name="search" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape' && query) { event.stopPropagation(); setQuery('') } }}
              placeholder={t('sidebar.search')}
              aria-label={t('sidebar.search')}
            />
          </label>
          <p id="local-upload-status" className={styles.uploadStatus} role="status">
            {uploadMessage}
          </p>

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
            {query && !shown.length ? <p className={styles.noMatches} role="status">{t('sidebar.noMatches')}</p> : null}
          </div>
        </div>

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
      </div>

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
    </aside>
  )
}

/**
 * Обложка книги на полке: корешок приглушённого тона с первой буквой названия.
 * Тон зависит от имени файла, поэтому книга узнаётся по цвету. Формат файла,
 * который раньше стоял на значке, — в подсказке строки.
 */
function BookCover({ name, isPending }: { name: string; isPending: boolean }) {
  return (
    <span
      className={`${styles.cover} ${isPending ? styles.coverPending : ''}`}
      style={{ background: `var(--cover-${coverTone(name)})` }}
      aria-hidden="true"
    >
      {coverInitial(bookTitle(name))}
    </span>
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

function readingLabel(state: ReadingState, t: ReturnType<typeof useTranslation>['t']) {
  if (state.status === 'read') return t('reading.read')
  if (state.status === 'reading') return t('reading.percent', { percent: state.percent })
  return t('reading.new')
}
