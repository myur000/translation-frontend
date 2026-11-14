import { useState } from 'react'
import { Link } from 'react-router'
import type { NoteQuoteResponse, NoteSummary } from '../../api/contracts/notes.ts'
import { createNote } from '../../api/notes.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { noteErrorMessage, type NoteErrorMessage } from '../../notes/noteErrors.ts'
import { plainExcerpt } from '../../notes/noteSyntax.ts'
import type { QuoteSelection } from '../../notes/quoteLocator.ts'
import { useNotes } from '../../notes/useNotes.ts'
import { useNotesList } from '../../notes/useNotesList.ts'
import type { DocumentItem } from '../../types/document.ts'
import type { BookQuote } from '../../notes/bookQuotes.ts'
import { NoteEditor } from './NoteEditor.tsx'
import { PanelNoteView, type ShowQuoteResult } from './PanelNoteView.tsx'
import { QuoteComposer } from './QuoteComposer.tsx'
import styles from './WorkspaceNotesPanel.module.css'

type PanelView = { kind: 'list' } | { kind: 'note'; id: string } | { kind: 'new'; summary?: NewNoteSummary }

/** Что показать по метке на полях; `nonce` различает повторные нажатия на ту же метку. */
export interface NotesPanelRequest {
  nonce: number
  noteIds: string[]
  /** «Новая заметка» из меню «+»: открыть форму новой заметки. */
  create?: boolean
  /** «Конспект книги» без конспекта: форма новой заметки, привязанной к книге. */
  summary?: NewNoteSummary
  /** Открыть конспект книги (на полях — карточку «Конспект книги»). */
  about?: boolean
}

/** Одна заметка открывается сразу, несколько — списком книги, суженным до них. */
function viewForRequest(request: NotesPanelRequest): PanelView {
  if (request.summary) return { kind: 'new', summary: request.summary }
  if (request.create) return { kind: 'new' }
  return request.noteIds.length === 1 ? { kind: 'note', id: request.noteIds[0] } : { kind: 'list' }
}

interface WorkspaceNotesPanelProps {
  document: DocumentItem
  /** Цитаты этой книги (те же, что у меток на полях): по ним заметки идут по ходу текста. */
  bookQuotes: BookQuote[]
  /** Выделение, которое пользователь отправил «В заметку»; `null` — цитата не добавляется. */
  pendingQuote: QuoteSelection | null
  /** Нажатие на метку у абзаца. */
  request?: NotesPanelRequest | null
  onQuoteFinished: () => void
  onShowQuote: (quote: NoteQuoteResponse) => ShowQuoteResult
  onClose: () => void
}

/** Первый абзац книги, который цитирует заметка; без цитат — `null` («О книге»). */
function firstParagraphs(quotes: BookQuote[]) {
  const first = new Map<string, number>()
  for (const quote of quotes) {
    const known = first.get(quote.noteId)
    if (known === undefined || quote.paragraphIndex < known) first.set(quote.noteId, quote.paragraphIndex)
  }
  return first
}

/**
 * Заметки рядом с книгой — колонка справа под шапкой (на телефоне — шторка).
 * Без вкладок и поиска: здесь заметки этой книги по ходу текста, а все заметки,
 * поиск и теги — в разделе «Заметки» (ссылка в заголовке). Просмотр и правка
 * заметки, добавление цитаты из выделения — без ухода со страницы.
 */
export function WorkspaceNotesPanel({ document, bookQuotes, pendingQuote, request = null, onQuoteFinished, onShowQuote, onClose }: WorkspaceNotesPanelProps) {
  const { t } = useTranslation()
  const { notesChanged } = useNotes()
  const jobId = document.jobId ?? null
  const [view, setView] = useState<PanelView>(() => (request ? viewForRequest(request) : { kind: 'list' }))
  // Заметки абзаца, по метке которого открыли панель; `null` — все заметки книги.
  const [focusIds, setFocusIds] = useState<string[] | null>(() =>
    request && request.noteIds.length > 1 ? request.noteIds : null)
  const [handledNonce, setHandledNonce] = useState(request?.nonce ?? null)
  if (request && request.nonce !== handledNonce) {
    setHandledNonce(request.nonce)
    setView(viewForRequest(request))
    setFocusIds(request.noteIds.length > 1 ? request.noteIds : null)
  }
  const [revision, setRevision] = useState(0)

  const bookNotes = useNotesList(jobId ? { job_id: jobId, size: 50 } : null, revision)
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
    content = <PanelNewNote key={view.summary ? 'summary' : 'new'} summary={view.summary} onCreated={(id) => { changed(); openNote(id) }} onCancel={() => setView({ kind: 'list' })} />
  } else {
    const paragraphs = firstParagraphs(bookQuotes)
    // По ходу книги: сначала заметки о книге целиком, затем по первому процитированному абзацу.
    const items = (focusIds ? bookNotes.items.filter((note) => focusIds.includes(note.id)) : bookNotes.items)
      .map((note) => ({ note, paragraph: paragraphs.get(note.id) ?? null }))
      .sort((first, second) => (first.paragraph ?? -1) - (second.paragraph ?? -1))
    content = (
      <div className={styles.body}>
        {focusIds ? (
          <div className={styles.focusBar} role="status">
            <span>{t('notesPanel.paragraphNotes', { count: focusIds.length })}</span>
            <button type="button" onClick={() => setFocusIds(null)}>{t('notesPanel.showAllBookNotes')}</button>
          </div>
        ) : null}
        <NotesListBody
          status={bookNotes.status}
          items={items}
          emptyText={t(jobId && document.status === 'ready' ? 'notesPanel.bookEmpty' : 'notesPanel.noBook')}
          onOpen={openNote}
          onRetry={() => setRevision((value) => value + 1)}
        />
      </div>
    )
  }

  return (
    <div className={styles.panel} role="complementary" aria-label={t('notes.title')}>
      <header className={styles.header}>
        <div className={styles.title}>
          <h2>{t('notes.title')}</h2>
          {jobId && bookNotes.status === 'ready' ? <span className={styles.count}>{bookNotes.total}</span> : null}
        </div>
        <div className={styles.headerActions}>
          <button type="button" aria-label={t('notesPanel.newNote')} title={t('notesPanel.newNote')} onClick={() => setView({ kind: 'new' })}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
          </button>
          <Link to="/notes" aria-label={t('notesPanel.openSection')} title={t('notesPanel.openSection')}>
            {/* Стрелка «наружу»: полная работа с заметками — в своём разделе. */}
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 3h4v4M13 3 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" /></svg>
          </Link>
          <button type="button" aria-label={t('notes.close')} title={t('notes.close')} onClick={onClose}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </div>
      </header>
      <div className={styles.section}>{content}</div>
    </div>
  )
}

