import { useEffect, useState } from 'react'
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
import { NoteEditor } from './NoteEditor.tsx'
import { PanelNoteView, type ShowQuoteResult } from './PanelNoteView.tsx'
import { QuoteComposer } from './QuoteComposer.tsx'
import styles from './WorkspaceNotesPanel.module.css'

type PanelView = { kind: 'list' } | { kind: 'note'; id: string } | { kind: 'new' }

interface WorkspaceNotesPanelProps {
  document: DocumentItem
  /** Выделение, которое пользователь отправил «В заметку»; `null` — цитата не добавляется. */
  pendingQuote: QuoteSelection | null
  onQuoteFinished: () => void
  onShowQuote: (quote: NoteQuoteResponse) => ShowQuoteResult
  onClose: () => void
}

/**
 * Заметки рядом с книгой: заметки с цитатами из неё, все заметки, просмотр и
 * правка без ухода со страницы, добавление цитаты из выделения. Те же заметки,
 * что в разделе «Заметки», — панель лишь показывает их в контексте книги.
 */
export function WorkspaceNotesPanel({ document, pendingQuote, onQuoteFinished, onShowQuote, onClose }: WorkspaceNotesPanelProps) {
  const { t } = useTranslation()
  const { notesChanged } = useNotes()
  const jobId = document.jobId ?? null
  const [view, setView] = useState<PanelView>({ kind: 'list' })
  const [tab, setTab] = useState<'book' | 'all'>(jobId ? 'book' : 'all')
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
    const list = tab === 'book' ? bookNotes : allNotes
    content = (
      <div className={styles.body}>
        <div className={styles.listTools}>
          {jobId ? (
            <div className={styles.tabs} role="tablist" aria-label={t('notes.title')}>
              {(['book', 'all'] as const).map((value) => (
                <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>
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
          <button type="button" className={styles.primary} onClick={() => setView({ kind: 'new' })}>＋ {t('notes.newTitle')}</button>
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

  return (
    <aside className={styles.panel} aria-label={t('notes.title')}>
      <header className={styles.header}>
        <div>
          <h2>{t('notes.title')}</h2>
          {jobId && bookNotes.status === 'ready' ? <span>{t('notesPanel.bookSubtitle', { count: bookNotes.total })}</span> : null}
        </div>
        <button type="button" aria-label={t('notes.close')} onClick={onClose}>×</button>
      </header>
      {content}
    </aside>
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
