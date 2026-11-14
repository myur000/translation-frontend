import { useEffect, useState } from 'react'
import type { NoteQuoteRequest, NoteSummary } from '../../api/contracts/notes.ts'
import { loadDocumentText } from '../../api/documentText.ts'
import { addNoteQuote, createNote } from '../../api/notes.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { noteErrorMessage, type NoteErrorMessage } from '../../notes/noteErrors.ts'
import { NOTE_TITLE_MAX_LENGTH, noteTitleProblem, titleFromQuote } from '../../notes/noteSyntax.ts'
import { NOTES_SEARCH_DELAY_MS } from '../../notes/notesQuery.ts'
import { locateQuote, type QuoteLocation, type QuoteSelection } from '../../notes/quoteLocator.ts'
import { useNotesList } from '../../notes/useNotesList.ts'
import { NoteErrorText } from './NoteErrorText.tsx'
import styles from './WorkspaceNotesPanel.module.css'

interface QuoteComposerProps {
  jobId: string
  selection: QuoteSelection
  /** Заметки этой книги — первые кандидаты, куда добавить цитату. */
  bookNotes: NoteSummary[]
  onSaved: (noteId: string) => void
  onCancel: () => void
}

/** Цитата из выделения: найти абзац, затем сохранить в новую или существующую заметку. */
export function QuoteComposer({ jobId, selection, bookNotes, onSaved, onCancel }: QuoteComposerProps) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const [location, setLocation] = useState<QuoteLocation | { status: 'locating' | 'failed' }>({ status: 'locating' })
  const [title, setTitle] = useState(() => titleFromQuote(selection.text))
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [isSaving, setSaving] = useState(false)
  const [error, setError] = useState<NoteErrorMessage | null>(null)

  useEffect(() => {
    const token = session?.accessToken
    if (!token) return
    let active = true
    loadDocumentText(jobId, { accessToken: token }).then(
      (text) => { if (active) setLocation(locateQuote(selection, text)) },
      () => { if (active) setLocation({ status: 'failed' }) },
    )
    return () => { active = false }
    // Абзац ищется один раз для этого выделения: компонент монтируется заново на каждое.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), NOTES_SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [search])
  const found = useNotesList(query ? { q: query, size: 8 } : { size: 8 }, 0)
  // Без поиска сначала заметки этой книги, затем недавние остальные.
  const candidates = query ? found.items
    : [...bookNotes, ...found.items.filter((item) => !bookNotes.some((known) => known.id === item.id))].slice(0, 8)

  const quote: NoteQuoteRequest | null = location.status === 'found' ? { ...location.quote, job_id: jobId } : null
  const titleProblem = noteTitleProblem(title)

  const run = async (operation: (token: string, payload: NoteQuoteRequest) => Promise<string>) => {
    const token = session?.accessToken
    if (!token || !quote || isSaving) return
    setSaving(true)
    setError(null)
    try {
      onSaved(await operation(token, quote))
    } catch (caught) {
      setError(noteErrorMessage(caught))
      setSaving(false)
    }
  }

  return (
    <div className={styles.composer}>
      <section className={styles.quotePreview} aria-label={t('quote.title')}>
        <h3>{t('quote.title')} · {t(selection.side === 'SOURCE' ? 'panel.original' : 'panel.translation')}</h3>
        <blockquote>{quote?.quote ?? selection.text.trim()}</blockquote>
        {quote?.paired_text ? <p className={styles.paired}>{quote.paired_text}</p> : null}
        {location.status === 'locating' ? <p className={styles.muted} role="status">{t('quote.locating')}</p> : null}
        {location.status === 'found' && location.truncated ? <p className={styles.muted}>{t('quote.truncated')}</p> : null}
        {location.status === 'notFound' || location.status === 'sourceRemoved' || location.status === 'failed' ? (
          <p className={styles.problem} role="alert">
            {t(location.status === 'notFound' ? 'quote.notFound' : location.status === 'sourceRemoved' ? 'quote.sourceRemoved' : 'quote.loadFailed')}
          </p>
        ) : null}
      </section>

      {error ? <p className={styles.problem} role="alert"><NoteErrorText message={error} /></p> : null}

      <form
        className={styles.composerSection}
        onSubmit={(event) => {
          event.preventDefault()
          if (titleProblem) return
          void run(async (token, payload) => (await createNote({ title: title.trim(), body: '', quote: payload }, { accessToken: token })).id)
        }}
      >
        <h3>{t('quote.newNote')}</h3>
        <input
          value={title}
          maxLength={NOTE_TITLE_MAX_LENGTH + 20}
          aria-label={t('notes.titleLabel')}
          aria-invalid={titleProblem ? true : undefined}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        {titleProblem && titleProblem !== 'empty'
          ? <span className={styles.problem}>{t(`notes.titleProblem.${titleProblem}`, { max: NOTE_TITLE_MAX_LENGTH })}</span> : null}
        <button type="submit" className={styles.primary} disabled={!quote || Boolean(titleProblem) || isSaving}>
          {isSaving ? t('quote.saving') : t('quote.create')}
        </button>
      </form>

      <section className={styles.composerSection}>
        <h3>{t('quote.toExisting')}</h3>
        <input
          type="search"
          value={search}
          placeholder={t('quote.searchNotes')}
          aria-label={t('quote.searchNotes')}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        {candidates.length ? (
          <ul className={styles.candidates}>
            {candidates.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  disabled={!quote || isSaving}
                  onClick={() => void run(async (token, payload) => {
                    await addNoteQuote(note.id, payload, { accessToken: token })
                    return note.id
                  })}
                >
                  <span>{note.title}</span>
                  {note.quote_count ? <small>{t('notes.quoteCount', { count: note.quote_count })}</small> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : found.status === 'ready' ? <p className={styles.muted}>{t('quote.noNotes')}</p> : null}
      </section>

      <button type="button" className={styles.secondary} onClick={onCancel} disabled={isSaving}>{t('common.cancel')}</button>
    </div>
  )
}