function NotesListBody({ status, items, emptyText, onOpen, onRetry }: {
  status: string
  items: { note: NoteSummary; paragraph: number | null }[]
  emptyText: string
  onOpen: (id: string) => void
  onRetry: () => void
}) {
  const { t } = useTranslation()
  if (status === 'loading') return <p className={styles.muted} role="status">{t('notes.loading')}</p>
  if (status === 'error') {
    return (
      <div className={styles.problemBox} role="alert">
        <span>{t('notes.loadError')}</span>
        <button type="button" className={styles.secondary} onClick={onRetry}>{t('notes.retry')}</button>
      </div>
    )
  }
  if (!items.length) return <p className={styles.muted}>{emptyText}</p>
  return (
    <ul className={styles.list}>
      {items.map(({ note, paragraph }) => (
        <li key={note.id}>
          <button type="button" className={styles.item} onClick={() => onOpen(note.id)}>
            {/* Номер абзаца — нумерация с единицы, как у меток; у заметки о книге — значок тетради. */}
            <span className={styles.paragraph} aria-label={paragraph === null ? t('notesPanel.aboutBook') : t('notesPanel.paragraphLabel', { number: paragraph + 1 })}>
              {paragraph === null ? '§' : `¶${paragraph + 1}`}
            </span>
            <span className={styles.itemText}>
              <strong>{note.title}</strong>
              {note.excerpt ? <span>{plainExcerpt(note.excerpt)}</span> : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Новая заметка без цитаты: общий блокнот доступен и рядом с книгой (в колонке и на полях). */
export interface NewNoteSummary {
  jobId: string
  /** Название по умолчанию: «Конспект — …». */
  title: string
}

export function PanelNewNote({ onCreated, onCancel, summary }: {
  onCreated: (id: string) => void
  onCancel: () => void
  /** Конспект книги: заметка сразу привязана к ней (`job_ids`), а не к абзацу. */
  summary?: NewNoteSummary
}) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const { drafts } = useNotes()
  // У конспекта своя ячейка черновика: начатая обычная заметка не смешивается с ним.
  const draftKey = summary ? `new:summary:${summary.jobId}` : 'new:'
  const [draft] = useState(() => drafts.get(draftKey))
  const [isSaving, setSaving] = useState(false)
  const [error, setError] = useState<NoteErrorMessage | null>(null)
  return (
    <div className={styles.body}>
      <NoteEditor
        initialTitle={draft?.title ?? summary?.title ?? ''}
        initialBody={draft?.body ?? ''}
        knownLinks={[]}
        submitLabel={t('notes.create')}
        isSaving={isSaving}
        error={error}
        compact
        autoFocus={summary ? 'body' : 'title'}
        onChange={(title, body) => {
          if ((!title.trim() || title === summary?.title) && !body) drafts.clear(draftKey)
          else drafts.set(draftKey, { title, body, baseVersion: null })
        }}
        onSubmit={(title, body) => {
          const token = session?.accessToken
          if (!token) return
          setSaving(true)
          setError(null)
          createNote({ title, body, ...(summary ? { job_ids: [summary.jobId] } : {}) }, { accessToken: token }).then((note) => {
            drafts.clear(draftKey)
            onCreated(note.id)
          }, (caught: unknown) => {
            setError(noteErrorMessage(caught))
            setSaving(false)
          })
        }}
        onCancel={() => { drafts.clear(draftKey); onCancel() }}
      />
    </div>
  )
}
