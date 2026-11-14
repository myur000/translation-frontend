import { useEffect, useId, useState } from 'react'
import type { NoteQuoteResponse, NoteSummary } from '../../api/contracts/notes.ts'
import { createNote } from '../../api/notes.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { noteErrorMessage, type NoteErrorMessage } from '../../notes/noteErrors.ts'
import { NOTES_SEARCH_DELAY_MS } from '../../notes/notesQuery.ts'
import { plainExcerpt } from '../../notes/noteSyntax.ts'
import type { QuoteSelection } from '../../notes/quoteLocator.ts'
import { useNotes } from '../../notes/useNotes.ts'
import { useNotesList } from '../../notes/useNotesList.ts'
import type { DocumentItem } from '../../types/document.ts'
import type { NotesSide } from '../../workspace/notesPanelStorage.ts'
import type { NotesWindowHandle } from '../../workspace/useNotesWindow.ts'
import { NoteEditor } from './NoteEditor.tsx'
import { PanelNoteView, type ShowQuoteResult } from './PanelNoteView.tsx'
import { QuoteComposer } from './QuoteComposer.tsx'
import styles from './WorkspaceNotesPanel.module.css'
import { GlyphIcon } from '../ui/GlyphIcon.tsx'

type PanelView = { kind: 'list' } | { kind: 'note'; id: string } | { kind: 'new' }

/** Что показать по метке на полях; `nonce` различает повторные нажатия на ту же метку. */
export interface NotesPanelRequest {
  nonce: number
  noteIds: string[]
}

/** Одна заметка открывается сразу, несколько — списком книги, суженным до них. */
function viewForRequest(request: NotesPanelRequest): PanelView {
  return request.noteIds.length === 1 ? { kind: 'note', id: request.noteIds[0] } : { kind: 'list' }
}

/**
 * Оболочка, в которой показаны заметки. Содержимое у всех одно и то же, меняются
 * только кнопки заголовка; смена оболочки не перемонтирует панель, поэтому
 * открытая заметка и начатая цитата не теряются.
 */
export type NotesFrame =
  | {
    kind: 'docked'
    /** У какого края стоит колонка: кнопка переноса предлагает противоположный. */
    side: NotesSide
    onSwitchSide: () => void
    onUndock: () => void
    onClose: () => void
  }
  | {
    kind: 'floating'
    /** Перетаскивание за заголовок и клавиши на ручке окна. */
    handle: NotesWindowHandle
    onCollapse: () => void
    onDock: () => void
    onClose: () => void
  }
  /** Нижняя шторка на телефоне: ни краёв, ни окна там нет. */
  | { kind: 'sheet'; onClose: () => void }

interface WorkspaceNotesPanelProps {
  document: DocumentItem
  frame: NotesFrame
  /** Вкладка «Граф» в заголовке окна; пока граф не готов, она выключена. */
  showGraphTab?: boolean
  /** Выделение, которое пользователь отправил «В заметку»; `null` — цитата не добавляется. */
  pendingQuote: QuoteSelection | null
  /** Нажатие на метку у абзаца. */
  request?: NotesPanelRequest | null
  onQuoteFinished: () => void
  onShowQuote: (quote: NoteQuoteResponse) => ShowQuoteResult
}

/**
 * Заметки рядом с книгой: заметки с цитатами из неё, все заметки, просмотр и
 * правка без ухода со страницы, добавление цитаты из выделения. Те же заметки,
 * что в разделе «Заметки», — панель лишь показывает их в контексте книги.
 * Где стоят заметки (окно, край, шторка на телефоне), решает рабочая область.
 */
export function WorkspaceNotesPanel({ document, frame, showGraphTab = false, pendingQuote, request = null, onQuoteFinished, onShowQuote }: WorkspaceNotesPanelProps) {
  const { t } = useTranslation()
  const headerIds = useId()
  const [section, setSection] = useState<'notes' | 'graph'>('notes')
  const hasSections = showGraphTab && frame.kind === 'floating'
  const isGraphShown = hasSections && section === 'graph'
  const { notesChanged } = useNotes()
  const jobId = document.jobId ?? null
  const [view, setView] = useState<PanelView>(() => (request ? viewForRequest(request) : { kind: 'list' }))
  const [tab, setTab] = useState<'book' | 'all'>(jobId ? 'book' : 'all')
  // Заметки абзаца, по метке которого открыли панель; `null` — весь список книги.
  const [focusIds, setFocusIds] = useState<string[] | null>(() =>
    request && request.noteIds.length > 1 ? request.noteIds : null)
  const [handledNonce, setHandledNonce] = useState(request?.nonce ?? null)
  if (request && request.nonce !== handledNonce) {
    setHandledNonce(request.nonce)
    setView(viewForRequest(request))
    setFocusIds(request.noteIds.length > 1 ? request.noteIds : null)
    if (request.noteIds.length > 1) setTab('book')
  }
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), NOTES_SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [search])

  const bookNotes = useNotesList(jobId ? { job_id: jobId, size: 50 } : null, revision)
  const allNotes = useNotesList(tab === 'all' ? { q: query || undefined, size: 50 } : null, revision)
  const changed = () => {
    setRevision((value) => value + 1)
    notesChanged()
  }
  const openNote = (id: string) => setView({ kind: 'note', id })

  let content
  if (pendingQuote && jobId && document.status === 'ready') {
    content = (
      <div className={styles.body}>
        <QuoteComposer
          // Новое выделение — новый поиск абзаца и новое предложенное название.
          key={`${pendingQuote.side}:${pendingQuote.text}`}
          jobId={jobId}
          selection={pendingQuote}
          bookNotes={bookNotes.items}
          onSaved={(id) => { changed(); onQuoteFinished(); openNote(id) }}
          onCancel={onQuoteFinished}
        />
      </div>
    )
  } else if (view.kind === 'note') {
    content = (
      <PanelNoteView
        key={view.id}
        noteId={view.id}
        jobId={jobId}
        onBack={() => setView({ kind: 'list' })}
        onShowQuote={onShowQuote}
        onChanged={changed}
      />
    )
  } else if (view.kind === 'new') {
    content = <PanelNewNote onCreated={(id) => { changed(); openNote(id) }} onCancel={() => setView({ kind: 'list' })} />
  } else {
    const focused = tab === 'book' && focusIds
      ? { ...bookNotes, items: bookNotes.items.filter((note) => focusIds.includes(note.id)) }
      : null
    const list = focused ?? (tab === 'book' ? bookNotes : allNotes)
    content = (
      <div className={styles.body}>
        <div className={styles.listTools}>
          {jobId ? (
            <div className={styles.tabs} role="tablist" aria-label={t('notes.title')}>
              {(['book', 'all'] as const).map((value) => (
                <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => { setTab(value); setFocusIds(null) }}>
                  {t(value === 'book' ? 'notesPanel.bookTab' : 'notesPanel.allTab')}
                  {value === 'book' && bookNotes.status === 'ready' ? <span className={styles.count}>{bookNotes.total}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
          {tab === 'all' ? (
            <input type="search" value={search} placeholder={t('notes.search')} aria-label={t('notes.search')}
              onChange={(event) => setSearch(event.currentTarget.value)} />
          ) : null}
          <button type="button" className={styles.create} onClick={() => setView({ kind: 'new' })}><GlyphIcon name="plus" /> {t('notes.newTitle')}</button>
          {focused ? (
            <div className={styles.focusBar} role="status">
              <span>{t('notesPanel.paragraphNotes', { count: focusIds?.length ?? 0 })}</span>
              <button type="button" onClick={() => setFocusIds(null)}>{t('notesPanel.showAllBookNotes')}</button>
            </div>
          ) : null}
        </div>
        <NotesListBody
          list={list}
          emptyText={tab === 'book' ? t(jobId && document.status === 'ready' ? 'notesPanel.bookEmpty' : 'notesPanel.noBook')
            : t(query ? 'notes.emptySearch' : 'notes.empty')}
          onOpen={openNote}
          onRetry={() => setRevision((value) => value + 1)}
        />
      </div>
    )
  }

  const isWindow = frame.kind === 'floating'
  const subtitle = jobId && bookNotes.status === 'ready'
    ? <span>{t('notesPanel.bookSubtitle', { count: bookNotes.total })}</span>
    : null
  const sectionId = (value: 'notes' | 'graph') => `${headerIds}-${value}`

  return (
    // У окна имя и роль даёт его оболочка (диалог); колонка и шторка — область страницы.
    <div className={styles.panel} role={isWindow ? undefined : 'complementary'} aria-label={isWindow ? undefined : t('notes.title')}>
      <header className={`${styles.header} ${isWindow ? styles.windowHeader : ''}`} {...(isWindow ? frame.handle.header : {})}>
        {isWindow ? (
          <button
            type="button"
            className={styles.moveHandle}
            data-window-handle=""
            aria-label={t('notesWindow.move')}
            aria-describedby={`${headerIds}-hint`}
            title={t('notesWindow.moveHint')}
            onKeyDown={frame.handle.onHandleKeyDown}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01" /></svg>
          </button>
        ) : null}
        {hasSections ? (
          <div className={styles.sections} role="tablist" aria-label={t('notes.title')}>
            {(['notes', 'graph'] as const).map((value) => (
              <button
                key={value}
                id={`${sectionId(value)}-tab`}
                type="button"
                role="tab"
                aria-selected={section === value}
                aria-controls={sectionId(value)}
                onClick={() => setSection(value)}
              >
                {t(value === 'notes' ? 'notesWindow.notesTab' : 'notesWindow.graphTab')}
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.title}>
            <h2>{t('notes.title')}</h2>
            {subtitle}
          </div>
        )}
        <div className={styles.headerActions}>
          {frame.kind === 'docked' ? (
            <>
              <button type="button" aria-label={t('notesWindow.undock')} title={t('notesWindow.undock')} onClick={frame.onUndock}>
                {/* Окно, приподнятое над страницей. */}
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <rect x="2" y="5.5" width="8.5" height="8" rx="1.4" />
                  <path d="M5.5 5.5V3.9c0-.8.6-1.4 1.4-1.4h5.7c.8 0 1.4.6 1.4 1.4v5.2c0 .8-.6 1.4-1.4 1.4h-2.1" />
                </svg>
              </button>
              <button
                type="button"
                className={styles.sideButton}
                aria-label={t(frame.side === 'right' ? 'notes.moveLeft' : 'notes.moveRight')}
                title={t(frame.side === 'right' ? 'notes.moveLeft' : 'notes.moveRight')}
                onClick={frame.onSwitchSide}
              >
                {/* Окно с панелью у того края, куда она переедет. */}
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <rect x="2" y="3" width="12" height="10" rx="1.6" />
                  <path d={frame.side === 'right' ? 'M6 3v10' : 'M10 3v10'} />
                </svg>
              </button>
            </>
          ) : null}
          {frame.kind === 'floating' ? (
            <>
              <button type="button" aria-label={t('notesWindow.collapse')} title={t('notesWindow.collapse')} onClick={frame.onCollapse}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 11.5h8" /></svg>
              </button>
              <button type="button" aria-label={t('notesWindow.dock')} title={t('notesWindow.dock')} onClick={frame.onDock}>
                {/* Окно с колонкой у правого края. */}
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <rect x="2" y="3" width="12" height="10" rx="1.6" />
                  <path d="M10 3v10M11.8 6h.4M11.8 8h.4" />
                </svg>
              </button>
            </>
          ) : null}
          <button type="button" aria-label={t('notes.close')} title={t('notes.close')} onClick={frame.onClose}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        {isWindow ? <span id={`${headerIds}-hint`} hidden>{t('notesWindow.moveHint')}</span> : null}
      </header>
      {/* Обёртка одна при любой оболочке: содержимое не перемонтируется и остаётся
          смонтированным, пока открыт граф. */}
      <div
        id={sectionId('notes')}
        className={styles.section}
        role={hasSections ? 'tabpanel' : undefined}
        aria-labelledby={hasSections ? `${sectionId('notes')}-tab` : undefined}
        hidden={isGraphShown}
      >
        {content}
      </div>
      {hasSections ? (
        <div id={sectionId('graph')} className={styles.section} role="tabpanel" aria-labelledby={`${sectionId('graph')}-tab`} hidden={!isGraphShown}>
          <p className={styles.muted}>{t('notesWindow.graphSoon')}</p>
        </div>
      ) : null}
    </div>
  )
}

function NotesListBody({ list, emptyText, onOpen, onRetry }: {
  list: { status: string; items: NoteSummary[] }
  emptyText: string
  onOpen: (id: string) => void
  onRetry: () => void
}) {
  const { t } = useTranslation()
  if (list.status === 'loading') return <p className={styles.muted} role="status">{t('notes.loading')}</p>
  if (list.status === 'error') {
    return (
      <div className={styles.problemBox} role="alert">
        <span>{t('notes.loadError')}</span>
        <button type="button" className={styles.secondary} onClick={onRetry}>{t('notes.retry')}</button>
      </div>
    )
  }
  if (!list.items.length) return <p className={styles.muted}>{emptyText}</p>
  return (
    <ul className={styles.list}>
      {list.items.map((note) => (
        <li key={note.id}>
          <button type="button" className={styles.item} onClick={() => onOpen(note.id)}>
            <strong>{note.title}</strong>
            {note.excerpt ? <span>{plainExcerpt(note.excerpt)}</span> : null}
            {note.quote_count ? <small>{t('notes.quoteCount', { count: note.quote_count })}</small> : null}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Новая заметка без цитаты: общий блокнот доступен и рядом с книгой. */
function PanelNewNote({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const { drafts } = useNotes()
  const [draft] = useState(() => drafts.get('new:'))
  const [isSaving, setSaving] = useState(false)
  const [error, setError] = useState<NoteErrorMessage | null>(null)
  return (
    <div className={styles.body}>
      <NoteEditor
        initialTitle={draft?.title ?? ''}
        initialBody={draft?.body ?? ''}
        knownLinks={[]}
        submitLabel={t('notes.create')}
        isSaving={isSaving}
        error={error}
        compact
        onChange={(title, body) => {
          if (!title.trim() && !body) drafts.clear('new:')
          else drafts.set('new:', { title, body, baseVersion: null })
        }}
        onSubmit={(title, body) => {
          const token = session?.accessToken
          if (!token) return
          setSaving(true)
          setError(null)
          createNote({ title, body }, { accessToken: token }).then((note) => {
            drafts.clear('new:')
            onCreated(note.id)
          }, (caught: unknown) => {
            setError(noteErrorMessage(caught))
            setSaving(false)
          })
        }}
        onCancel={() => { drafts.clear('new:'); onCancel() }}
      />
    </div>
  )
}
